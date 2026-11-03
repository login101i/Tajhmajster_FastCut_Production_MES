import { Request, Response } from 'express';
import { getPool } from '../database'; // adjust the path to your pool utility
import { assertUserCanOperateProductionSocket } from './usersSockets.controller';
import { invalidateOrdersListCache } from '../utils/ordersListTiming';
import {
  invalidateWastesBySourceOrder,
  markWastesAvailableBySourceOrder,
} from './ordersOptimizeWastes.controller';

function generateProductionIdUnique(): string {
  return 'ZD' + Math.random().toString(36).substring(2, 17).toUpperCase();
}

function formatSqlDateTime(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * When a cutting step (Materials.SocketStateCut=1) reaches 100% on an order
 * in Realization (State=4), mark planned wastes from that source as available.
 */
async function maybeReleaseWastesAfterCutComplete(
  connectionSQL: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  socket: { IdMaterial?: unknown; OrderId?: unknown; ProductionPercent?: unknown },
  socketPercent: number,
): Promise<number> {
  if (socketPercent < 100) return 0;
  const materialId = Number(socket.IdMaterial) || 0;
  const orderId = Number(socket.OrderId) || 0;
  if (!materialId || !orderId) return 0;

  const [matRows] = (await connectionSQL.query(
    'SELECT SocketStateCut FROM Materials WHERE Id = ? LIMIT 1',
    [materialId],
  )) as unknown as [Array<{ SocketStateCut?: number }>];
  if (Number(matRows?.[0]?.SocketStateCut) !== 1) return 0;

  const [orderRows] = (await connectionSQL.query(
    'SELECT State FROM Orders WHERE Id = ? LIMIT 1',
    [orderId],
  )) as unknown as [Array<{ State?: number }>];
  if (Number(orderRows?.[0]?.State) !== 4) return 0;

  return markWastesAvailableBySourceOrder(connectionSQL, orderId);
}

// GET endpoint to fetch productions.
// You can optionally filter by OrderId using a query parameter.
export const fetchProductions = async (req: Request, res: Response) => {
  const { OrderId } = req.query;
  console.log('%cMyProject%cline:7%cOrderId', 'color:#fff;background:#ee6f57;padding:3px;border-radius:2px', 'color:#fff;background:#1f3c88;padding:3px;border-radius:2px', 'color:#fff;background:rgb(89, 61, 67);padding:3px;border-radius:2px', OrderId)
  let query = `SELECT * FROM Productions`;
  const params: any[] = [];
  if (OrderId) {
    query += ` WHERE OrderId = ?`;
    params.push(OrderId);
  }

  console.log('%cMyProject%cline:8%cquery', 'color:#fff;background:#ee6f57;padding:3px;border-radius:2px', 'color:#fff;background:#1f3c88;padding:3px;border-radius:2px', 'color:#fff;background:rgb(118, 77, 57);padding:3px;border-radius:2px', query)

  
  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [rows] = await connectionSQL.query(query, params);
  
    res.status(200).json({ success: true, productions: rows });
  } catch (error) {
    console.error('Error fetching productions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};


export const fetchProductionSockets = async (req: Request, res: Response) => {
  const { OrderId, Id } = req.query;
  console.log(
    '%cMyProject%cline:7%cOrderId',
    'color:#fff;background:#ee6f57;padding:3px;border-radius:2px',
    'color:#fff;background:#1f3c88;padding:3px;border-radius:2px',
    'color:#fff;background:rgb(89, 61, 67);padding:3px;border-radius:2px',
    OrderId ?? Id
  );

  // Base query for the "ProductionsSockets" table
  let query = `SELECT * FROM ProductionsSockets`;
  const params: any[] = [];

  if (Id) {
    query += ` WHERE Id = ?`;
    params.push(Id);
  } else if (OrderId) {
    // If an OrderId was provided, filter by that
    query += ` WHERE OrderId = ?`;
    params.push(OrderId);
  }

  console.log(
    '%cMyProject%cline:8%cquery',
    'color:#fff;background:#ee6f57;padding:3px;border-radius:2px',
    'color:#fff;background:#1f3c88;padding:3px;border-radius:2px',
    'color:#fff;background:rgb(118, 77, 57);padding:3px;border-radius:2px',
    query
  );

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [rows] = await connectionSQL.query(query, params);

    // rows now contains the matching sockets
    res.status(200).json({ success: true, sockets: rows });
  } catch (error) {
    console.error('Error fetching production sockets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) {
      connectionSQL.release();
    }
  }
};

// POST endpoint to insert a new production record.
// The new production record is expected in the request body.
export const insertProduction = async (req: Request, res: Response) => {
  console.log('inserting produciton')
  const {
    IdUnique,
    DateAdd,
    UserIdAdd,
    OrderId,
    OrderGroupId,
    IdMaterial,
    OperationsScheme,
    Symbol,
    Description,
    Groups,
    SubGroups,
    SubSubGroups,
    Comment,
    ProductionState,
    ProductionPercent,
    ProductionTimePlannedStart,
    ProductionTimePlannedStop,
    ProductionTimeStart,
    ProductionTimeStop,
    SocketOperationId,
    ProductionOperationsFlags,
    ProductionGroup,
    NotPieces,
  } = req.body;
  
  // Basic validation – adjust as needed.
  if (!IdUnique || !DateAdd || !UserIdAdd || !OrderId || !IdMaterial || !OperationsScheme || !Symbol) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const query = `
  INSERT INTO Productions
    (IdUnique, DateAdd, UserIdAdd, OrderId, OrderGroupId, IdMaterial, OperationsScheme, Symbol, Description, \`Groups\`, \`SubGroups\`, \`SubSubGroups\`, Comment, ProductionState, ProductionPercent, ProductionTimePlannedStart, ProductionTimePlannedStop, ProductionTimeStart, ProductionTimeStop, SocketOperationId, ProductionOperationsFlags, ProductionGroup, NotPieces)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
  console.log('%cMyProject%cline:68%cquery', 'color:#fff;background:#ee6f57;padding:3px;border-radius:2px', 'color:#fff;background:#1f3c88;padding:3px;border-radius:2px', 'color:#fff;background:rgb(178, 190, 126);padding:3px;border-radius:2px', query)

  
  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [result] = await connectionSQL.query(query, [
      IdUnique,
      DateAdd,
      UserIdAdd,
      OrderId,
      OrderGroupId,
      IdMaterial,
      OperationsScheme,
      Symbol,
      Description,
      Groups,
      SubGroups,
      SubSubGroups,
      Comment,
      ProductionState,
      ProductionPercent,
      ProductionTimePlannedStart,
      ProductionTimePlannedStop,
      ProductionTimeStart,
      ProductionTimeStop,
      SocketOperationId,
      ProductionOperationsFlags,
      ProductionGroup,
      NotPieces,
    ]);
    const insertId = (result as { insertId?: number }).insertId;
    console.log(
      '%cMyProject%c Inserted production record:',
      'color:#fff;background:#1f3c88;padding:3px;border-radius:2px',
      result
    );
    res.status(200).json({ success: true, insertId, result });
  } catch (error) {
    console.error('Error inserting production:', error);
    res.status(500).json({ error});
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

// POST endpoint to insert a single ProductionsSockets row (a production step)
// under an already-persisted Productions row.
export const insertProductionSocket = async (req: Request, res: Response) => {
  console.log('inserting production socket');
  const {
    OrderId,
    ProductionId,
    IdMaterial,
    OrderIndex,
    Symbol,
    Description,
    Groups,
    SubGroups,
    SubsubGroups,
    ProductionPercent = 0,
    IncludePercentSummary = 1,
    CheckListType = 0,
    UseOrderSocket = 1,
    ConfirmMode = 0,
    NormType = 0,
    NormValue = 0,
    NormTime = 1,
    SocketOperationId = '',
    IdMachine = 0,
  } = req.body;

  if (!OrderId || !ProductionId) {
    return res.status(400).json({ error: 'Missing required fields (OrderId, ProductionId)' });
  }

  const now = formatSqlDateTime();
  const query = `
    INSERT INTO ProductionsSockets
      (OrderId, ProductionId, IdMaterial, IdMachine, ProductionPercent, Symbol, Description,
       \`Groups\`, \`SubGroups\`, \`SubsubGroups\`, OrderIndex, IncludePercentSummary, CheckListType,
       UseOrderSocket, ConfirmMode, NormType, NormValue, NormTime, UserIdStart, UserIdStop,
       UserIdCheckStart, UserIdCheckStop, TimePlannedStart, TimePlannedStop, TimeStart, TimeStop,
       Comment, SocketOperationId, FlagRead, DateRead, UserIdRead, SendingState, ChildSocketStartType,
       ChildSocketOffset, SendMessageSMS, SendMessageEmail, SendMessageMode, SendingState1, CommentCL)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [result] = await connectionSQL.query(query, [
      OrderId,
      ProductionId,
      IdMaterial ?? 0,
      IdMachine,
      ProductionPercent,
      Symbol ?? '',
      Description ?? '',
      Groups ?? null,
      SubGroups ?? null,
      SubsubGroups ?? null,
      OrderIndex ?? 0,
      IncludePercentSummary,
      CheckListType,
      UseOrderSocket,
      ConfirmMode,
      NormType,
      NormValue,
      NormTime,
      0,
      0,
      0,
      0,
      now,
      now,
      null,
      null,
      null,
      SocketOperationId,
      0,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      '',
    ]);
    const insertId = (result as { insertId?: number }).insertId;
    res.status(200).json({ success: true, insertId });
  } catch (error) {
    console.error('Error inserting production socket:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : error });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

// POST — create Productions + ProductionsSockets for an order (send to production).
export const sendOrderToProduction = async (req: Request, res: Response) => {
  const {
    orderId,
    userIdAdd = 0,
    pathMaterialId,
    operationsScheme,
    productionOperationsFlags,
    symbol,
    description,
    groups = null,
    subGroups = null,
    subSubGroups = null,
    steps = [],
  } = req.body;

  if (!orderId || !pathMaterialId || !operationsScheme || !symbol || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'Missing required fields (orderId, pathMaterialId, operationsScheme, symbol, steps)' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    await connectionSQL.beginTransaction();

    const [existingRows] = await connectionSQL.query(
      'SELECT Id, IdUnique FROM Productions WHERE OrderId = ? AND IdMaterial = ? LIMIT 1',
      [orderId, pathMaterialId],
    );
    const existing = (existingRows as any[])[0];
    if (existing) {
      await connectionSQL.rollback();
      return res.status(409).json({
        error: 'Production path already assigned to this order',
        productionId: existing.Id,
        idUnique: existing.IdUnique,
      });
    }

    const idUnique = generateProductionIdUnique();
    const now = formatSqlDateTime();
    const flags = productionOperationsFlags ?? operationsScheme;

    const productionInsert = `
      INSERT INTO Productions
        (IdUnique, DateAdd, UserIdAdd, OrderId, OrderGroupId, IdMaterial, OperationsScheme, Symbol, Description,
         \`Groups\`, \`SubGroups\`, \`SubSubGroups\`, Comment, ProductionState, ProductionPercent,
         ProductionTimePlannedStart, ProductionTimePlannedStop, ProductionTimeStart, ProductionTimeStop,
         SocketOperationId, ProductionOperationsFlags, ProductionGroup, NotPieces)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [productionResult] = await connectionSQL.query(productionInsert, [
      idUnique,
      now,
      userIdAdd,
      orderId,
      null,
      pathMaterialId,
      operationsScheme,
      symbol,
      description ?? '',
      groups,
      subGroups,
      subSubGroups,
      null,
      0,
      0,
      now,
      now,
      now,
      null,
      '',
      flags,
      0,
      0,
    ]);

    const productionId = (productionResult as any).insertId;
    if (!productionId) {
      throw new Error('Failed to obtain production insert id');
    }

    const socketInsert = `
      INSERT INTO ProductionsSockets
        (OrderId, ProductionId, IdMaterial, IdMachine, ProductionPercent, Symbol, Description,
         \`Groups\`, \`SubGroups\`, \`SubsubGroups\`, OrderIndex, IncludePercentSummary, CheckListType,
         UseOrderSocket, ConfirmMode, NormType, NormValue, NormTime, UserIdStart, UserIdStop,
         UserIdCheckStart, UserIdCheckStop, TimePlannedStart, TimePlannedStop, TimeStart, TimeStop,
         Comment, SocketOperationId, FlagRead, DateRead, UserIdRead, SendingState, ChildSocketStartType,
         ChildSocketOffset, SendMessageSMS, SendMessageEmail, SendMessageMode, SendingState1, CommentCL)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const step of steps) {
      await connectionSQL.query(socketInsert, [
        orderId,
        productionId,
        // ProductionsSockets.IdMaterial = the operation/socket Materials id (no
        // IdMaterialSocket column); path is linked via ProductionId.
        step.idMaterialSocket ?? 0,
        step.idMachine ?? 0,
        0,
        step.symbol ?? '',
        step.description ?? '',
        step.groups ?? groups,
        step.subGroups ?? subGroups,
        step.subsubGroups ?? subSubGroups,
        step.orderIndex ?? 0,
        step.includePercentSummary ?? 1,
        step.checkListType ?? 0,
        step.useOrderSocket ?? 1,
        step.confirmMode ?? 0,
        step.normType ?? 0,
        step.normValue ?? 0,
        step.normTime ?? 1,
        0,
        0,
        0,
        0,
        now,
        now,
        null,
        null,
        null,
        step.socketOperationId ?? '',
        0,
        null,
        0,
        0,
        step.childSocketStartType ?? 0,
        0,
        step.sendMessageSMS ?? 0,
        step.sendMessageEmail ?? 0,
        step.sendMessageMode ?? 0,
        0,
        '',
      ]);
    }

    await connectionSQL.query('UPDATE Orders SET State = 4, ProductionPrc = ? WHERE Id = ?', ['0.00', orderId]);
    await connectionSQL.commit();
    await invalidateOrdersListCache();

    res.status(200).json({
      success: true,
      productionId,
      idUnique,
      socketsInserted: steps.length,
      orderState: 4,
      orderProductionPercent: 0,
      productionPrc: '0.00',
    });
  } catch (error) {
    if (connectionSQL) {
      try {
        await connectionSQL.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error('Error sending order to production:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : error });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

// DELETE endpoint to delete a production record by its unique Id.
export const deleteProduction = async (req: Request, res: Response) => {
  const { IdUnique } = req.params;
  if (!IdUnique) {
    return res.status(400).json({ error: 'Missing IdUnique parameter' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    await connectionSQL.beginTransaction();

    const [rows] = await connectionSQL.query(
      'SELECT Id, OrderId FROM Productions WHERE IdUnique = ? LIMIT 1',
      [IdUnique],
    );
    const production = (rows as any[])[0];
    if (!production) {
      await connectionSQL.rollback();
      return res.status(404).json({ error: 'Production not found' });
    }

    const sourceOrderId = Number(production.OrderId) || 0;
    let wastesInvalidated = 0;
    if (sourceOrderId) {
      wastesInvalidated = await invalidateWastesBySourceOrder(connectionSQL, sourceOrderId);
    }

    await connectionSQL.query('DELETE FROM ProductionsSockets WHERE ProductionId = ?', [production.Id]);
    await connectionSQL.query('DELETE FROM Productions WHERE IdUnique = ?', [IdUnique]);

    await connectionSQL.commit();
    res.status(200).json({
      success: true,
      productionId: production.Id,
      wastesInvalidated,
    });
  } catch (error) {
    if (connectionSQL) {
      try {
        await connectionSQL.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error('Error deleting production:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

// DELETE endpoint to remove a single production socket (step) by Id.
export const deleteProductionSocket = async (req: Request, res: Response) => {
  const socketId = Number(req.params.id);
  if (!socketId) {
    return res.status(400).json({ error: 'Missing or invalid socket id' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [result] = await connectionSQL.query('DELETE FROM ProductionsSockets WHERE Id = ?', [socketId]);
    const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
    if (affected === 0) {
      return res.status(404).json({ error: 'Production socket not found' });
    }
    res.status(200).json({ success: true, socketId });
  } catch (error) {
    console.error('Error deleting production socket:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

const CONFIRM_MODE_NONE = 0;
const CONFIRM_MODE_ONE_STEP = 1;
const CONFIRM_MODE_TWO_STEP = 2;
const TWO_STEP_MIN_INTERVAL_MS = 5000;

/** Average of step ProductionPercent for steps with IncludePercentSummary = 1. 
 * If the calculated percentage is 0, return an empty string ('') instead of 0. 
 */
function calculateOrderProductionPercentFromSockets(
  sockets: { ProductionPercent?: unknown; IncludePercentSummary?: unknown }[]
): number | '' {
  const included = sockets.filter((s) => Number(s.IncludePercentSummary ?? 1) === 1);
  if (included.length === 0) return '';
  const sum = included.reduce((acc, s) => acc + (Number(s.ProductionPercent) || 0), 0);
  const percent = Math.round((sum / included.length) * 100) / 100;
  return percent === 0 ? '' : percent;
}

async function persistOrderProductionPercent(
  connectionSQL: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  orderId: number,
  productionId: number,
): Promise<number> {
  const [rows] = (await connectionSQL.query(
    'SELECT ProductionPercent, IncludePercentSummary FROM ProductionsSockets WHERE ProductionId = ?',
    [productionId],
  )) as any[];

  const rawPercent = calculateOrderProductionPercentFromSockets(
    rows as { ProductionPercent?: unknown; IncludePercentSummary?: unknown }[]
  );

  // Zabezpieczenie: jeśli dostaniemy pusty string "", zamieniamy go na liczbę 0
  const percent = typeof rawPercent === 'number' ? rawPercent : 0;

  const prcString = percent.toFixed(2);
  
  await connectionSQL.query('UPDATE Productions SET ProductionPercent = ? WHERE Id = ?', [percent, productionId]);
  await connectionSQL.query('UPDATE Orders SET ProductionPrc = ? WHERE Id = ?', [prcString, orderId]);
  
  return percent;
}


function isSocketCompleted(s: any): boolean {
  if (Number(s.ProductionPercent) >= 100) return true;
  const mode = Number(s.ConfirmMode ?? CONFIRM_MODE_NONE);
  if (mode === CONFIRM_MODE_NONE) {
    return Number(s.UserIdCheckStop) > 0;
  }
  return s.TimeStop != null && String(s.TimeStop) !== '' && String(s.TimeStop) !== 'null';
}

function isSocketStarted(s: any): boolean {
  const mode = Number(s.ConfirmMode ?? CONFIRM_MODE_NONE);
  if (mode === CONFIRM_MODE_NONE) {
    return Number(s.UserIdCheckStart) > 0 && !isSocketCompleted(s);
  }
  return s.TimeStart != null && String(s.TimeStart) !== '' && String(s.TimeStart) !== 'null' && !isSocketCompleted(s);
}

// POST — confirm a production socket operation (operator scan) respecting ConfirmMode.
export const confirmProductionSocketOperation = async (req: Request, res: Response) => {
  const { socketId, userId, firstScanAt } = req.body;

  const productionSocketId = Number(socketId);
  const operatorId = Number(userId);

  if (!productionSocketId || !operatorId) {
    return res.status(400).json({ error: 'Missing socketId or userId' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();

    const [rows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [productionSocketId],
    );
    const socket = (rows as any[])[0];

    if (!socket) {
      return res.status(404).json({
        error: `No production step found for Id ${productionSocketId}`,
      });
    }

    const permission = await assertUserCanOperateProductionSocket(
      connectionSQL,
      operatorId,
      Number(socket.IdMaterial),
    );
    if (!permission.allowed) {
      return res.status(403).json({
        error: permission.reason ?? 'You have no permission',
        noPermission: true,
      });
    }

    const [siblingRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE ProductionId = ? ORDER BY OrderIndex ASC',
      [socket.ProductionId],
    );
    const siblings = siblingRows as any[];

    if (isSocketCompleted(socket)) {
      return res.status(409).json({
        error: 'Task already have been done.',
        alreadyCompleted: true,
        socket,
      });
    }

    const socketIndex = siblings.findIndex((s) => s.Id === socket.Id);
    const previousSteps = siblings.slice(0, socketIndex);
    if (previousSteps.some((s) => !isSocketCompleted(s))) {
      return res.status(409).json({
        error: 'Previous production steps must be completed first.',
        socket,
      });
    }

    const confirmMode = Number(socket.ConfirmMode ?? CONFIRM_MODE_NONE);
    const now = formatSqlDateTime();
    let action: string;

    if (confirmMode === CONFIRM_MODE_NONE) {
      await connectionSQL.query(
        'UPDATE ProductionsSockets SET UserIdCheckStart = ?, UserIdCheckStop = ? WHERE Id = ?',
        [operatorId, operatorId, socket.Id],
      );
      action = 'acknowledged';
    } else if (confirmMode === CONFIRM_MODE_ONE_STEP) {
      await connectionSQL.query(
        `UPDATE ProductionsSockets
         SET TimeStart = ?, TimeStop = ?, UserIdStart = ?, UserIdStop = ?,
             UserIdCheckStart = ?, UserIdCheckStop = ?, ProductionPercent = 100
         WHERE Id = ?`,
        [now, now, operatorId, operatorId, operatorId, operatorId, socket.Id],
      );
      action = 'completed_one_step';
    } else if (confirmMode === CONFIRM_MODE_TWO_STEP) {
      if (!isSocketStarted(socket)) {
        await connectionSQL.query(
          'UPDATE ProductionsSockets SET TimeStart = ?, UserIdStart = ?, UserIdCheckStart = ? WHERE Id = ?',
          [now, operatorId, operatorId, socket.Id],
        );
        action = 'started';
      } else {
        let anchor = firstScanAt != null ? Number(firstScanAt) : null;
        if (anchor == null || !Number.isFinite(anchor)) {
          const timeStart = socket.TimeStart;
          if (timeStart != null && String(timeStart) !== '' && String(timeStart) !== 'null') {
            const parsed = new Date(String(timeStart).replace(' ', 'T')).getTime();
            if (Number.isFinite(parsed)) anchor = parsed;
          }
        }
        if (anchor != null && Number.isFinite(anchor)) {
          const elapsed = Date.now() - anchor;
          if (elapsed < TWO_STEP_MIN_INTERVAL_MS) {
            const waitSec = Math.ceil((TWO_STEP_MIN_INTERVAL_MS - elapsed) / 1000);
            return res.status(409).json({
              error: `Wait ${waitSec}s before scanning again to stop this step.`,
              tooSoon: true,
              socket,
            });
          }
        }

        await connectionSQL.query(
          `UPDATE ProductionsSockets
           SET TimeStop = ?, UserIdStop = ?, UserIdCheckStop = ?, ProductionPercent = 100
           WHERE Id = ?`,
          [now, operatorId, operatorId, socket.Id],
        );
        action = 'stopped';
      }
    } else {
      return res.status(400).json({ error: `Unknown ConfirmMode: ${confirmMode}` });
    }

    const [updatedRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [socket.Id],
    );
    const updated = (updatedRows as any[])[0];

    const orderProductionPercent = await persistOrderProductionPercent(
      connectionSQL,
      Number(socket.OrderId),
      Number(socket.ProductionId),
    );

    const socketPercent = Number(updated?.ProductionPercent ?? 0);
    const wastesMarkedAvailable = await maybeReleaseWastesAfterCutComplete(
      connectionSQL,
      updated ?? socket,
      socketPercent,
    );

    res.status(200).json({
      success: true,
      action,
      confirmMode,
      checkListType: Number(socket.CheckListType ?? 0),
      socket: updated,
      orderProductionPercent,
      productionPrc: orderProductionPercent.toFixed(2),
      wastesMarkedAvailable,
    });
  } catch (error) {
    console.error('Error confirming production socket operation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

/** Packable piece rule (same as cutting): Width, Length, Th, Quantity all > 0. */
async function syncCheckListsFromOrderPieces(
  connectionSQL: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  socketId: number,
  socket: Record<string, unknown>,
): Promise<void> {
  const [existing] = (await connectionSQL.query(
    'SELECT Id FROM ProductionsSocketsCheckLists WHERE ProductionSocketId = ? LIMIT 1',
    [socketId],
  )) as unknown[];
  if ((existing as unknown[]).length > 0) return;

  const orderId = Number(socket.OrderId);
  if (!orderId) return;

  const [pieces] = (await connectionSQL.query(
    `SELECT Id, IdParent, MaterialSymbol, MaterialDescription, Description,
            Width, Length, Th, Quantity, PackageNumber, PackageSubNumber,
            Edge1Symbol, Edge2Symbol, Edge3Symbol, Edge4Symbol
     FROM OrdersPieces
     WHERE IdOrder = ? AND Width > 0 AND Length > 0 AND Th > 0 AND Quantity > 0
     ORDER BY Id ASC`,
    [orderId],
  )) as unknown[];

  for (const piece of pieces as Record<string, unknown>[]) {
    const pieceId = Number(piece.Id) || 0;
    const symbol =
      String(piece.MaterialSymbol ?? '').trim() ||
      `Piece #${pieceId}`;
    const description = String(piece.MaterialDescription ?? piece.Description ?? '').trim();
    const quantity = Number(piece.Quantity) || 0;
    const hasPackage = Boolean(
      String(piece.PackageNumber ?? '').trim() || String(piece.PackageSubNumber ?? '').trim(),
    );
    const quantityStamp = hasPackage ? quantity : 0;

    await connectionSQL.query(
      `INSERT INTO ProductionsSocketsCheckLists
         (ProductionSocketId, IdOrder, IdJoin, State, Type,
          X, Y, Z, Quantity, QuantityStamp, QuantityDamage,
          Symbol, Description, PackageNumber, PackageSubNumber, IdParent,
          Edge1Symbol, Edge2Symbol, Edge3Symbol, Edge4Symbol)
       VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        socketId,
        orderId,
        pieceId,
        Number(piece.Width) || 0,
        Number(piece.Length) || 0,
        Number(piece.Th) || 0,
        quantity,
        quantityStamp,
        symbol,
        description,
        piece.PackageNumber ?? null,
        piece.PackageSubNumber ?? null,
        piece.IdParent != null ? Number(piece.IdParent) : null,
        piece.Edge1Symbol ?? null,
        piece.Edge2Symbol ?? null,
        piece.Edge3Symbol ?? null,
        piece.Edge4Symbol ?? null,
      ],
    );
  }
}

// GET — fetch FullPartList checklist rows for a production socket (step).
export const fetchProductionSocketCheckLists = async (req: Request, res: Response) => {
  const { ProductionSocketId } = req.query;
  const socketId = Number(ProductionSocketId);

  if (!socketId) {
    return res.status(400).json({ error: 'Missing or invalid ProductionSocketId' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();

    const [socketRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [socketId],
    );
    const socket = (socketRows as Record<string, unknown>[])[0];
    if (!socket) {
      return res.status(404).json({ error: `Production socket ${socketId} not found` });
    }

    try {
      await syncCheckListsFromOrderPieces(connectionSQL, socketId, socket);
    } catch (syncError) {
      console.error('Checklist sync from OrdersPieces failed (continuing with fetch):', syncError);
    }

    const [rows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSocketsCheckLists WHERE ProductionSocketId = ? ORDER BY Id ASC',
      [socketId],
    );
    res.status(200).json({ success: true, checkLists: rows });
  } catch (error) {
    console.error('Error fetching production socket checklists:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

/** Sum(QuantityStamp) / Sum(Quantity) * 100 across checklist rows, rounded to 2 dp. */
function calculateCheckListPercent(
  rows: { Quantity?: unknown; QuantityStamp?: unknown }[],
): number {
  const totalQuantity = rows.reduce((acc, r) => acc + (Number(r.Quantity) || 0), 0);
  if (totalQuantity <= 0) return 0;
  const totalStamp = rows.reduce((acc, r) => acc + (Number(r.QuantityStamp) || 0), 0);
  return Math.round((totalStamp / totalQuantity) * 10000) / 100;
}

// POST — confirm pieces on a single FullPartList checklist row (increments QuantityStamp).
export const confirmProductionSocketCheckListItem = async (req: Request, res: Response) => {
  const { checkListId, quantity, userId } = req.body;

  const rowId = Number(checkListId);
  const addQuantity = Number(quantity);
  const operatorId = Number(userId) || 0;

  if (!rowId) {
    return res.status(400).json({ error: 'Missing or invalid checkListId' });
  }
  if (!Number.isFinite(addQuantity) || addQuantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    await connectionSQL.beginTransaction();

    const [rows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSocketsCheckLists WHERE Id = ? LIMIT 1',
      [rowId],
    );
    const item = (rows as any[])[0];
    if (!item) {
      await connectionSQL.rollback();
      return res.status(404).json({ error: `No checklist row found for Id ${rowId}` });
    }

    const productionSocketId = Number(item.ProductionSocketId);
    const planned = Number(item.Quantity) || 0;
    const currentStamp = Number(item.QuantityStamp) || 0;
    const newStamp = planned > 0 ? Math.min(planned, currentStamp + addQuantity) : currentStamp + addQuantity;

    await connectionSQL.query(
      'UPDATE ProductionsSocketsCheckLists SET QuantityStamp = ? WHERE Id = ?',
      [newStamp, rowId],
    );

    // Recompute the parent step % from the sum of its checklist quantities.
    const [allRows] = await connectionSQL.query(
      'SELECT Quantity, QuantityStamp FROM ProductionsSocketsCheckLists WHERE ProductionSocketId = ?',
      [productionSocketId],
    );
    const socketPercent = calculateCheckListPercent(
      allRows as { Quantity?: unknown; QuantityStamp?: unknown }[],
    );

    const [socketRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [productionSocketId],
    );
    const socket = (socketRows as any[])[0];

    if (socket) {
      const now = formatSqlDateTime();
      if (socketPercent >= 100) {
        const startNeeded =
          socket.TimeStart == null || String(socket.TimeStart) === '' || String(socket.TimeStart) === 'null';
        await connectionSQL.query(
          `UPDATE ProductionsSockets
           SET ProductionPercent = 100,
               TimeStart = ${startNeeded ? '?' : 'TimeStart'},
               TimeStop = ?, UserIdStop = ?, UserIdCheckStop = ?
           WHERE Id = ?`,
          startNeeded
            ? [now, now, operatorId, operatorId, productionSocketId]
            : [now, operatorId, operatorId, productionSocketId],
        );
      } else {
        await connectionSQL.query(
          'UPDATE ProductionsSockets SET ProductionPercent = ? WHERE Id = ?',
          [socketPercent, productionSocketId],
        );
      }
    }

    let orderProductionPercent: number | undefined;
    if (socket?.OrderId != null && socket?.ProductionId != null) {
      orderProductionPercent = await persistOrderProductionPercent(
        connectionSQL,
        Number(socket.OrderId),
        Number(socket.ProductionId),
      );
    }

    const [updatedRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSocketsCheckLists WHERE ProductionSocketId = ? ORDER BY Id ASC',
      [productionSocketId],
    );

    const [updatedSocketRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [productionSocketId],
    );

    const wastesMarkedAvailable = await maybeReleaseWastesAfterCutComplete(
      connectionSQL,
      (updatedSocketRows as any[])[0] ?? socket,
      socketPercent,
    );

    await connectionSQL.commit();

    res.status(200).json({
      success: true,
      checkLists: updatedRows,
      socket: (updatedSocketRows as any[])[0] ?? socket,
      socketPercent,
      completed: socketPercent >= 100,
      orderProductionPercent,
      wastesMarkedAvailable,
    });
  } catch (error) {
    if (connectionSQL) {
      try {
        await connectionSQL.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error('Error confirming checklist item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

// POST — start a production socket operation by ProductionsSockets.Id (operator scan).
export const startProductionSocketOperation = async (req: Request, res: Response) => {
  const { socketId, userId } = req.body;

  const productionSocketId = Number(socketId);
  const operatorId = Number(userId);

  if (!productionSocketId || !operatorId) {
    return res.status(400).json({ error: 'Missing socketId or userId' });
  }

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();

    const [rows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [productionSocketId],
    );
    const socket = (rows as any[])[0];

    if (!socket) {
      return res.status(404).json({
        error: `No production step found for Id ${productionSocketId}`,
      });
    }

    const [siblingRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE ProductionId = ? ORDER BY OrderIndex ASC',
      [socket.ProductionId],
    );
    const siblings = siblingRows as any[];

    const isCompleted = (s: any) =>
      Number(s.ProductionPercent) >= 100 ||
      (s.TimeStop != null && String(s.TimeStop) !== '' && String(s.TimeStop) !== 'null');

    const isStarted = (s: any) =>
      s.TimeStart != null && String(s.TimeStart) !== '' && String(s.TimeStart) !== 'null';

    if (isCompleted(socket)) {
      return res.status(409).json({ error: 'This operation is already completed.', socket });
    }

    if (isStarted(socket)) {
      return res.status(200).json({ success: true, alreadyStarted: true, socket });
    }

    const socketIndex = siblings.findIndex((s) => s.Id === socket.Id);
    const previousSteps = siblings.slice(0, socketIndex);
    const blocked = previousSteps.some((s) => !isCompleted(s));
    if (blocked) {
      return res.status(409).json({
        error: 'Previous production steps must be completed first.',
        socket,
      });
    }

    const now = formatSqlDateTime();
    await connectionSQL.query(
      'UPDATE ProductionsSockets SET TimeStart = ?, UserIdStart = ? WHERE Id = ?',
      [now, operatorId, socket.Id],
    );

    const [updatedRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [socket.Id],
    );
    const updated = (updatedRows as any[])[0];

    res.status(200).json({ success: true, socket: updated });
  } catch (error) {
    console.error('Error starting production socket operation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

/**
 * PUT /production/updateProduction
 * MES / integration: update Productions header (state, times, percent).
 * Body: { id } or { Id } + any of ProductionState, ProductionPercent,
 * ProductionTimeStart/Stop, ProductionTimePlannedStart/Stop, Comment, …
 */
export const updateProduction = async (req: Request, res: Response) => {
  const id = Number(req.body?.id ?? req.body?.Id);
  if (!id) {
    return res.status(400).json({ error: 'Missing production id' });
  }

  const allowedFields: Record<string, string> = {
    ProductionState: 'ProductionState',
    ProductionPercent: 'ProductionPercent',
    ProductionTimePlannedStart: 'ProductionTimePlannedStart',
    ProductionTimePlannedStop: 'ProductionTimePlannedStop',
    ProductionTimeStart: 'ProductionTimeStart',
    ProductionTimeStop: 'ProductionTimeStop',
    Comment: 'Comment',
    SocketOperationId: 'SocketOperationId',
    ProductionOperationsFlags: 'ProductionOperationsFlags',
    Description: 'Description',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(allowedFields)) {
    if (req.body[key] !== undefined) {
      setClauses.push(`\`${column}\` = ?`);
      values.push(req.body[key]);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'At least one updatable field is required' });
  }

  values.push(id);

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();
    const [result] = await connectionSQL.query(
      `UPDATE Productions SET ${setClauses.join(', ')} WHERE Id = ?`,
      values,
    );

    if ((result as { affectedRows?: number }).affectedRows === 0) {
      return res.status(404).json({ error: `Production Id ${id} not found` });
    }

    const [rows] = await connectionSQL.query('SELECT * FROM Productions WHERE Id = ? LIMIT 1', [id]);
    const production = (rows as unknown[])[0];

    invalidateOrdersListCache();
    res.status(200).json({
      success: true,
      production,
      updatedFields: setClauses.map((c) => c.split(' = ')[0].replace(/`/g, '')),
    });
  } catch (error) {
    console.error('Error updating production:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};

/**
 * PUT /production/updateProductionSocket
 * MES / integration: push stage progress onto ProductionsSockets
 * (TimeStart/Stop, ProductionPercent, ActualWorkTimeMinutes, CurrentStatus, …).
 * Recalculates Orders.ProductionPrc when percent-related fields change.
 */
export const updateProductionSocket = async (req: Request, res: Response) => {
  const id = Number(req.body?.id ?? req.body?.Id ?? req.body?.socketId);
  if (!id) {
    return res.status(400).json({ error: 'Missing production socket id' });
  }

  const allowedFields: Record<string, string> = {
    TimeStart: 'TimeStart',
    TimeStop: 'TimeStop',
    TimePlannedStart: 'TimePlannedStart',
    TimePlannedStop: 'TimePlannedStop',
    ProductionPercent: 'ProductionPercent',
    UserIdStart: 'UserIdStart',
    UserIdStop: 'UserIdStop',
    UserIdCheckStart: 'UserIdCheckStart',
    UserIdCheckStop: 'UserIdCheckStop',
    CurrentStatus: 'CurrentStatus',
    CurrentOperatorId: 'CurrentOperatorId',
    CurrentMachineId: 'CurrentMachineId',
    ActualWorkTimeMinutes: 'ActualWorkTimeMinutes',
    PauseTimeMinutes: 'PauseTimeMinutes',
    PlannedWorkTimeMinutes: 'PlannedWorkTimeMinutes',
    QuantityCompleted: 'QuantityCompleted',
    QuantityScrap: 'QuantityScrap',
    Comment: 'Comment',
    IdMachine: 'IdMachine',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let touchesPercent = false;

  for (const [key, column] of Object.entries(allowedFields)) {
    if (req.body[key] !== undefined) {
      setClauses.push(`\`${column}\` = ?`);
      values.push(req.body[key]);
      if (key === 'ProductionPercent') touchesPercent = true;
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'At least one updatable field is required' });
  }

  values.push(id);

  let connectionSQL;
  try {
    connectionSQL = await getPool().getConnection();

    const [existingRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [id],
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return res.status(404).json({ error: `Production socket Id ${id} not found` });
    }

    const [result] = await connectionSQL.query(
      `UPDATE ProductionsSockets SET ${setClauses.join(', ')} WHERE Id = ?`,
      values,
    );

    if ((result as { affectedRows?: number }).affectedRows === 0) {
      return res.status(404).json({ error: `Production socket Id ${id} not found` });
    }

    const [updatedRows] = await connectionSQL.query(
      'SELECT * FROM ProductionsSockets WHERE Id = ? LIMIT 1',
      [id],
    );
    const socket = (updatedRows as any[])[0];

    let orderProductionPercent: number | undefined;
    if (touchesPercent || req.body.recalcOrderPercent === true || req.body.recalcOrderPercent === '1') {
      orderProductionPercent = await persistOrderProductionPercent(
        connectionSQL,
        Number(socket.OrderId),
        Number(socket.ProductionId),
      );
    }

    invalidateOrdersListCache();
    res.status(200).json({
      success: true,
      socket,
      updatedFields: setClauses.map((c) => c.split(' = ')[0].replace(/`/g, '')),
      ...(orderProductionPercent !== undefined && {
        orderProductionPercent,
        productionPrc: orderProductionPercent.toFixed(2),
      }),
    });
  } catch (error) {
    console.error('Error updating production socket:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connectionSQL) connectionSQL.release();
  }
};
