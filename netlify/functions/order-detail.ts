import type { Handler } from '@netlify/functions';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

/**
 * GET /api/order-detail?id=123
 * Returns order + group siblings + production paths + sockets (with %).
 * Mother and each child keep separate ProductionPrc / sockets.
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

  const id = parseInt(event.queryStringParameters?.id || '', 10);
  if (!id) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Missing id' }),
    };
  }

  try {
    const payload = await withConnection(async (conn) => {
      const [orderRows] = await conn.query(
        `
        SELECT
          o.Id, o.OwnNumber, o.Description, o.CompanyName, o.FormName,
          o.State, o.DateGeneration, o.DateExecution, o.ProductionPrc,
          o.IsGroupOrder, o.IdParent, o.PriorityStr, o.MaterialsSymbols
        FROM Orders o
        WHERE o.Id = ? AND IFNULL(o.DeletedFlag, 0) = 0
        LIMIT 1
        `,
        [id],
      );
      const order = (orderRows as Array<Record<string, unknown>>)[0];
      if (!order) return null;

      const motherId =
        Number(order.IsGroupOrder) === 1
          ? Number(order.Id)
          : Number(order.IdParent) || Number(order.Id);

      const [groupRows] = await conn.query(
        `
        SELECT
          o.Id, o.OwnNumber, o.Description, o.CompanyName, o.FormName,
          o.State, o.ProductionPrc, o.IsGroupOrder, o.IdParent
        FROM Orders o
        WHERE IFNULL(o.DeletedFlag, 0) = 0
          AND (o.Id = ? OR o.IdParent = ?)
        ORDER BY o.IsGroupOrder DESC, o.Id ASC
        `,
        [motherId, motherId],
      );

      const [productions] = await conn.query(
        `SELECT * FROM Productions WHERE OrderId = ? ORDER BY Id ASC`,
        [id],
      );

      const [sockets] = await conn.query(
        `
        SELECT *
        FROM ProductionsSockets
        WHERE OrderId = ?
        ORDER BY ProductionId ASC, OrderIndex ASC, Id ASC
        `,
        [id],
      );

      return {
        order,
        group: groupRows,
        productions,
        sockets,
      };
    });

    if (!payload) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Order not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, ...payload }),
    };
  } catch (error) {
    console.error('order-detail function error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
