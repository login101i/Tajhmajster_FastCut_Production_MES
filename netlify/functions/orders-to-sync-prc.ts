import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import {
  MIN_PRODUCTION_ORDER_ID,
  ORDER_STATE_ON_PRODUCTION,
  SYNC_PRODUCTIONS_FROM_DATE,
} from '../../config/project';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

type OrderLite = RowDataPacket & {
  Id: number;
  Description?: string | null;
  FormName?: string | null;
  ProductionPrc?: string | number | null;
  State?: number | null;
  IsGroupOrder?: number | null;
  IdParent?: number | null;
};

/**
 * GET /api/orders-to-sync-prc?from=&minId=
 * Defaults from config/project.ts
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

  const rawFromParam = (event.queryStringParameters?.from || '').trim();
  const rawFromConfig = (SYNC_PRODUCTIONS_FROM_DATE || '').trim();
  const rawFrom = rawFromParam || rawFromConfig;
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : '';
  const minId =
    parseInt(event.queryStringParameters?.minId || '', 10) || MIN_PRODUCTION_ORDER_ID;

  try {
    const result = await withConnection(async (conn) => {
      const where = [
        'IFNULL(o.DeletedFlag, 0) = 0',
        'IFNULL(o.IsGroupOrder, 0) = 1',
        'o.State = ?',
        'o.Id >= ?',
      ];
      const values: unknown[] = [ORDER_STATE_ON_PRODUCTION, minId];

      // Optional: only mothers with Productions.DateAdd >= from
      if (fromDate) {
        where.push(`EXISTS (
          SELECT 1 FROM Productions p
          WHERE p.OrderId = o.Id AND p.DateAdd >= ?
        )`);
        values.push(`${fromDate} 00:00:00`);
      }

      const [mothers] = await conn.query<OrderLite[]>(
        `
        SELECT
          o.Id,
          o.Description,
          o.FormName,
          o.ProductionPrc,
          o.State,
          o.IsGroupOrder,
          o.IdParent
        FROM Orders o
        WHERE ${where.join(' AND ')}
        ORDER BY o.Id DESC
        `,
        values,
      );

      const motherIds = mothers.map((m) => Number(m.Id));
      const childrenByParent = new Map<number, OrderLite[]>();

      if (motherIds.length > 0) {
        const [children] = await conn.query<OrderLite[]>(
          `
          SELECT
            o.Id,
            o.Description,
            o.FormName,
            o.ProductionPrc,
            o.State,
            o.IsGroupOrder,
            o.IdParent
          FROM Orders o
          WHERE IFNULL(o.DeletedFlag, 0) = 0
            AND o.IdParent IN (${motherIds.map(() => '?').join(',')})
          ORDER BY o.Id ASC
          `,
          motherIds,
        );

        for (const child of children) {
          const parent = Number(child.IdParent) || 0;
          const list = childrenByParent.get(parent) || [];
          list.push(child);
          childrenByParent.set(parent, list);
        }
      }

      const groups = mothers.map((m) => {
        const groupId = Number(m.Id);
        const kids = childrenByParent.get(groupId) || [];
        return {
          groupId,
          mother: {
            id: groupId,
            description: m.Description || m.FormName || '',
            productionPrc: m.ProductionPrc ?? null,
            state: Number(m.State) || 0,
          },
          children: kids.map((c) => ({
            id: Number(c.Id),
            description: c.Description || c.FormName || '',
            productionPrc: c.ProductionPrc ?? null,
            state: Number(c.State) || 0,
          })),
        };
      });

      return { from: fromDate, minId, groups };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    console.error('orders-to-sync-prc error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
