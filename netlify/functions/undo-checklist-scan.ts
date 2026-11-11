import type { Handler } from '@netlify/functions';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  MIN_PRODUCTION_ORDER_ID,
  ORDER_STATE_ON_PRODUCTION,
} from '../../config/project';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

type ChecklistRow = RowDataPacket & {
  Id: number;
  IdOrder: number;
  IdJoin: number;
  Symbol: string | null;
  Description: string | null;
  Quantity: number | string;
  QuantityStamp: number | string;
  BarCode1: string | null;
};

/**
 * GET  /api/undo-checklist-scan?limit=7&minId=
 *   → ostatnie sformatki z QuantityStamp > 0 (przybliżenie „ostatnio skanowanych”;
 *     tabela nie ma timestampu skanu — sort po Id DESC checklisty).
 *
 * POST /api/undo-checklist-scan  { "idJoin": 603072 }
 *   → QuantityStamp = max(0, QuantityStamp - 1) dla wiersza z tym IdJoin
 *     (pierwszy z QuantityStamp > 0, najwyższe Id).
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const auth = assertMonitorAccess(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers: corsHeaders, body: auth.body };
  }

  if (event.httpMethod === 'GET') {
    const limit = Math.min(
      20,
      Math.max(1, parseInt(event.queryStringParameters?.limit || '7', 10) || 7),
    );
    const minId =
      parseInt(event.queryStringParameters?.minId || '', 10) || MIN_PRODUCTION_ORDER_ID;
    const groupIdsRaw = event.queryStringParameters?.groupIds || '';
    const groupIds = groupIdsRaw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    try {
      const items = await withConnection(async (conn) => {
        const params: Array<number | string> = [];
        let whereGroup = '';
        if (groupIds.length > 0) {
          whereGroup = `AND cl.IdOrder IN (${groupIds.map(() => '?').join(',')})`;
          params.push(...groupIds);
        } else {
          whereGroup = `
            AND IFNULL(o.IsGroupOrder, 0) = 1
            AND o.State = ?
            AND o.Id >= ?
          `;
          params.push(ORDER_STATE_ON_PRODUCTION, minId);
        }
        params.push(limit);

        const [rows] = await conn.query<ChecklistRow[]>(
          `
          SELECT
            cl.Id,
            cl.IdOrder,
            cl.IdJoin,
            cl.Symbol,
            cl.Description,
            cl.Quantity,
            cl.QuantityStamp,
            cl.BarCode1
          FROM ProductionsSocketsCheckLists cl
          INNER JOIN Orders o ON o.Id = cl.IdOrder
          WHERE IFNULL(o.DeletedFlag, 0) = 0
            AND cl.QuantityStamp > 0
            AND cl.IdJoin IS NOT NULL
            AND cl.IdJoin > 0
            ${whereGroup}
          ORDER BY cl.Id DESC
          LIMIT ?
          `,
          params,
        );

        return rows.map((r) => ({
          checkListId: Number(r.Id),
          idOrder: Number(r.IdOrder),
          idJoin: Number(r.IdJoin),
          symbol: String(r.Symbol || ''),
          description: String(r.Description || ''),
          quantity: Number(r.Quantity) || 0,
          quantityStamp: Number(r.QuantityStamp) || 0,
          barCode1: String(r.BarCode1 || ''),
        }));
      });

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
        body: JSON.stringify({ success: true, items, checkedAt: new Date().toISOString() }),
      };
    } catch (error) {
      console.error('undo-checklist-scan GET error:', error);
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: message }),
      };
    }
  }

  if (event.httpMethod === 'POST') {
    let idJoin = 0;
    try {
      const body = JSON.parse(event.body || '{}') as { idJoin?: number | string };
      idJoin = parseInt(String(body.idJoin ?? ''), 10);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      };
    }

    if (!Number.isFinite(idJoin) || idJoin <= 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'idJoin required (positive number)' }),
      };
    }

    try {
      const result = await withConnection(async (conn) => {
        const [rows] = await conn.query<ChecklistRow[]>(
          `
          SELECT
            Id, IdOrder, IdJoin, Symbol, Description,
            Quantity, QuantityStamp, BarCode1
          FROM ProductionsSocketsCheckLists
          WHERE IdJoin = ?
            AND QuantityStamp > 0
          ORDER BY Id DESC
          LIMIT 1
          `,
          [idJoin],
        );

        const row = rows[0];
        if (!row) {
          return {
            ok: false as const,
            statusCode: 404,
            error: `Brak skanu do cofnięcia dla IdJoin=${idJoin} (QuantityStamp=0 lub brak wiersza)`,
          };
        }

        const prev = Number(row.QuantityStamp) || 0;
        const next = Math.max(0, prev - 1);
        await conn.query<ResultSetHeader>(
          `UPDATE ProductionsSocketsCheckLists SET QuantityStamp = ? WHERE Id = ? AND QuantityStamp > 0`,
          [next, row.Id],
        );

        return {
          ok: true as const,
          checkListId: Number(row.Id),
          idOrder: Number(row.IdOrder),
          idJoin: Number(row.IdJoin),
          symbol: String(row.Symbol || ''),
          description: String(row.Description || ''),
          previousStamp: prev,
          quantityStamp: next,
          quantity: Number(row.Quantity) || 0,
          barCode1: String(row.BarCode1 || ''),
        };
      });

      if (!result.ok) {
        return {
          statusCode: result.statusCode,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: result.error }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          success: true,
          ...result,
          undoneAt: new Date().toISOString(),
        }),
      };
    } catch (error) {
      console.error('undo-checklist-scan POST error:', error);
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ success: false, error: 'Method not allowed' }),
  };
};
