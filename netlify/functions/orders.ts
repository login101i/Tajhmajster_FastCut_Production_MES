import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

type OrderPacket = RowDataPacket & {
  Id: number;
  IsGroupOrder?: number | null;
  IdParent?: number | null;
};

/**
 * GET /api/orders
 * Query: state (default 4 = realizacja), limit (default 200), q (search)
 *
 * NEVER average children into mother — each Orders.Id has its own ProductionPrc.
 * After the main list, always attach children of group mothers (and missing mothers).
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const auth = assertMonitorAccess(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers: corsHeaders, body: auth.body };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const stateRaw = params.state === undefined ? '4' : params.state;
    const states = stateRaw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    const limit = Math.min(Math.max(parseInt(params.limit || '200', 10) || 200, 1), 500);
    const q = (params.q || '').trim();

    const orders = await withConnection(async (conn) => {
      const where: string[] = ['IFNULL(o.DeletedFlag, 0) = 0'];
      const values: unknown[] = [];

      if (states.length === 1) {
        where.push('o.State = ?');
        values.push(states[0]);
      } else if (states.length > 1) {
        where.push(`o.State IN (${states.map(() => '?').join(',')})`);
        values.push(...states);
      }

      if (q) {
        where.push(
          '(CAST(o.Id AS CHAR) LIKE ? OR o.Description LIKE ? OR o.OwnNumber LIKE ? OR o.CompanyName LIKE ? OR o.FormName LIKE ?)',
        );
        const like = `%${q}%`;
        values.push(like, like, like, like, like);
      }

      values.push(limit);

      const selectCols = `
          o.Id,
          o.OwnNumber,
          o.Description,
          o.CompanyName,
          o.FormName,
          o.State,
          o.DateGeneration,
          o.DateExecution,
          o.ProductionPrc,
          o.IsGroupOrder,
          o.IdParent,
          o.PriorityStr,
          o.MaterialsSymbols
      `;

      const [rows] = await conn.query<OrderPacket[]>(
        `
        SELECT ${selectCols}
        FROM Orders o
        WHERE ${where.join(' AND ')}
        ORDER BY o.Id DESC
        LIMIT ?
        `,
        values,
      );

      const byId = new Map<number, OrderPacket>();
      for (const row of rows) byId.set(Number(row.Id), row);

      const motherIds = new Set<number>();
      const missingParentIds = new Set<number>();

      for (const row of byId.values()) {
        if (Number(row.IsGroupOrder) === 1) {
          motherIds.add(Number(row.Id));
        }
        const parent = Number(row.IdParent) || 0;
        if (parent && !byId.has(parent)) {
          missingParentIds.add(parent);
        }
      }

      // Fetch missing mothers referenced by children already in the list
      if (missingParentIds.size > 0) {
        const ids = [...missingParentIds];
        const [mothers] = await conn.query<OrderPacket[]>(
          `
          SELECT ${selectCols}
          FROM Orders o
          WHERE IFNULL(o.DeletedFlag, 0) = 0
            AND o.Id IN (${ids.map(() => '?').join(',')})
          `,
          ids,
        );
        for (const m of mothers) {
          byId.set(Number(m.Id), m);
          if (Number(m.IsGroupOrder) === 1) motherIds.add(Number(m.Id));
        }
      }

      // Fetch all children of group mothers (even if they did not match state/limit)
      if (motherIds.size > 0) {
        const ids = [...motherIds];
        const [children] = await conn.query<OrderPacket[]>(
          `
          SELECT ${selectCols}
          FROM Orders o
          WHERE IFNULL(o.DeletedFlag, 0) = 0
            AND o.IdParent IN (${ids.map(() => '?').join(',')})
          ORDER BY o.Id ASC
          `,
          ids,
        );
        for (const child of children) {
          byId.set(Number(child.Id), child);
        }
      }

      return [...byId.values()].sort((a, b) => Number(b.Id) - Number(a.Id));
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, orders }),
    };
  } catch (error) {
    console.error('orders function error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
