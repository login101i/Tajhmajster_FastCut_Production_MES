import type { Handler } from '@netlify/functions';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { assertMonitorAccess, corsHeaders } from './_lib/auth';
import { withConnection } from './_lib/db';

/**
 * Sync / preview child Orders.ProductionPrc from scanned FullPartList pieces.
 *
 * Link: ProductionsSocketsCheckLists.IdJoin (or Symbol) → OrdersPieces.Id
 * Child: OrdersPieces.IdOrderParent
 * Formula per child: SUM(QuantityStamp) / SUM(Quantity) * 100
 *
 * For groups in CHILD_PRODUCTIONS_GROUP_IDS (e.g. 9124) when
 * ?createChildProductions=1: ensure each child has a Productions row for
 * Symbol TAJHMAJSTER _KOMISIONIRANJE and keep ProductionPercent in sync.
 * Only if mother already has that path. Mother Productions row untouched.
 *
 * ?dryRun=1 — only compute stats, do not UPDATE Orders / Productions
 * GET|POST /api/sync-group-children-prc?groupId=9124&createChildProductions=1
 */

/** Test groups: create/update child Productions rows on sync (not mother). */
const CHILD_PRODUCTIONS_GROUP_IDS = new Set([9124]);

/** Only clone/sync this production path for children. */
const CHILD_PRODUCTIONS_SYMBOL = 'TAJHMAJSTER _KOMISIONIRANJE';

function generateProductionIdUnique(): string {
  return 'ZT' + Math.random().toString(36).substring(2, 17).toUpperCase();
}

function formatSqlDateTime(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const auth = assertMonitorAccess(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers: corsHeaders, body: auth.body };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  const groupId = parseInt(event.queryStringParameters?.groupId || '', 10);
  const dryRun =
    event.queryStringParameters?.dryRun === '1' ||
    event.queryStringParameters?.dryRun === 'true';
  const createChildProductions =
    event.queryStringParameters?.createChildProductions === '1' ||
    event.queryStringParameters?.createChildProductions === 'true';

  if (!groupId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Missing groupId' }),
    };
  }

  try {
    const result = await withConnection(async (conn) => {
      const [motherRows] = await conn.query<RowDataPacket[]>(
        `SELECT Id, IsGroupOrder, ProductionPrc
         FROM Orders
         WHERE Id = ? AND IFNULL(DeletedFlag, 0) = 0
         LIMIT 1`,
        [groupId],
      );
      const mother = motherRows[0];
      if (!mother) {
        throw Object.assign(new Error(`Order ${groupId} not found`), { statusCode: 404 });
      }

      // Checklist rows for mother + piece → child mapping (IdJoin or Symbol as piece id)
      const [lines] = await conn.query<RowDataPacket[]>(
        `
        SELECT
          cl.Id AS CheckListId,
          cl.Symbol,
          cl.IdJoin,
          cl.Quantity,
          cl.QuantityStamp,
          COALESCE(
            NULLIF(op_join.IdOrderParent, 0),
            NULLIF(op_sym.IdOrderParent, 0)
          ) AS ChildOrderId,
          COALESCE(op_join.Id, op_sym.Id) AS PieceId
        FROM ProductionsSocketsCheckLists cl
        LEFT JOIN OrdersPieces op_join ON op_join.Id = cl.IdJoin
        LEFT JOIN OrdersPieces op_sym
          ON op_sym.Id = CAST(NULLIF(TRIM(cl.Symbol), '') AS UNSIGNED)
         AND CAST(NULLIF(TRIM(cl.Symbol), '') AS UNSIGNED) > 0
        WHERE cl.IdOrder = ?
        ORDER BY cl.Id ASC
        `,
        [groupId],
      );

      const byChild = new Map<number, { stamped: number; total: number; rows: number }>();
      let motherStamped = 0;
      let motherTotal = 0;

      for (const line of lines) {
        const qty = Number(line.Quantity) || 0;
        const stamp = Number(line.QuantityStamp) || 0;
        motherStamped += stamp;
        motherTotal += qty;

        const childId = Number(line.ChildOrderId) || 0;
        if (!childId) continue;

        const prev = byChild.get(childId) || { stamped: 0, total: 0, rows: 0 };
        prev.stamped += stamp;
        prev.total += qty;
        prev.rows += 1;
        byChild.set(childId, prev);
      }

      const [childOrders] = await conn.query<RowDataPacket[]>(
        `
        SELECT Id, ProductionPrc, OwnNumber, Description
        FROM Orders
        WHERE IdParent = ? AND IFNULL(DeletedFlag, 0) = 0
        ORDER BY Id ASC
        `,
        [groupId],
      );

      const updates: Array<{
        childId: number;
        previousPrc: string | number | null;
        productionPrc: string;
        stamped: number;
        totalQty: number;
        pieceRows: number;
      }> = [];

      for (const child of childOrders) {
        const childId = Number(child.Id);
        const stats = byChild.get(childId) || { stamped: 0, total: 0, rows: 0 };
        const pct =
          stats.total > 0
            ? Math.min(100, Math.max(0, (stats.stamped / stats.total) * 100))
            : 0;
        const formatted = pct.toFixed(2);

        if (!dryRun) {
          await conn.query<ResultSetHeader>(
            'UPDATE Orders SET ProductionPrc = ? WHERE Id = ?',
            [formatted, childId],
          );
        }

        updates.push({
          childId,
          previousPrc: child.ProductionPrc as string | number | null,
          productionPrc: formatted,
          stamped: stats.stamped,
          totalQty: stats.total,
          pieceRows: stats.rows,
        });
      }

      const productions: Array<{
        childId: number;
        productionId: number | null;
        action: 'updated' | 'inserted' | 'skipped';
        productionPercent: string;
      }> = [];

      if (
        !dryRun &&
        createChildProductions &&
        CHILD_PRODUCTIONS_GROUP_IDS.has(groupId) &&
        updates.length > 0
      ) {
        const [motherProdRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM Productions
           WHERE OrderId = ? AND Symbol = ?
           ORDER BY Id ASC
           LIMIT 1`,
          [groupId, CHILD_PRODUCTIONS_SYMBOL],
        );
        const template = motherProdRows[0];

        if (template) {
          const now = formatSqlDateTime();

          for (const u of updates) {
            const pctNum = Number(u.productionPrc);
            const [existingRows] = await conn.query<RowDataPacket[]>(
              `SELECT Id FROM Productions
               WHERE OrderId = ? AND Symbol = ?
               ORDER BY Id ASC
               LIMIT 1`,
              [u.childId, CHILD_PRODUCTIONS_SYMBOL],
            );
            const existing = existingRows[0];

            if (existing) {
              await conn.query<ResultSetHeader>(
                `UPDATE Productions SET ProductionPercent = ?
                 WHERE OrderId = ? AND Symbol = ?`,
                [pctNum, u.childId, CHILD_PRODUCTIONS_SYMBOL],
              );
              productions.push({
                childId: u.childId,
                productionId: Number(existing.Id),
                action: 'updated',
                productionPercent: u.productionPrc,
              });
              continue;
            }

            const [ins] = await conn.query<ResultSetHeader>(
              `
              INSERT INTO Productions
                (IdUnique, DateAdd, UserIdAdd, OrderId, OrderGroupId, IdMaterial, OperationsScheme,
                 Symbol, Description, \`Groups\`, \`SubGroups\`, \`SubSubGroups\`, Comment,
                 ProductionState, ProductionPercent, ProductionTimePlannedStart, ProductionTimePlannedStop,
                 ProductionTimeStart, ProductionTimeStop, SocketOperationId, ProductionOperationsFlags,
                 ProductionGroup, NotPieces)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                generateProductionIdUnique(),
                now,
                Number(template.UserIdAdd) || 0,
                u.childId,
                groupId,
                Number(template.IdMaterial) || 0,
                String(template.OperationsScheme ?? '0000000000'),
                CHILD_PRODUCTIONS_SYMBOL,
                '',
                '',
                '',
                '',
                null,
                0,
                pctNum,
                null,
                null,
                null,
                null,
                '',
                String(template.ProductionOperationsFlags ?? '0000000000'),
                0,
                0,
              ],
            );

            productions.push({
              childId: u.childId,
              productionId: Number(ins.insertId) || null,
              action: 'inserted',
              productionPercent: u.productionPrc,
            });
          }
        }
      }

      return {
        groupId,
        dryRun,
        createChildProductions,
        motherProductionPrc: mother.ProductionPrc,
        motherStamped,
        motherTotalQty: motherTotal,
        children: updates,
        productions,
        checklist: lines,
        syncedAt: new Date().toISOString(),
      };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    console.error('sync-group-children-prc error:', error);
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode: number }).statusCode) || 500
        : 500;
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
