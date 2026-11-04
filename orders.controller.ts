import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import OrderModel, { IOrder } from "../models/order.model";
import CourseModel, { ICourse } from "../models/course.model";

import path from "path";
import ejs from "ejs";
import sendMail, { isSmtpConfigured } from "../utils/sendEmail";
import NotificationModel from "../models/Notification.model";
import userModel from "../models/user.model";
import { getAllOrdersService, newOrder } from "../services/order.service";
import { redis } from "../utils/redis";
import { escapeId } from "mysql2";
import { getPool } from "../database";

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import {
  applyTimingHeaders,
  createOrdersListTiming,
  getOrdersListCacheVersion,
  invalidateOrdersListCache,
  logOrdersListTiming,
  performance,
  recordOrdersListTiming,
} from "../utils/ordersListTiming";

dotenv.config();

const ORDERS_LIST_DEFAULT_PAGE_SIZE = 30;
const ORDERS_LIST_MAX_PAGE_SIZE = 500;

/**
 * Map by business State (VariablesOptions), NOT by EJS filename numbers.
 * 0 = Edycja/korekta → correction template
 * 1 = W weryfikacji (złożone) → confirmation template
 * Filenames Orders_state0_* / Orders_state1_* are historically swapped vs these meanings.
 */
const ORDER_EMAIL_TEMPLATES: Record<number, { subject: string; template: string }> = {
  0: { subject: 'Zamówienie wymaga korekty', template: 'Orders_state1_orders_edition_correction.ejs' },
  1: { subject: 'Potwierdzenie zamówienia', template: 'Orders_state0_order-confirmation.ejs' },
  2: { subject: 'Zamówienie odrzucone', template: 'Orders_state2_orders_rejection.ejs' },
  3: { subject: 'Wycena zamówienia', template: 'Orders_state3_orders_valuation.ejs' },
  4: { subject: 'Zamówienie w realizacji', template: 'Orders_state4_order-realization.ejs' },
  5: { subject: 'Zamówienie gotowe do odbioru', template: 'Orders_state5_orders_ready_for_pickup.ejs' },
  10: { subject: 'Oczekiwanie na płatność', template: 'Orders_state10_orders_waiting_for_payment.ejs' },
};

/** Polish labels for OrdersMaterials.matType (aligned with MaterialsTypeMap). */
const MAT_TYPE_LABEL_PL: Record<string, string> = {
  '0': 'Płyta',
  '1': 'Plecy',
  '4': 'Blat',
  '6': 'Front',
  '10': 'Usługa',
  '11': 'Obrzeże',
  '200': 'Akcesorium',
  '5000': 'Kolor',
  '6000': 'Powierzchnia',
};

const formatPln = (value: unknown): string => {
  const n = parseFloat(String(value ?? 0));
  return (Number.isFinite(n) ? n : 0).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

type OrderEmailResult = {
  emailSent: boolean;
  emailSkipped: boolean;
  emailTo: string | null;
  emailErrorMessage: string | null;
  emailTemplate: string | null;
  emailErrorCategory: string | null;
};

/** Treat legacy State -1 the same as 0 (Edycja/Korekta). */
const normalizeOrderState = (state: unknown): number => {
  const n = Number(state ?? 0);
  return n === -1 ? 0 : n;
};

const skippedEmailResult = (
  state: number,
  reason: string,
  emailTo: string | null = null
): OrderEmailResult => {
  const reasonLower = (reason || '').toLowerCase();
  let emailErrorCategory: string | null = null;
  if (
    reasonLower.includes('sendemail=false') ||
    reasonLower.includes('state_unchanged') ||
    reasonLower.includes('draft_insert_no_email')
  ) {
    emailErrorCategory = 'intentionally_skipped';
  } else if (reasonLower.includes('smtp not configured') || reasonLower.includes('missing:')) {
    emailErrorCategory = 'smtp_not_configured';
  } else if (reasonLower.includes('user_email_disabled')) {
    emailErrorCategory = 'user_email_disabled';
  }

  return {
    emailSent: false,
    emailSkipped: true,
    emailTo,
    emailErrorMessage: reason,
    emailTemplate: (ORDER_EMAIL_TEMPLATES[state] || ORDER_EMAIL_TEMPLATES[0]).template,
    emailErrorCategory,
  };
};

/** User notification prefs from Users table (Orders.IdUser → Users.Id). */
type UserNotificationPrefs = {
  SendingMessagesEmail: number;
  SendingMessagesSMS: number;
  Email: string | null;
};

const classifyEmailError = (reason: string, skipped: boolean): string => {
  const r = reason.toLowerCase();
  if (
    r.includes('sendemail=false') ||
    r.includes('state_unchanged') ||
    r.includes('draft_insert_no_email') ||
    r.includes('intentionally_skipped')
  ) {
    return 'intentionally_skipped';
  }
  if (r.includes('user_email_disabled') || r.includes('nie ma włączonej') || r.includes('email notifications disabled'))
    return 'user_email_disabled';
  if (r.includes('smtp not configured') || r.includes('missing:')) return 'smtp_not_configured';
  // Generic skipped without SMTP reason is intentional, not a config failure.
  if (skipped) return 'intentionally_skipped';
  if (r.includes('invalid login') || r.includes('authentication') || r.includes('535') || r.includes('credentials'))
    return 'smtp_auth';
  if (r.includes('econnrefused') || r.includes('etimedout') || r.includes('enotfound') || r.includes('greeting never received'))
    return 'smtp_connection';
  if (r.includes('template not found') || r.includes('email template')) return 'template_missing';
  return 'unknown';
};

/**
 * Load Users.SendingMessagesEmail / SendingMessagesSMS for order owner.
 * Returns null if IdUser missing or user not found.
 */
const fetchUserNotificationPrefs = async (
  idUser: unknown
): Promise<UserNotificationPrefs | null> => {
  const userId = Number(idUser);
  if (!Number.isFinite(userId) || userId <= 0) {
    console.warn('[orders.email] No valid IdUser — cannot check notification prefs', { idUser });
    return null;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT SendingMessagesEmail, SendingMessagesSMS, Email
       FROM Users
       WHERE Id = ?
       LIMIT 1`,
      [userId]
    );
    const list = Array.isArray(rows) ? (rows as any[]) : [];
    if (list.length === 0) {
      console.warn('[orders.email] User not found for notification prefs', { userId });
      return null;
    }
    const row = list[0];
    return {
      SendingMessagesEmail: Number(row.SendingMessagesEmail ?? 0),
      SendingMessagesSMS: Number(row.SendingMessagesSMS ?? 0),
      Email: row.Email ? String(row.Email) : null,
    };
  } catch (err) {
    console.error('[orders.email] Failed to load user notification prefs', { userId, err });
    return null;
  }
};

/**
 * Data for order-status EJS templates.
 * `materials` / `totals` mirror SummaryTable + TotalsRow (PLN, pl-PL).
 */
const buildOrderEmailData = async (orderData: any, orderId: number | string) => {
  const firstName = orderData.Firstname || orderData.FirstName || '';
  const lastName = orderData.Lastname || orderData.LastName || '';
  const email = orderData.Email || '';

  let materialsRaw: any[] = [];
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        symbol, description, quantity, unit, matType, tax,
        price1, price2, totalPrice1, totalPrice2,
        discountPercent, discountPrice1, discountPrice2
      FROM OrdersMaterials
      WHERE idOrder = ?`,
      [orderId]
    );
    materialsRaw = Array.isArray(rows) ? rows : [];
    console.log('[orders.email] OrdersMaterials loaded', {
      orderId,
      count: materialsRaw.length,
    });
  } catch (err) {
    console.warn('[orders.email] Failed to load OrdersMaterials for email', { orderId, err });
  }

  const materials = materialsRaw.map((row) => {
    const qty = parseFloat(String(row.quantity ?? 0)) || 0;
    const tax = parseFloat(String(row.tax ?? 0)) || 0;
    const totalNet = parseFloat(String(row.totalPrice1 ?? 0)) || 0;
    const totalGross = parseFloat(String(row.totalPrice2 ?? 0)) || 0;
    const matTypeKey = String(row.matType ?? '');
    return {
      symbol: row.symbol || row.description || '—',
      description: row.description || '',
      quantity: qty.toLocaleString('pl-PL', { maximumFractionDigits: 3 }),
      unit: row.unit || 'szt',
      matType: MAT_TYPE_LABEL_PL[matTypeKey] || matTypeKey || '—',
      tax: `${Math.round(tax)}%`,
      price1: formatPln(row.price1),
      price2: formatPln(row.price2),
      totalPrice1: formatPln(totalNet),
      totalPrice2: formatPln(totalGross),
      _totalNet: totalNet,
      _totalGross: totalGross,
      _discountGross: parseFloat(String(row.discountPrice2 ?? 0)) || 0,
    };
  });

  const totalNet = materials.reduce((s, m) => s + m._totalNet, 0);
  const totalGross = materials.reduce((s, m) => s + m._totalGross, 0);
  const totalDiscount = materials.reduce((s, m) => s + m._discountGross, 0);

  return {
    user: {
      name: `${firstName} ${lastName}`.trim() || 'Klient',
      email,
      userEmail: email,
      companyName: orderData.CompanyName || '—',
      taxId: orderData.TaxId || '—',
    },
    order: {
      id: orderId,
      name: orderData.OwnNumber || '—',
      description: orderData.Description || '—',
      date: orderData.DateDelivery || orderData.DeliveryDate || '—',
      deliveryType: orderData.DeliveryMethodStr || '—',
      deliveryMethod: orderData.DeliveryMethodStr || '—',
      paymentMethod: orderData.PaymentMethodStr || '—',
      priceTotal: formatPln(orderData.PriceTotal),
    },
    materials,
    totals: {
      net: formatPln(totalNet),
      gross: formatPln(totalGross),
      discount: formatPln(totalDiscount),
      hasDiscount: totalDiscount > 0,
    },
  };
};

const sendOrderStatusEmail = async (
  orderData: any,
  orderId: number | string,
  state: number
): Promise<OrderEmailResult> => {
  const recipient = (orderData.Email || '').trim();
  const mailMeta = ORDER_EMAIL_TEMPLATES[state] || ORDER_EMAIL_TEMPLATES[0];

  console.log('[orders.email] Preparing email', {
    orderId,
    state,
    idUser: orderData.IdUser,
    recipient: recipient || '(empty → fallback)',
    template: mailMeta.template,
    subject: mailMeta.subject,
    smtpConfigured: isSmtpConfigured(),
  });

  // Fail fast: no SMTP → no template/DB work, no send attempt; order flow continues.
  if (!isSmtpConfigured()) {
    console.log(
      '[orders.email] SMTP not configured this and hits !!!! — email NOT attempted, moving on with code',
      { orderId, state, recipient: recipient || null }
    );
    return {
      emailSent: false,
      emailSkipped: true,
      emailTo: recipient || null,
      emailErrorMessage: 'SMTP not configured',
      emailTemplate: mailMeta.template,
      emailErrorCategory: 'smtp_not_configured',
    };
  }

  // Gate on Users.SendingMessagesEmail (Orders.IdUser → Users.Id)
  const prefs = await fetchUserNotificationPrefs(orderData.IdUser);
  const emailAllowed = prefs ? prefs.SendingMessagesEmail === 1 : true;
  // SMS gate ready for later: prefs?.SendingMessagesSMS === 1
  if (prefs && !emailAllowed) {
    const emailTo = recipient || prefs.Email || null;
    console.log('[orders.email] Skipped — user disabled email notifications', {
      orderId,
      idUser: orderData.IdUser,
      SendingMessagesEmail: prefs.SendingMessagesEmail,
      SendingMessagesSMS: prefs.SendingMessagesSMS,
      emailTo,
    });
    return {
      emailSent: false,
      emailSkipped: true,
      emailTo,
      emailErrorMessage: 'user_email_disabled',
      emailTemplate: mailMeta.template,
      emailErrorCategory: 'user_email_disabled',
    };
  }

  if (!recipient) {
    console.warn('[orders.email] No Email on order — sendMail will use fallback address');
  }

  try {
    const emailData = await buildOrderEmailData(orderData, orderId);
    const result = await sendMail({
      email: recipient,
      subject: mailMeta.subject,
      template: mailMeta.template,
      data: emailData,
    });

    console.log('[orders.email] Result', {
      orderId,
      sent: result.sent,
      skipped: result.skipped,
      to: result.to,
      reason: result.reason,
    });

    return {
      emailSent: Boolean(result.sent),
      emailSkipped: Boolean(result.skipped),
      emailTo: result.to || recipient || null,
      emailErrorMessage: result.reason || null,
      emailTemplate: mailMeta.template,
      emailErrorCategory: result.sent
        ? null
        : classifyEmailError(result.reason || '', Boolean(result.skipped)),
    };
  } catch (emailError: any) {
    const message = emailError?.message || 'Unknown email error';
    console.error('[orders.email] FAILED', { orderId, state, recipient, message });
    // Never fail the order because of email — caller already saved the row.
    return {
      emailSent: false,
      emailSkipped: false,
      emailTo: recipient || null,
      emailErrorMessage: message,
      emailTemplate: mailMeta.template,
      emailErrorCategory: classifyEmailError(message, false),
    };
  }
};

// LEFT JOIN: orders with missing/invalid DepartmentId (e.g. DepartmentId=7
// with no matching Departments row) must still appear in the list — otherwise
// OwnNumber / PriceTotal and the whole row vanish from /orders and moje_zamowienia.
// Soft-deleted rows (DeletedFlag = 1) are excluded by default in
// buildOrdersListFilters; the frontend can include them via the sentinel
// ORDER_DELETED_FILTER_KEY inside stateFilter (must match orders.constants.ts).
const ORDER_DELETED_FILTER_KEY = -100;

const ORDERS_LIST_BASE_FROM = `
    FROM Orders o
    LEFT JOIN Departments d ON o.DepartmentId = d.Id
    WHERE (o.id >= 3000)
  `;

const ORDERS_LIST_SELECT = `
    SELECT 
      o.Id, 
      o.IdUser,
      o.DepartmentId,
      o.CompanyName, 
      o.Description, 
      o.OwnNumber, 
      o.DateGeneration, 
      o.DateExecution,
      o.DateDelivery,
      o.DateInstallation,
      o.State,
      o.DeletedFlag,
      o.City, 
      o.Email,
      o.Phone,
      o.TaxId,
      o.Comment,
      o.IsRead, 
      o.MaterialsSymbols, 
      o.Priority,
      o.PriorityStr, 
      o.DeliveryMethod,
      o.DeliveryMethodStr,
      o.RealizationMethodStr,
      o.PaymentMethod,
      o.PaymentMethodStr,
      o.clientTakesWasteStr AS ClientTakesWasteStr,
      o.Price1,
      o.PriceTotal,
      o.NewMessages,
      o.NewMessagesFCAdd,
      o.NewMessagesOMAdd,
      o.ProductionPrc,
      o.FormName,
      o.IsGroupOrder,
      o.IdParent,
      o.AttachFiles,
      o.PaymentState,
      d.Name AS DepartmentName 
  `;

function parseStateFilterValues(stateFilter: unknown): number[] {
  const stateFilterStr = String(stateFilter);
  if (stateFilterStr.includes(',')) {
    return stateFilterStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }
  const single = parseInt(stateFilterStr, 10);
  return Number.isNaN(single) ? [] : [single];
}

/** Soft-delete: NULL must count as “not deleted” (manual Heidi inserts often leave it NULL). */
const ORDERS_NOT_DELETED_SQL = 'IFNULL(o.DeletedFlag, 0) = 0';
const ORDERS_IS_DELETED_SQL = 'IFNULL(o.DeletedFlag, 0) = 1';

/**
 * Qualify sort columns with table alias. Bare `Id` is ambiguous with
 * `LEFT JOIN Departments d` (both have Id) and breaks header sort + the list query.
 */
const ORDERS_LIST_SORT_EXPR: Record<string, string> = {
  Id: 'o.Id',
  IdUser: 'o.IdUser',
  DepartmentId: 'o.DepartmentId',
  CompanyName: 'o.CompanyName',
  Description: 'o.Description',
  OwnNumber: 'o.OwnNumber',
  DateGeneration: 'o.DateGeneration',
  DateExecution: 'o.DateExecution',
  DateDelivery: 'o.DateDelivery',
  DateInstallation: 'o.DateInstallation',
  State: 'o.State',
  City: 'o.City',
  Email: 'o.Email',
  IsRead: 'o.IsRead',
  MaterialsSymbols: 'o.MaterialsSymbols',
  PriorityStr: 'o.PriorityStr',
  DeliveryMethod: 'o.DeliveryMethod',
  DeliveryMethodStr: 'o.DeliveryMethodStr',
  RealizationMethodStr: 'o.RealizationMethodStr',
  PaymentMethodStr: 'o.PaymentMethodStr',
  ClientTakesWasteStr: 'o.clientTakesWasteStr',
  PriceTotal: 'o.PriceTotal',
  NewMessages: 'o.NewMessages',
  NewMessagesFCAdd: 'o.NewMessagesFCAdd',
  NewMessagesOMAdd: 'o.NewMessagesOMAdd',
  ProductionPrc: 'o.ProductionPrc',
  FormName: 'o.FormName',
  IsGroupOrder: 'o.IsGroupOrder',
  IdParent: 'o.IdParent',
  DepartmentName: 'd.Name',
};

function buildOrdersListOrderSql(sortField: unknown, sortDirection: unknown, idUser: unknown): string {
  const key = String(sortField ?? '').trim();
  const expr = key ? ORDERS_LIST_SORT_EXPR[key] : undefined;
  if (expr) {
    const direction = sortDirection === 'desc' ? 'DESC' : 'ASC';
    return ` ORDER BY ${expr} ${direction}`;
  }
  if (idUser) {
    return ` ORDER BY o.DateGeneration DESC`;
  }
  return ` ORDER BY o.Id DESC`;
}

function buildOrdersListFilters(
  query: Request['query'],
  options?: { groupMemberIds?: number[] },
): {
  whereSql: string;
  params: (number | string)[];
  orderSql: string;
} {
  const {
    sortField,
    sortDirection,
    dateRange,
    departmentId,
    idFilter,
    stateFilter,
    idUser,
  } = query;

  const groupMemberIds = (options?.groupMemberIds ?? []).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const hasGroupMembers = groupMemberIds.length > 0;

  let whereSql = '';
  const params: (number | string)[] = [];

  // Group view: only soft-delete + explicit member Ids. Do not apply date /
  // department / id / state filters — those would hide children that sit
  // far down the normal sorted list (e.g. outside the date window).
  if (hasGroupMembers) {
    if (idUser) {
      whereSql += ` AND o.IdUser = ?`;
      params.push(parseInt(String(idUser), 10));
    }
    whereSql += ` AND ${ORDERS_NOT_DELETED_SQL}`;
    const placeholders = groupMemberIds.map(() => '?').join(',');
    whereSql += ` AND o.Id IN (${placeholders})`;
    params.push(...groupMemberIds);
    const orderSql = buildOrdersListOrderSql(sortField, sortDirection, idUser);
    return { whereSql, params, orderSql };
  }

  const hasStateFilter =
    stateFilter !== undefined &&
    stateFilter !== null &&
    String(stateFilter).trim() !== '';

  if (idUser) {
    whereSql += ` AND o.IdUser = ?`;
    params.push(parseInt(String(idUser), 10));
  }

  if (dateRange) {
    whereSql += ` AND o.DateGeneration >= NOW() - INTERVAL ? DAY`;
    params.push(parseInt(String(dateRange), 10));
  }

  if (hasStateFilter) {
    const rawValues = parseStateFilterValues(stateFilter);
    const includeDeleted = rawValues.includes(ORDER_DELETED_FILTER_KEY);
    const states = rawValues.filter((n) => n !== ORDER_DELETED_FILTER_KEY);

    if (includeDeleted && states.length === 0) {
      // Only soft-deleted orders
      whereSql += ` AND ${ORDERS_IS_DELETED_SQL}`;
    } else if (includeDeleted && states.length > 0) {
      // Legacy Edition used State = -1; treat it as 0 when 0 is selected.
      const expandedStates =
        states.includes(0) && !states.includes(-1) ? [...states, -1] : states;
      const placeholders = expandedStates.map(() => '?').join(',');
      whereSql += ` AND ((${ORDERS_NOT_DELETED_SQL} AND o.State IN (${placeholders})) OR ${ORDERS_IS_DELETED_SQL})`;
      params.push(...expandedStates);
    } else if (states.length > 0) {
      const expandedStates =
        states.includes(0) && !states.includes(-1) ? [...states, -1] : states;
      const placeholders = expandedStates.map(() => '?').join(',');
      whereSql += ` AND ${ORDERS_NOT_DELETED_SQL} AND o.State IN (${placeholders})`;
      params.push(...expandedStates);
    } else {
      whereSql += ` AND ${ORDERS_NOT_DELETED_SQL}`;
    }
  } else {
    // No status filter → all non-deleted orders (previous default behaviour)
    whereSql += ` AND ${ORDERS_NOT_DELETED_SQL}`;
  }

  if (departmentId) {
    whereSql += ` AND o.DepartmentId = ?`;
    params.push(String(departmentId));
  }

  // Substring match on Id so typing "35" finds 135, 350, 3514, etc.
  const idFilterDigits = idFilter != null && String(idFilter).trim() !== ''
    ? String(idFilter).replace(/\D/g, '')
    : '';
  if (idFilterDigits) {
    whereSql += ` AND CAST(o.Id AS CHAR) LIKE ?`;
    params.push(`%${idFilterDigits}%`);
  }

  // Fallback when member ids were not pre-resolved.
  const groupMotherRaw = query.groupMotherId;
  const groupMotherId =
    groupMotherRaw != null && String(groupMotherRaw).trim() !== ''
      ? parseInt(String(groupMotherRaw), 10)
      : NaN;
  if (Number.isInteger(groupMotherId) && groupMotherId > 0) {
    whereSql += ` AND (o.Id = ? OR IFNULL(o.IdParent, 0) = ?)`;
    params.push(groupMotherId, groupMotherId);
  }

  const orderSql = buildOrdersListOrderSql(sortField, sortDirection, idUser);

  return { whereSql, params, orderSql };
}

/**
 * Resolve mother + all child order ids for a group filter.
 * Sources: mother Id, Orders.IdParent, Description "Group from orders: …".
 * Does NOT SELECT OrderObject (can be multi‑MB on optimized orders).
 */
async function resolveGroupMemberOrderIds(motherId: number): Promise<number[]> {
  const ids = new Set<number>();
  ids.add(motherId);

  const pool = getPool();
  try {
    // Children linked via IdParent — works even when they are far down the list.
    const [children] = (await pool.query(
      `SELECT Id FROM Orders WHERE IFNULL(IdParent, 0) = ?`,
      [motherId],
    )) as [Array<{ Id: number }>, unknown];

    for (const row of children) {
      const id = Number(row.Id);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }

    // Fallback: ids embedded in group description (no OrderObject blob).
    const [rows] = (await pool.query(
      `SELECT IsGroupOrder, Description FROM Orders WHERE Id = ? LIMIT 1`,
      [motherId],
    )) as [Array<{
      IsGroupOrder?: number | null;
      Description?: string | null;
    }>, unknown];

    const mother = rows[0];
    if (mother && Number(mother.IsGroupOrder) === 1) {
      const match = String(mother.Description ?? '').match(
        /Group from orders:\s*([0-9,\s]+)/i,
      );
      if (match?.[1]) {
        for (const part of match[1].split(',')) {
          const id = parseInt(part.trim(), 10);
          if (Number.isInteger(id) && id > 0) ids.add(id);
        }
      }
    }
  } catch (error) {
    console.error('resolveGroupMemberOrderIds failed:', error);
  }

  return Array.from(ids);
}

export interface OrdersPieces_Interface {
  Id:number;
  OrderId?: number; // Optional: Foreign key to Orders table
  MaterialSymbol: string;
  MaterialDescription: string;
  Width: number;
  Length: number;
  Th: number; // Thickness
  Grain:number;
  Quantity: number;
  Edge1Symbol?: string;
  Edge2Symbol?: string;
  Edge3Symbol?: string;
  Edge4Symbol?: string;
  WidthC?: number;
  LengthC?: number;
  QuantityTh?: number;
  IsShape?: number;
  MachineSymbolSet?: string | null;
  IdMachine?: number;
  AttachFile?: number;
  AttachFileName?: string;
  AttachFilePath?: string | null;
  // Dynamic fields from Custom1.PiecesListHiddenCols (all optional)
  Info1?: string | number | null;
  Info2?: string | number | null;
  Info3?: string | number | null;
  Info4?: string | number | null;
  Info5?: string | number | null;
  Params1?: string | number | null;
  Params2?: string | number | null;
  Params3?: string | number | null;
  Params4?: string | number | null;
  Params5?: string | number | null;
  Description1?: string | number | null;
  HandleMatSymbol?: string | number | null;
  HandleParams?: string | number | null;
  ColorVal?: string | number | null;
  ColorType?: string | number | null;
  LayersType?: string | number | null;
  SurfaceVal?: string | number | null;
  ParamProcess1Val?: string | number | null;
  EdgeProcessVal?: string | number | null;
  ParamProcess2Val?: string | number | null;
  EdgesSymbol?: string | number | null;
  Type?: string | number | null;
  /** Source piece Id when this row was copied onto a group (mother) order. */
  IdParent?: number | null;
  /** Source order Id when this row was copied onto a group (mother) order. */
  IdOrderParent?: number | null;
}


export interface OrderType {
  Id: number | null; // Optional for updates
  IdUser: number;
  DepartmentId: number;
  OwnNumber: string;
  Description: string;
  Comment?: string;
  DateGeneration: Date,
  DeliveryDate: Date | null;
  RealizationMethodStr: string;
  DeliveryMethodStr: string;
  PaymentMethodStr: string;
  ClientTakesWasteStr: string;
  CompanyName: string | null;
  FirstName: string | null;
  LastName: string | null;
  TaxId: string | null;
  City: string | null;
  MaterialsSymbols: string;

  UserEmail: string;
  State: number;
  Orientation: string;

  SheetWidth?: number;

  SheetHeight?: number

  //trzeba wziąć z innej tabeli niż Users
  Email: string;
  DepartmentName: string;
  FormName: string;
  OrderObject: Record<string, any>;
  IsGroupOrder?: number; // Added for group orders
  /** Mother order id for grouped children; 0 on the mother itself. */
  IdParent?: number;
  PriceTotal: string;
}



// fetch All orders --- only for admin
export const getAllOrders = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      getAllOrdersService(res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// -------------getting data from mysql--------------------


export const fetchAllOrdersSQL = async (req: Request, res: Response) => {
  const requestStart = performance.now();
  const timing = createOrdersListTiming();

  const {
    sortField,
    sortDirection,
    dateRange,
    departmentId,
    idFilter,
    stateFilter,
    idUser,
    groupMotherId,
    page: pageRaw,
    pageSize: pageSizeRaw,
  } = req.query;

  const pageSizeParam =
    pageSizeRaw !== undefined ? parseInt(String(pageSizeRaw), 10) : undefined;
  const pageParam = pageRaw !== undefined ? parseInt(String(pageRaw), 10) : undefined;
  const isPaginated = pageSizeParam !== undefined || pageParam !== undefined;
  const page = Math.max(1, Number.isFinite(pageParam!) ? pageParam! : 1);
  const pageSize = isPaginated
    ? Math.min(
        ORDERS_LIST_MAX_PAGE_SIZE,
        Math.max(1, Number.isFinite(pageSizeParam!) ? pageSizeParam! : ORDERS_LIST_DEFAULT_PAGE_SIZE)
      )
    : undefined;


  const cacheVersion = await getOrdersListCacheVersion();
  const cacheKey = `orders:v${cacheVersion}:${JSON.stringify({
    sortField,
    sortDirection,
    dateRange,
    departmentId,
    idFilter,
    stateFilter,
    idUser,
    groupMotherId,
    ...(isPaginated ? { page, pageSize } : {}),
  })}`;

  const cacheStart = performance.now();
  try {
    const cachedData = await redis.get(cacheKey);
    timing.cacheMs = performance.now() - cacheStart;

    if (cachedData) {
      timing.fromCache = true;

      try {
        const performanceMonitor = require('../middleware/performanceMonitor').default.getInstance();
        performanceMonitor.recordCacheHit('GET /orders');
      } catch (error) {
        console.error('❌ Error recording cache hit:', error);
      }

      const serializeStart = performance.now();
      const parsed: unknown = redis.parseCached(cachedData);
      const serialized = JSON.stringify(parsed);
      timing.serializeMs = performance.now() - serializeStart;
      timing.responseBytes = Buffer.byteLength(serialized, 'utf8');
      if (Array.isArray(parsed)) {
        timing.rowCount = parsed.length;
        timing.totalCount = parsed.length;
      } else if (parsed && typeof parsed === 'object') {
        const paginated = parsed as { items?: unknown[]; total?: number };
        timing.rowCount = Array.isArray(paginated.items) ? paginated.items.length : 0;
        timing.totalCount = typeof paginated.total === 'number' ? paginated.total : timing.rowCount;
      }
      timing.totalMs = performance.now() - requestStart;

      logOrdersListTiming(timing, true);
      recordOrdersListTiming(timing);
      applyTimingHeaders(res, timing);

      return res.json(parsed);
    }

  } catch (error) {
    timing.cacheMs = performance.now() - cacheStart;
  }

  const logicStart = performance.now();
  const motherIdParsed =
    groupMotherId != null && String(groupMotherId).trim() !== ''
      ? parseInt(String(groupMotherId), 10)
      : NaN;
  const groupMemberIds =
    Number.isInteger(motherIdParsed) && motherIdParsed > 0
      ? await resolveGroupMemberOrderIds(motherIdParsed)
      : undefined;
  const { whereSql, params, orderSql } = buildOrdersListFilters(req.query, {
    groupMemberIds,
  });
  timing.businessLogicMs = performance.now() - logicStart;

  const pool = getPool();
  let rows: any[] = [];
  let totalCount = 0;

  try {
    if (isPaginated) {
      const countStart = performance.now();
      const countQuery = `SELECT COUNT(*) as total ${ORDERS_LIST_BASE_FROM}${whereSql}`;
      const [countRows] = (await pool.query(countQuery, params)) as [Array<{ total: number }>, any];
      totalCount = Number(countRows[0]?.total ?? 0);
      timing.countSqlMs = performance.now() - countStart;

      const offset = (page - 1) * pageSize!;
      const dataQuery = `${ORDERS_LIST_SELECT}${ORDERS_LIST_BASE_FROM}${whereSql}${orderSql} LIMIT ? OFFSET ?`;
      const sqlStart = performance.now();
      const [dataRows] = (await pool.query(dataQuery, [...params, pageSize, offset])) as [any[], any];
      timing.sqlMs = performance.now() - sqlStart;
      rows = dataRows;
    } else {
      const dataQuery = `${ORDERS_LIST_SELECT}${ORDERS_LIST_BASE_FROM}${whereSql}${orderSql}`;
      const sqlStart = performance.now();
      const [dataRows] = (await pool.query(dataQuery, params)) as [any[], any];
      timing.sqlMs = performance.now() - sqlStart;
      rows = dataRows;
      totalCount = rows.length;
    }

    timing.rowCount = rows.length;
    timing.totalCount = totalCount;

    const serializeStart = performance.now();
    const payload = isPaginated
      ? {
          items: rows,
          total: totalCount,
          page,
          pageSize,
          timing: {
            sqlMs: Math.round(timing.sqlMs * 10) / 10,
            countSqlMs: Math.round(timing.countSqlMs * 10) / 10,
            serializeMs: 0,
            businessLogicMs: Math.round(timing.businessLogicMs * 10) / 10,
            cacheMs: Math.round(timing.cacheMs * 10) / 10,
            totalMs: 0,
            fromCache: false,
          },
        }
      : rows;
    const serialized = JSON.stringify(payload);
    timing.serializeMs = performance.now() - serializeStart;
    timing.responseBytes = Buffer.byteLength(serialized, 'utf8');

    if (isPaginated && payload && typeof payload === 'object' && 'timing' in payload) {
      (payload as any).timing.serializeMs = Math.round(timing.serializeMs * 10) / 10;
      (payload as any).timing.totalMs = Math.round((performance.now() - requestStart) * 10) / 10;
    }

    try {
      await redis.set(cacheKey, JSON.stringify(isPaginated ? payload : rows), 'EX', 60);
    } catch (error) {
      console.error('❌ Error caching fetchAllOrdersSQL:', error);
    }

    timing.totalMs = performance.now() - requestStart;

    logOrdersListTiming(timing, false);
    recordOrdersListTiming(timing);
    applyTimingHeaders(res, timing);

    res.json(isPaginated ? payload : rows);
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
};

export default fetchAllOrdersSQL;






export const getOrderByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rows = await fetchOrdersByIdSQL(req.params.id); // "2397" => number

    if (!rows.length) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(rows[0]); // frontend chce pojedynczy obiekt
  } catch (err) {
    next(err);        // globalny middleware obsłuży
  }
};

/**
 * Hot-path order load. Never SELECT OrderObject — optimized sheets JSON can be multi‑MB
 * and stalls the pool (Machines GET / navigation hang after Przelicz).
 * Full blob: fetchOrderObjectByIdSQL / GET /orders/:id/order-object
 */
const ORDER_SCALAR_COLUMNS = `
  Id, IdUser, Email, DepartmentId, OwnNumber, Description, Comment,
  DateGeneration, DateDelivery, DateExecution,
  RealizationMethodStr, DeliveryMethodStr, PaymentMethodStr, clientTakesWasteStr,
  CompanyName, Firstname, Lastname, TaxId,
  State, City, MaterialsSymbols, IsRead, FormName, PriceTotal, DeletedFlag,
  IsGroupOrder, IdParent, AttachFiles, Priority, AssignedSupervisor, AssignedWorker,
  PaymentMethod, PaymentState, DeliveryMethod,
  ZipCode, Street1, Street2, State1, Country, Phone,
  CompanyName_2, Firstname_2, Lastname_2, ZipCode_2, City_2,
  Street1_2, Street2_2, Country_2, Phone_2, Email_2, TaxId_2
`;

export const fetchOrdersByIdSQL = async (rawId: string | number) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError(`Id „${id}” nie jest prawidłowe`);
  }

  const [rows] = await getPool().query(
    `SELECT ${ORDER_SCALAR_COLUMNS} FROM Orders WHERE Id = ?`,
    [id]
  );

  // Placeholder OrderObject — sheets/CNC filled asynchronously after UI unlock.
  const mapped = (rows as any[]).map((row) => ({
    ...row,
    FirstName: row.Firstname ?? row.FirstName ?? '',
    LastName: row.Lastname ?? row.LastName ?? '',
    OrderObject: { sheets: [], pieceCncOperations: {} },
  }));

  if (mapped[0]) {
    mapped[0].FlagState = await readOrderFlagState(id);
  }

  return mapped;
};

/**
 * Quote path marker. Separate from the hot SELECT so a missing FlagState column
 * cannot take down order loading.
 */
async function readOrderFlagState(id: number): Promise<number> {
  try {
    const [rows] = await getPool().query(
      'SELECT FlagState FROM Orders WHERE Id = ? LIMIT 1',
      [id],
    );
    const value = Number((rows as Array<{ FlagState?: unknown }>)[0]?.FlagState ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch (error: any) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') {
      console.warn('readOrderFlagState failed', error);
    }
    return 0;
  }
}

const QUOTE_FLOW_FLAG_BY_STATE: Record<number, number> = {
  6: 60,
  3: 30,
  1: 10,
  2: 20,
};

/**
 * Quote workflow only. Sets Orders.State and Orders.FlagState.
 * State 6 does not send mail — the valuation template says the quote is already ready.
 * Accept (1) and decline (2) send the usual status mail when sendEmail is true.
 */
export const updateOrderQuoteFlow = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const state = Number(req.body?.State ?? req.body?.state);
  const flagState = Number(req.body?.FlagState ?? req.body?.flagState);
  const sendEmail = req.body?.sendEmail === true;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Missing order ID' });
  }
  if (QUOTE_FLOW_FLAG_BY_STATE[state] !== flagState) {
    return res.status(400).json({ message: 'Invalid quote flow state' });
  }

  const pool = getPool();
  try {
    const [prevRows] = await pool.query(
      `SELECT Id, IdUser, Email, Firstname, Lastname, CompanyName, OwnNumber, Description, PriceTotal, FormName, State
       FROM Orders WHERE Id = ? LIMIT 1`,
      [id],
    );
    const existing = Array.isArray(prevRows) ? (prevRows as any[])[0] : null;
    if (!existing) {
      return res.status(404).json({ message: 'Order not found' });
    }

    let flagPersisted = true;
    try {
      await pool.query('UPDATE Orders SET State = ?, FlagState = ? WHERE Id = ?', [
        state,
        flagState,
        id,
      ]);
    } catch (error: any) {
      if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
      flagPersisted = false;
      console.warn('Orders.FlagState missing — quote marker not stored, State still updated', { id });
      await pool.query('UPDATE Orders SET State = ? WHERE Id = ?', [state, id]);
    }

    const shouldSendEmail = sendEmail && state !== 6;
    let emailResult: OrderEmailResult | null = null;
    if (shouldSendEmail) {
      emailResult = await sendOrderStatusEmail({ ...existing, State: state }, id, state);
    }

    await invalidateOrdersListCache();
    return res.status(200).json({
      ok: true,
      orderId: id,
      State: state,
      FlagState: flagPersisted ? flagState : Number(existing.FlagState ?? 0),
      flagPersisted,
      ...(emailResult ?? {}),
    });
  } catch (error) {
    console.error('Error updating quote flow:', error);
    return res.status(500).json({ message: 'Failed to update quote flow' });
  }
};

/** Decode Orders.OrderObject from MySQL JSON / LONGTEXT / BLOB. */
function parseOrderObjectValue(raw: unknown): unknown {
  if (raw == null) return {};

  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8').trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object') {
    const maybeBuffer = raw as { type?: unknown; data?: unknown };
    if (maybeBuffer.type === 'Buffer' && Array.isArray(maybeBuffer.data)) {
      try {
        return JSON.parse(Buffer.from(maybeBuffer.data as number[]).toString('utf8'));
      } catch {
        return {};
      }
    }
    return raw;
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch {
      return {};
    }
  }

  return {};
}

/** Full OrderObject (sheets + CNC) — call after UI unlock; can be large. */
export const fetchOrderObjectByIdSQL = async (rawId: string | number) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError(`Id „${id}” nie jest prawidłowe`);
  }
  const [rows] = await getPool().query(
    'SELECT OrderObject FROM Orders WHERE Id = ? LIMIT 1',
    [id]
  );
  const row = Array.isArray(rows) ? (rows as any[])[0] : null;
  return parseOrderObjectValue(row?.OrderObject);
};

export const getOrderObjectByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderObject = await fetchOrderObjectByIdSQL(req.params.id);
    res.json({ success: true, OrderObject: orderObject });
  } catch (err) {
    next(err);
  }
};



export const deleteOrder = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Missing order ID' });
  }

  const pool = getPool();

  try {
    const [result] = await pool.query('UPDATE Orders SET DeletedFlag = 1 WHERE Id = ?', [id]);

    // Sprawdzamy, czy coś faktycznie zostało usunięte
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await invalidateOrdersListCache();
    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).send('Internal Server Error');
  }
};

/** Lightweight OwnNumber / Description patch (e.g. Coohom import after insertId known). */
export const patchOrderMeta = async (req: Request, res: Response) => {
  const { id } = req.params;
  const ownNumber =
    typeof req.body?.OwnNumber === 'string'
      ? req.body.OwnNumber
      : typeof req.body?.ownNumber === 'string'
        ? req.body.ownNumber
        : undefined;
  const description =
    typeof req.body?.Description === 'string'
      ? req.body.Description
      : typeof req.body?.description === 'string'
        ? req.body.description
        : undefined;

  if (!id) {
    return res.status(400).json({ message: 'Missing order ID' });
  }
  if (ownNumber === undefined && description === undefined) {
    return res.status(400).json({ message: 'Provide OwnNumber and/or Description' });
  }

  const pool = getPool();
  try {
    const sets: string[] = [];
    const values: Array<string | number> = [];
    if (ownNumber !== undefined) {
      sets.push('OwnNumber = ?');
      values.push(ownNumber);
    }
    if (description !== undefined) {
      sets.push('Description = ?');
      values.push(description);
    }
    values.push(id);
    const [result] = await pool.query(
      `UPDATE Orders SET ${sets.join(', ')} WHERE Id = ?`,
      values
    );
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    await invalidateOrdersListCache();
    return res.status(200).json({ ok: true, orderId: Number(id) });
  } catch (error) {
    console.error('Error patching order meta:', error);
    return res.status(500).send('Internal Server Error');
  }
};


/**
 * Bulk-set Orders.IdParent for group children.
 * Body: { orderIds: number[], idParent: number }
 * Mother keeps IdParent = 0; each child points at the mother id.
 */
export const updateOrdersIdParent = async (req: Request, res: Response) => {
  const orderIdsRaw = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  const idParent = Number(req.body?.idParent ?? req.body?.IdParent);
  const orderIds = Array.from(
    new Set(
      orderIdsRaw
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0),
    ),
  );

  if (orderIds.length === 0) {
    return res.status(400).json({ message: 'Provide at least one order id in orderIds.' });
  }
  if (!Number.isInteger(idParent) || idParent < 0) {
    return res.status(400).json({ message: 'idParent must be a non-negative integer.' });
  }
  if (orderIds.includes(idParent)) {
    return res.status(400).json({ message: 'An order cannot be its own parent.' });
  }

  const pool = getPool();
  try {
    const placeholders = orderIds.map(() => '?').join(', ');
    const [result] = await pool.query(
      `UPDATE Orders SET IdParent = ? WHERE Id IN (${placeholders})`,
      [idParent, ...orderIds],
    );
    await invalidateOrdersListCache();
    return res.status(200).json({
      ok: true,
      idParent,
      orderIds,
      affectedRows: (result as { affectedRows?: number }).affectedRows ?? 0,
    });
  } catch (error) {
    console.error('Error updating Orders.IdParent:', error);
    return res.status(500).json({ message: 'Failed to update Orders.IdParent' });
  }
};

/**
 * Dissolve a cutting group mother:
 * - children: Orders.IdParent = 0
 * - mother: Orders.DeletedFlag = 1 (soft-delete; UI “FlagDelete”)
 * Body: { motherId: number }
 */
export const dissolveCuttingOrderGroup = async (req: Request, res: Response) => {
  const motherId = Number(req.body?.motherId ?? req.body?.MotherId ?? req.body?.id);
  if (!Number.isInteger(motherId) || motherId <= 0) {
    return res.status(400).json({ message: 'Provide a valid motherId.' });
  }

  const pool = getPool();
  try {
    const [motherRows] = (await pool.query(
      `SELECT Id, IsGroupOrder FROM Orders WHERE Id = ? LIMIT 1`,
      [motherId],
    )) as [Array<{ Id: number; IsGroupOrder?: number | null }>, unknown];

    const mother = motherRows[0];
    if (!mother) {
      return res.status(404).json({ message: 'Group order not found.' });
    }

    const [childResult] = await pool.query(
      `UPDATE Orders SET IdParent = 0 WHERE IFNULL(IdParent, 0) = ?`,
      [motherId],
    );

    const [deleteResult] = await pool.query(
      `UPDATE Orders SET DeletedFlag = 1 WHERE Id = ?`,
      [motherId],
    );

    await invalidateOrdersListCache();

    return res.status(200).json({
      ok: true,
      motherId,
      childrenUnlinked: (childResult as { affectedRows?: number }).affectedRows ?? 0,
      motherDeleted: (deleteResult as { affectedRows?: number }).affectedRows ?? 0,
      wasGroupOrder: Number(mother.IsGroupOrder) === 1,
    });
  } catch (error) {
    console.error('Error dissolving cutting order group:', error);
    return res.status(500).json({ message: 'Failed to dissolve cutting order group' });
  }
};


export const updateOrderIsRead = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isRead } = req.body;

  if (!id || typeof isRead === 'undefined') {
    return res.status(400).json({ message: 'Missing order ID or isRead value' });
  }

  const pool = getPool();

  try {
    const [result] = await pool.query(
      'UPDATE Orders SET IsRead = ? WHERE Id = ?',
      [isRead, id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ message: 'Order read status updated successfully' });
  } catch (error) {
    console.error('Error updating order IsRead:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const updateOrderProductionPrc = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { productionPrc } = req.body;

  if (!id || productionPrc == null || productionPrc === '') {
    return res.status(400).json({ message: 'Missing order ID or productionPrc value' });
  }

  const pool = getPool();
  const value = Number(productionPrc);

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return res.status(400).json({ message: 'productionPrc must be a number between 0 and 100' });
  }

  try {
    const formatted = value.toFixed(2);
    const [result] = await pool.query(
      'UPDATE Orders SET ProductionPrc = ? WHERE Id = ?',
      [formatted, id],
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ message: 'Order production percent updated successfully', productionPrc: formatted });
  } catch (error) {
    console.error('Error updating order ProductionPrc:', error);
    res.status(500).send('Internal Server Error');
  }
};

/** Increment Orders.PackagesCreated by 1 (or set absolute value when increment=false). */
export const updateOrderPackagesCreated = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { increment = true, packagesCreated } = req.body;

  if (!id) {
    return res.status(400).json({ message: 'Missing order ID' });
  }

  const pool = getPool();

  try {
    if (increment === false || increment === 'false') {
      const value = Number(packagesCreated);
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ message: 'packagesCreated must be a non-negative number' });
      }
      const [result] = await pool.query(
        'UPDATE Orders SET PackagesCreated = ? WHERE Id = ?',
        [value, id],
      );
      if ((result as { affectedRows?: number }).affectedRows === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }
      return res.status(200).json({ success: true, packagesCreated: value });
    }

    const [result] = await pool.query(
      'UPDATE Orders SET PackagesCreated = COALESCE(PackagesCreated, 0) + 1 WHERE Id = ?',
      [id],
    );
    if ((result as { affectedRows?: number }).affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [rows] = await pool.query(
      'SELECT PackagesCreated FROM Orders WHERE Id = ? LIMIT 1',
      [id],
    );
    const updated = (rows as { PackagesCreated?: number }[])[0];
    res.status(200).json({
      success: true,
      packagesCreated: Number(updated?.PackagesCreated) || 0,
    });
  } catch (error) {
    console.error('Error updating order PackagesCreated:', error);
    res.status(500).send('Internal Server Error');
  }
};





export const fetchOrdersOptimizeJob = async (
  id: number,
  sortField?: string,
  sortDirection?: "asc" | "desc"
) => {
  try {
    const pool = getPool();

    // Build the SQL query to retrieve specific columns
    let query = `
      SELECT 
        Id,
        MaterialSymbol,
        OptimizeSheetQuantity,
        IdOrder,
        IdMachine,
        TimeStart,
        TimeStop,
        Description,
      
        State
      FROM OrdersOptimizeJob
      WHERE IdOrder = ?
    `;

    // Add sorting if sortField is provided
    if (sortField) {
      const escapedField = escapeId(sortField); // Sanitize field name to prevent SQL injection
      const direction = sortDirection === "desc" ? "DESC" : "ASC";
      query += ` ORDER BY ${escapedField} ${direction}`;
    }

    // Execute the query with the provided order ID
    const [rows] = await pool.query(query, [id]);

    return rows; // Return the results
  } catch (error) {
    console.error("Error fetching orders pieces:", error);
    throw error; // Re-throw the error to be handled in the route
  }
};


// export interface OrderType {
//   Id: number | null; // Optional for updates
//   idUser: number;
//   departmentId: number;
//   ownNumber: string;
//   description: string;
//   comment?: string;
//   dateExecution: Date | null;
//   realizationMethodStr: string;
//   deliveryMethodStr: string;
//   paymentMethod: string;
//   paymentMethodStr: string;
//   clientTakesWasteStr?: string;
//   companyName: string | null;
//   FirstName: string | null;
//   LastName: string | null;
//   TaxId: string | null;
//   userEmail: string;
//   state: number;
// }

export const insertOrUpdateOrder = async (req: Request, res: Response) => {  
  
  const orderData = req.body as any; // Using any to accept Orders_Interface from frontend
  console.log('orderData from insertOrUpdateOrder------------------', orderData)

  console.log("Processing order...");
  console.log('%cMyProject%cline:459%corderData', 'color:#fff;background:#ee6f57;padding:3px;border-radius:2px', 'color:#fff;background:#1f3c88;padding:3px;border-radius:2px', 'color:#fff;background:rgb(89, 61, 67);padding:3px;border-radius:2px', orderData)

  try {
    // Use the shared pool — initConnection()+end() opened extra TCP sessions to CyberFolks
    // and exhausted max_connections, so later requests (Machines, navigation) hung forever.
    const pool = getPool();

    if (orderData.Id) {
      // ===========================
      // UPDATE EXISTING ORDER
      // ===========================
      console.log(`Updating order with ID: ${orderData.Id}`);

      // Read previous State before UPDATE — emails fire on status change (or sendEmail flag).
      const [prevStateRows] = await pool.query(
        'SELECT State FROM Orders WHERE Id = ? LIMIT 1',
        [orderData.Id]
      );
      const prevStateRow = Array.isArray(prevStateRows) ? (prevStateRows as any[])[0] : null;
      const prevState = normalizeOrderState(prevStateRow?.State);

      const skipOrderObjectUpdate = orderData.skipOrderObjectUpdate === true;

      // Przelicz must NOT rewrite multi-MB OrderObject sheets in this UPDATE —
      // that stalls CyberFolks connections so edge/materials GETs hang with no logs.
      // Przelicz must NOT rewrite multi-MB OrderObject sheets in this UPDATE —
      // that stalls CyberFolks connections so edge/materials GETs hang with no logs.
      const query = skipOrderObjectUpdate
        ? `
        UPDATE Orders
        SET
          IdUser = ?, Email = ?, DepartmentId = ?, OwnNumber = ?, Description = ?, Comment = ?,
          DateDelivery = ?, DateExecution = ?, RealizationMethodStr = ?, DeliveryMethodStr = ?, PaymentMethodStr = ?,
          PaymentMethod = ?, PaymentState = ?, DeliveryMethod = ?, clientTakesWasteStr = ?, State = ?, 
          FormName = ?, IsGroupOrder = ?, PriceTotal = ?,
          Priority = ?, AssignedSupervisor = ?, AssignedWorker = ?,
          CompanyName = ?, Firstname = ?, Lastname = ?, ZipCode = ?, City = ?, Street1 = ?, Street2 = ?, 
          State1 = ?, Country = ?, Phone = ?, TaxId = ?,
          CompanyName_2 = ?, Firstname_2 = ?, Lastname_2 = ?, ZipCode_2 = ?, City_2 = ?, 
          Street1_2 = ?, Street2_2 = ?, Country_2 = ?, Phone_2 = ?, Email_2 = ?, TaxId_2 = ?,
          MaterialsSymbols = ?, AttachFiles = COALESCE(?, AttachFiles)
        WHERE Id = ?
      `
        : `
        UPDATE Orders
        SET
          IdUser = ?, Email = ?, DepartmentId = ?, OwnNumber = ?, Description = ?, Comment = ?,
          DateDelivery = ?, DateExecution = ?, RealizationMethodStr = ?, DeliveryMethodStr = ?, PaymentMethodStr = ?,
          PaymentMethod = ?, PaymentState = ?, DeliveryMethod = ?, clientTakesWasteStr = ?, State = ?, 
          FormName = ?, OrderObject = ?, IsGroupOrder = ?, PriceTotal = ?,
          Priority = ?, AssignedSupervisor = ?, AssignedWorker = ?,
          CompanyName = ?, Firstname = ?, Lastname = ?, ZipCode = ?, City = ?, Street1 = ?, Street2 = ?, 
          State1 = ?, Country = ?, Phone = ?, TaxId = ?,
          CompanyName_2 = ?, Firstname_2 = ?, Lastname_2 = ?, ZipCode_2 = ?, City_2 = ?, 
          Street1_2 = ?, Street2_2 = ?, Country_2 = ?, Phone_2 = ?, Email_2 = ?, TaxId_2 = ?,
          MaterialsSymbols = ?, AttachFiles = COALESCE(?, AttachFiles)
        WHERE Id = ?
      `;

      const baseParams = [
        orderData.IdUser,
        orderData.Email,
        orderData.DepartmentId,
        orderData.OwnNumber,
        orderData.Description,
        orderData.Comment || null,
        // FastCut sends DeliveryDate; admin StandardTab sends DateDelivery
        orderData.DateDelivery || orderData.DeliveryDate || null,
        orderData.DateExecution || null,
        orderData.RealizationMethodStr,
        orderData.DeliveryMethodStr,
        orderData.PaymentMethodStr,
        orderData.PaymentMethod || null,
        orderData.PaymentState || null,
        orderData.DeliveryMethod || null,
        orderData.ClientTakesWasteStr || '0',
        orderData.State,
        orderData.FormName,
      ];

      const afterFormNameParams = skipOrderObjectUpdate
        ? [
            orderData.IsGroupOrder || 0,
            orderData.PriceTotal,
            orderData.Priority || null,
            orderData.AssignedSupervisor || null,
            orderData.AssignedWorker || null,
            orderData.CompanyName || null,
            orderData.Firstname || orderData.FirstName || null,
            orderData.Lastname || orderData.LastName || null,
            orderData.ZipCode || null,
            orderData.City || null,
            orderData.Street1 || null,
            orderData.Street2 || null,
            orderData.State1 || null,
            orderData.Country || null,
            orderData.Phone || null,
            orderData.TaxId || null,
            orderData.CompanyName_2 || null,
            orderData.Firstname_2 || null,
            orderData.Lastname_2 || null,
            orderData.ZipCode_2 || null,
            orderData.City_2 || null,
            orderData.Street1_2 || null,
            orderData.Street2_2 || null,
            orderData.Country_2 || null,
            orderData.Phone_2 || null,
            orderData.Email_2 || null,
            orderData.TaxId_2 || null,
            orderData.MaterialsSymbols || null,
            orderData.AttachFiles != null ? Number(orderData.AttachFiles) : null,
            orderData.Id,
          ]
        : [
            JSON.stringify(orderData.OrderObject ?? {}),
            orderData.IsGroupOrder || 0,
            orderData.PriceTotal,
            orderData.Priority || null,
            orderData.AssignedSupervisor || null,
            orderData.AssignedWorker || null,
            orderData.CompanyName || null,
            orderData.Firstname || orderData.FirstName || null,
            orderData.Lastname || orderData.LastName || null,
            orderData.ZipCode || null,
            orderData.City || null,
            orderData.Street1 || null,
            orderData.Street2 || null,
            orderData.State1 || null,
            orderData.Country || null,
            orderData.Phone || null,
            orderData.TaxId || null,
            orderData.CompanyName_2 || null,
            orderData.Firstname_2 || null,
            orderData.Lastname_2 || null,
            orderData.ZipCode_2 || null,
            orderData.City_2 || null,
            orderData.Street1_2 || null,
            orderData.Street2_2 || null,
            orderData.Country_2 || null,
            orderData.Phone_2 || null,
            orderData.Email_2 || null,
            orderData.TaxId_2 || null,
            orderData.MaterialsSymbols || null,
            orderData.AttachFiles != null ? Number(orderData.AttachFiles) : null,
            orderData.Id,
          ];

      if (skipOrderObjectUpdate) {
        console.log(`Updating order ${orderData.Id} WITHOUT OrderObject (skipOrderObjectUpdate)`);
      }

      await pool.query(query, [...baseParams, ...afterFormNameParams]);

      const stateNum = normalizeOrderState(orderData.State);
      const stateChanged = prevState !== stateNum;
      // sendEmail: true → always; false → never; undefined → only when State changed
      const sendEmailFlag = orderData.sendEmail;
      const shouldSendEmail =
        sendEmailFlag === true || (sendEmailFlag !== false && stateChanged);

      let emailResult: OrderEmailResult;
      if (shouldSendEmail) {
        console.log('[orders.email] UPDATE path — will attempt email', {
          orderId: orderData.Id,
          state: stateNum,
          prevState,
          stateChanged,
          sendEmail: sendEmailFlag,
          email: orderData.Email,
        });
        emailResult = await sendOrderStatusEmail(orderData, orderData.Id, stateNum);
      } else {
        const skipReason =
          sendEmailFlag === false ? 'sendEmail=false' : 'state_unchanged';
        console.log('[orders.email] UPDATE path — skipped', {
          orderId: orderData.Id,
          state: stateNum,
          prevState,
          stateChanged,
          sendEmail: sendEmailFlag,
          reason: skipReason,
        });
        emailResult = skippedEmailResult(
          stateNum,
          skipReason,
          (orderData.Email || '').trim() || null
        );
      }

      void invalidateOrdersListCache();
      console.log(`✅ Order ${orderData.Id} updated successfully`);
      return res.status(201).json({
        Id: orderData.Id,
        orderId: orderData.Id,
        ...emailResult,
      });


    } else {
      // ====================
      // INSERT NEW ORDER
      // ====================
      console.log("Inserting new order...");
      const query = `
        INSERT INTO Orders (
          IdUser, Email, DepartmentId, OwnNumber, Description, Comment, DateDelivery,
          RealizationMethodStr, DeliveryMethodStr, PaymentMethodStr, clientTakesWasteStr, State, PaymentState, FormName, OrderObject, IsGroupOrder, IdParent, PriceTotal
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await pool.query(query, [
        orderData.IdUser,
        orderData.Email,
        orderData.DepartmentId,
        orderData.OwnNumber,
        orderData.Description,
        orderData.Comment || null,
        orderData.DeliveryDate,
        orderData.RealizationMethodStr,
        orderData.DeliveryMethodStr,
        orderData.PaymentMethodStr,
        orderData.ClientTakesWasteStr || '0',
        orderData.State,
        orderData.PaymentState ?? 0,
        orderData.FormName,
        JSON.stringify(orderData.OrderObject ?? {}),
        orderData.IsGroupOrder || 0,
        orderData.IdParent ?? 0,
        orderData.PriceTotal,
      ]);

      // ✅ Ensure `insertId` exists
      if (!result || !("insertId" in result)) {
        console.error("Failed to retrieve insertId after inserting order.");
        return res.status(500).json({ error: "Failed to create order" });
      }

      const orderId = (result as { insertId: number }).insertId;
      console.log(`New order created with ID: ${orderId}`);

      const stateNum = normalizeOrderState(orderData.State);
      const sendEmailFlag = orderData.sendEmail;
      // New drafts (State 0) must not email; submit/explicit sendEmail=true does.
      const shouldSendEmail =
        sendEmailFlag === true || (sendEmailFlag !== false && stateNum !== 0);

      let emailResult: OrderEmailResult;
      if (shouldSendEmail) {
        console.log('[orders.email] INSERT path — will attempt email', {
          orderId,
          state: stateNum,
          sendEmail: sendEmailFlag,
          email: orderData.Email,
        });
        emailResult = await sendOrderStatusEmail(orderData, orderId, stateNum);
      } else {
        const skipReason =
          sendEmailFlag === false ? 'sendEmail=false' : 'draft_insert_no_email';
        console.log('[orders.email] INSERT path — skipped', {
          orderId,
          state: stateNum,
          sendEmail: sendEmailFlag,
          reason: skipReason,
        });
        emailResult = skippedEmailResult(
          stateNum,
          skipReason,
          (orderData.Email || '').trim() || null
        );
      }

      void invalidateOrdersListCache();
      console.log(`✅ Order ${orderId} created successfully`);
      return res.status(201).json({ orderId, Id: orderId, ...emailResult });
    }
  } catch (error) {
    console.error("Error processing order:", error);
    throw error;
  }
};


export const sendStatusNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { newStatus, email, phone } = req.body;

    const pool = getPool();

    // 1) Update order status in DB
    await pool.query("UPDATE Orders SET State = ? WHERE Id = ?", [newStatus, id]);
    await invalidateOrdersListCache();

    // 2) (Optional) fetch order or user data for EJS template
    const orderData = { status: newStatus, userEmail: email };

    const recipientEmail = orderData.userEmail?.trim() || 'maciejkruszyniak@gmail.com'; // your default backup email

    // 3) Send email
    await sendMail({
      email: 'maciejkruszyniak@gmail.com',
      subject: orderData.status ? "Order Update" : "Order Confirmation",
      template: orderData.status ? "order-statusUpdate.ejs" : "Orders_state0_order-confirmation.ejs",
        data: { orderData },
    });

    // 4) Send SMS notification for status change
    if (phone && newStatus) {
      try {
        const { sendTemplateSms } = await import('./sms.controller');
        
        // Get status name based on status number
        const statusNames: Record<number, string> = {
          0: 'Order Confirmation',
          1: 'Order Edition/Correction', 
          2: 'Order Rejection',
          3: 'Order Valuation',
          4: 'Order Realization',
          5: 'Order Ready for Pickup',
          10: 'Order Waiting for Payment'
        };

        const statusName = statusNames[newStatus] || `Status ${newStatus}`;
        
        // Send SMS using template
        const smsResult = await sendTemplateSms({
          body: {
            to: phone,
            templateId: 'order_status_change',
            variables: {
              orderId: id,
              newStatus: statusName,
              trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders/${id}`
            }
          }
        } as any, res);

        console.log('SMS notification sent for order status change');
      } catch (smsError) {
        console.warn('SMS notification failed:', smsError);
        // Don't fail the whole request if SMS fails
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in sendStatusNotification:", error);
    next(error);
  }
};

export const fetchOrdersOptimizeWastes = async (req: Request, res: Response) => {
  const pool = getPool();

  const query = `
    SELECT *
    FROM OrdersOptimizeWastes
  `;

  try {
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching OrdersOptimizeWastes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateOrdersOptimizeWaste = async (req: Request, res: Response) => {
  const { Id, Length, Width, Priority, Description } = req.body;

  if (!Length || !Width) {
    return res.status(400).json({ error: 'Length and Width are required' });
  }

  const pool = getPool();

  try {
    let result;
    console.log('%cMyProject%cline:610%cId', 'color:#fff;background:#ee6f57;padding:3px;border-radius:2px', 'color:#fff;background:#1f3c88;padding:3px;border-radius:2px', 'color:#fff;background:rgb(95, 92, 51);padding:3px;border-radius:2px', Id)

    if (Id) {
      // 🔁 UPDATE existing waste
      const updateQuery = `
        UPDATE OrdersOptimizeWastes
        SET Length = ?, Width = ?, Priority = ?, Description = ?
        WHERE Id = ?
      `;
      result = await pool.query(updateQuery, [Length, Width, Priority, Description, Id]);
    } else {
      // ➕ INSERT new waste
      const insertQuery = `
        INSERT INTO OrdersOptimizeWastes (Length, Width, Priority, Description)
        VALUES (?, ?, ?, ?)
      `;
      result = await pool.query(insertQuery, [Length, Width, Priority, Description]);
    }

    res.json({ message: 'Success', result });
  } catch (error) {
    console.error('Error in upsertOrdersOptimizeWaste:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateOrderObject = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { orderObject } = req.body;

  try {
    const pool = getPool();

    const query = `
      UPDATE Orders
      SET OrderObject = ?
      WHERE Id = ?
    `;

    let payload = orderObject ?? {};
    try {
      const existing = await fetchOrderObjectByIdSQL(orderId);
      const existingIds =
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as { batchChildOrderIds?: unknown }).batchChildOrderIds
          : undefined;
      const incomingIsObject = payload && typeof payload === 'object' && !Array.isArray(payload);
      const incomingIds = incomingIsObject
        ? (payload as { batchChildOrderIds?: unknown }).batchChildOrderIds
        : undefined;
      if (Array.isArray(existingIds) && existingIds.length > 0 && incomingIsObject && !Array.isArray(incomingIds)) {
        payload = { ...(payload as Record<string, unknown>), batchChildOrderIds: existingIds };
      }
    } catch (mergeError) {
      console.warn('Could not preserve batchChildOrderIds on OrderObject update:', mergeError);
    }

    await pool.query(query, [
      JSON.stringify(payload),
      orderId,
    ]);

    console.log(`OrderObject updated for order ID: ${orderId}`);
    res.status(200).json({ success: true, message: "OrderObject updated successfully" });
  } catch (error) {
    console.error('Error updating OrderObject:', error);
    res.status(500).json({ error: "Failed to update OrderObject" });
  }
};
