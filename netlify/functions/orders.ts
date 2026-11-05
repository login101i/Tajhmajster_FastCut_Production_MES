import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { ORDER_STATE_ON_PRODUCTION } from '../../config/project';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

type OrderPacket = RowDataPacket & {
  Id: number;
  IsGroupOrder?: number | null;
  IdParent?: number | null;
};

/** Single (non-group) order with a generated production path. */
const STANDALONE_WITH_PATH_SQL = `(
  IFNULL(o.IsGroupOrder, 0) = 0
  AND IFNULL(o.IdParent, 0) = 0
  AND EXISTS (SELECT 1 FROM Productions p WHERE p.OrderId = o.Id)
)`;

/** Group mother — always listed; children attached below. */
const GROUP_MOTHER_SQL = `IFNULL(o.IsGroupOrder, 0) = 1`;

/**
 * GET /api/orders
 *
 * Show:
 * - all group mothers + all their children (even without Productions)
 * - standalone orders only if they have a Productions path
 *
 * NEVER average children into mother — each Orders.Id has its own ProductionPrc.
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
    const groupId = parseInt(params.groupId || '', 10) || 0;
    const stateRaw = params.state === undefined ? '' : params.state;
    const states = stateRaw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    const limit = Math.min(Math.max(parseInt(params.limit || '200', 10) || 200, 1), 500);
    const q = (params.q || '').trim();
    const rawFrom = (params.fromDate || '').trim();
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : '';
    const minId = parseInt(params.minId || '', 10) || 0;

    const orders = await withConnection(async (conn) => {
      const where: string[] = ['IFNULL(o.DeletedFlag, 0) = 0'];
      const values: unknown[] = [];

      // Production test / single group: mother + all children
      if (groupId > 0) {
        where.push('(o.Id = ? OR o.IdParent = ?)');
        values.push(groupId, groupId);
      } else {
        where.push(`(${GROUP_MOTHER_SQL} OR ${STANDALONE_WITH_PATH_SQL})`);
      }

      // Main list filters (children still attached by mother Id)
      if (fromDate && groupId <= 0) {
        where.push('o.DateGeneration >= ?');
        values.push(`${fromDate} 00:00:00`);
      }
      if (minId > 0 && groupId <= 0) {
        where.push('o.Id >= ?');
        values.push(minId);
        // Monitor: pokaż gdy Realizacja (4) LUB ProductionPrc > 0 (dowolny stan)
        where.push(`(
          o.State = ?
          OR CAST(IFNULL(NULLIF(TRIM(CAST(o.ProductionPrc AS CHAR)), ''), '0') AS DECIMAL(12,4)) > 0
        )`);
        values.push(ORDER_STATE_ON_PRODUCTION);
      }

      // Jawny filtr state=… tylko gdy nie ma minId (np. inne wywołania)
      if (minId <= 0 || groupId > 0) {
        if (states.length === 1) {
          where.push('o.State = ?');
          values.push(states[0]);
        } else if (states.length > 1) {
          where.push(`o.State IN (${states.map(() => '?').join(',')})`);
          values.push(...states);
        }
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
          o.Type,
          o.TypeStr,
          o.State,
          o.OptimizeState,
          o.OnlineState,
          o.OnlineOrderId,
          o.DateGeneration,
          o.DateExecution,
          o.DateMod,
          GREATEST(
            COALESCE(o.DateMod, '1000-01-01 00:00:00'),
            COALESCE(
              (SELECT MAX(p.DateAdd) FROM Productions p WHERE p.OrderId = o.Id),
              '1000-01-01 00:00:00'
            )
          ) AS LastActivityAt,
          o.ProductionPrc,
          o.IsGroupOrder,
          o.IdParent,
          o.PriorityStr,
          o.MaterialsSymbols,
          o.FlagState,
          o.FlagOut,
          o.JobCutFlag,
          o.JobCutNumber,
          o.MaterialsGroupFlag,
          o.MaterialsGroupNumber,
          o.ExportCutFlag,
          o.ExportCutNumber,
          o.CNCCnt,
          o.\`3DGenerateCNCFiles\`
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

      const motherIds = [...byId.values()]
        .filter((row) => Number(row.IsGroupOrder) === 1)
        .map((row) => Number(row.Id));

      // All children of listed group mothers (with or without Productions)
      if (motherIds.length > 0) {
        const [children] = await conn.query<OrderPacket[]>(
          `
          SELECT ${selectCols}
          FROM Orders o
          WHERE IFNULL(o.DeletedFlag, 0) = 0
            AND o.IdParent IN (${motherIds.map(() => '?').join(',')})
          ORDER BY o.Id ASC
          `,
          motherIds,
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
