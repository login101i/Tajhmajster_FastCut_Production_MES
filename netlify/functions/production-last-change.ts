import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import {
  MIN_PRODUCTION_ORDER_ID,
  ORDER_STATE_ON_PRODUCTION,
} from '../../config/project';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

type GroupAggPacket = RowDataPacket & {
  groupId: number;
  stampSum: number | string | null;
  qtySum: number | string | null;
};

type ModPacket = RowDataPacket & {
  ordersModUnix: number | string | null;
};

/**
 * GET /api/production-last-change?minId=
 *
 * Lightweight poll fingerprint + per-group stamp sums so the client can
 * sync ONLY the mothers whose checklist changed (not every group).
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

  const minId =
    parseInt(event.queryStringParameters?.minId || '', 10) || MIN_PRODUCTION_ORDER_ID;

  try {
    const payload = await withConnection(async (conn) => {
      const [groupRows] = await conn.query<GroupAggPacket[]>(
        `
        SELECT
          o.Id AS groupId,
          COALESCE(SUM(cl.QuantityStamp), 0) AS stampSum,
          COALESCE(SUM(cl.Quantity), 0) AS qtySum
        FROM Orders o
        LEFT JOIN ProductionsSocketsCheckLists cl ON cl.IdOrder = o.Id
        WHERE IFNULL(o.DeletedFlag, 0) = 0
          AND IFNULL(o.IsGroupOrder, 0) = 1
          AND o.State = ?
          AND o.Id >= ?
        GROUP BY o.Id
        ORDER BY o.Id DESC
        `,
        [ORDER_STATE_ON_PRODUCTION, minId],
      );

      const [modRows] = await conn.query<ModPacket[]>(
        `
        SELECT UNIX_TIMESTAMP(MAX(o.DateMod)) AS ordersModUnix
        FROM Orders o
        WHERE IFNULL(o.DeletedFlag, 0) = 0
          AND o.Id >= ?
          AND (
            o.State = ?
            OR CAST(IFNULL(NULLIF(TRIM(CAST(o.ProductionPrc AS CHAR)), ''), '0') AS DECIMAL(12,4)) > 0
          )
        `,
        [minId, ORDER_STATE_ON_PRODUCTION],
      );

      const groups = groupRows.map((g) => ({
        groupId: Number(g.groupId),
        stampSum: Number(g.stampSum) || 0,
        qtySum: Number(g.qtySum) || 0,
      }));

      const stampSum = groups.reduce((s, g) => s + g.stampSum, 0);
      const qtySum = groups.reduce((s, g) => s + g.qtySum, 0);
      const ordersModUnix = Number(modRows[0]?.ordersModUnix) || 0;
      const groupsPart = groups.map((g) => `${g.groupId}:${g.stampSum}:${g.qtySum}`).join('|');
      const version = `${groupsPart}#${ordersModUnix}`;

      return {
        success: true,
        minId,
        version,
        stampSum,
        qtySum,
        checklistRows: groups.length,
        ordersModUnix,
        groups,
        checkedAt: new Date().toISOString(),
      };
    });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(payload),
    };
  } catch (error) {
    console.error('production-last-change error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
