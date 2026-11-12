import {
  MIN_PRODUCTION_ORDER_ID,
  ORDER_STATE_ON_PRODUCTION,
  ORDER_STATE_READY_FOR_PICKUP,
  ORDER_STATE_REJECTED,
  ZERO_PCT_IDLE_DROP_MS,
} from '../../config/project';
import type { OrderRow } from '../types';
import { parseProductionPercent } from './percent';
import { activityTimestamp } from './recentGains';

export function orderIdLabel(row: OrderRow): string {
  return String(row.Id);
}

/** Max % w grupie (matka + dzieci) — matka często ma 0 przy postępie dzieci. */
export function groupProgressPct(root: OrderRow, kids: OrderRow[] = []): number {
  return Math.max(pctOf(root), 0, ...kids.map(pctOf));
}

/**
 * Postęp „ukończenia” grupy do Widoku 2:
 * min % dzieci (matka OptiCut często 0 — nie blokuje).
 * Standalone = własne %.
 */
export function groupCompletionPct(root: OrderRow, kids: OrderRow[] = []): number {
  if (kids.length === 0) return pctOf(root);
  return Math.min(...kids.map(pctOf));
}

/** State = 5 (Do odbioru). */
export function isReadyForPickupState(row: OrderRow): boolean {
  return Number(row.State) === ORDER_STATE_READY_FOR_PICKUP;
}

export function isDelivered(row: OrderRow): boolean {
  return Number(row.FlagOut) === 1;
}

/** Data wysłania na produkcję (preferuj DateExecution). */
export function productionSentAt(row: OrderRow): number {
  const raw = row.DateExecution || row.DateMod || row.DateGeneration || '';
  const t = Date.parse(String(raw).replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Widok 1 — priorytet listy (niższy = wyżej):
 * 0 = w toku (0 < % < 100)
 * 1 = 0%, wysłane < 24 h (świeże na produkcji)
 * 2 = 0%, bez ruchu > 24 h (spadają w dół)
 * 3 = ukończone (≥ 100%) / wydane
 */
export function view1ListTier(
  root: OrderRow,
  kids: OrderRow[] = [],
  now = Date.now(),
): number {
  const p = groupProgressPct(root, kids);
  if (p > 0 && p < 100) return 0;
  if (p >= 100 || isDelivered(root)) return 3;
  const sent = Math.max(
    productionSentAt(root),
    ...kids.map(productionSentAt),
  );
  if (sent > 0 && now - sent <= ZERO_PCT_IDLE_DROP_MS) return 1;
  return 2;
}

/** Najnowsza aktywność grupy = max(matka, dzieci, lokalne przyrosty %). */
function groupActivityTs(
  root: OrderRow,
  kids: OrderRow[],
  gainTimes?: Map<number, number>,
): number {
  let max = activityTimestamp(root, gainTimes);
  for (const kid of kids) {
    max = Math.max(max, activityTimestamp(kid, gainTimes));
  }
  return max;
}

export function buildDisplayRows(
  orders: OrderRow[],
  gainTimes?: Map<number, number>,
): Array<OrderRow & { depth: number }> {
  const byId = new Map(orders.map((o) => [o.Id, o]));
  const children = new Map<number, OrderRow[]>();
  const roots: OrderRow[] = [];
  const placedAsChild = new Set<number>();

  for (const o of orders) {
    const parent = Number(o.IdParent) || 0;
    const isMother = Number(o.IsGroupOrder) === 1;
    if (!isMother && parent && byId.has(parent)) {
      const list = children.get(parent) || [];
      list.push(o);
      children.set(parent, list);
      placedAsChild.add(o.Id);
    }
  }

  /* Podzlecenia w grupie: stała kolejność Id DESC (bez przetasowań po %) */
  for (const [parentId, list] of children) {
    list.sort((a, b) => b.Id - a.Id);
    children.set(parentId, list);
  }

  for (const o of orders) {
    if (!placedAsChild.has(o.Id)) roots.push(o);
  }

  const now = Date.now();
  roots.sort((a, b) => {
    const kidsA = children.get(a.Id) || [];
    const kidsB = children.get(b.Id) || [];
    const tier = view1ListTier(a, kidsA, now) - view1ListTier(b, kidsB, now);
    if (tier !== 0) return tier;
    const act =
      groupActivityTs(b, kidsB, gainTimes) - groupActivityTs(a, kidsA, gainTimes);
    if (act !== 0) return act;
    return b.Id - a.Id;
  });

  const out: Array<OrderRow & { depth: number }> = [];
  for (const root of roots) {
    out.push({ ...root, depth: 0 });
    const kids = children.get(root.Id) || [];
    for (const kid of kids) out.push({ ...kid, depth: 1 });
  }
  return out;
}

export function stateStatusLabel(state: number): string {
  const map: Record<number, string> = {
    [-1]: 'Edycja/korekta (-1)',
    1: 'Pobrane (1)',
    2: 'Odrzucone (2)',
    3: 'Wycena (3)',
    4: 'Realizacja (4)',
    5: 'Do odbioru (5)',
    10: 'Oczekiwanie na wpłatę (10)',
  };
  return map[state] ?? `Status (${state})`;
}

export function isRejected(row: OrderRow): boolean {
  return Number(row.State) === ORDER_STATE_REJECTED;
}

/** Widoczne na monitorze: Realizacja LUB ProductionPrc > 0. */
export function isMonitorVisibleRoot(root: OrderRow, kids: OrderRow[] = []): boolean {
  if (Number(root.State) === ORDER_STATE_ON_PRODUCTION) return true;
  if (pctOf(root) > 0) return true;
  return kids.some((k) => pctOf(k) > 0);
}

export function optimizeStatusLabel(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '';
  return `(${v})`;
}

export function onlineStatusLabel(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '';
  if (Number(v) === -1) return 'Edycja/k…';
  return String(v);
}

export function typeLetter(row: OrderRow): { letter: string; tone: 'red' | 'green' | 'muted' } {
  const t = Number(row.Type);
  const str = (row.TypeStr || '').toLowerCase();
  if (str.includes('internet') || t === 1) return { letter: 'P', tone: 'green' };
  if (str.includes('wewn') || t === 0 || t === 2) return { letter: 'F', tone: 'red' };
  if (row.TypeStr) return { letter: row.TypeStr.slice(0, 1).toUpperCase(), tone: 'muted' };
  return { letter: '', tone: 'muted' };
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value).replace('T', ' ');
  return s.length > 16 ? s.slice(0, 16) : s;
}

export function pctOf(row: OrderRow): number {
  return parseProductionPercent(row.ProductionPrc) ?? 0;
}

/** Start of current ISO week (Monday 00:00 local). */
export function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function parseOrderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * View 3: root orders in Realizacja with Id >= MIN_PRODUCTION_ORDER_ID.
 */
export function pickBoardOrders(orders: OrderRow[], limit = 200): OrderRow[] {
  return buildBoardClusters(orders, limit).map((c) => c.root);
}

export type BoardCluster = {
  rootId: number;
  root: OrderRow;
  isGroup: boolean;
  /** Mother first, then children (Id ASC). Standalone = [root]. */
  members: OrderRow[];
  /** Lane placement uses mother / standalone ProductionPrc. */
  pct: number;
};

/** View 3: ma postęp (ProductionPrc > 0). */
export function isProductionStarted(row: OrderRow): boolean {
  return pctOf(row) > 0;
}

/**
 * Widok 2 — gotowe do pokazania na tablicy:
 * 100% ukończenia (grupa = wszystkie dzieci) ALBO State = 5 (Do odbioru).
 * Niepełne (< 100%) zostają w Widoku 1.
 */
export function isBoardReady(root: OrderRow, kids: OrderRow[] = []): boolean {
  if (isDelivered(root)) return false;
  if (isReadyForPickupState(root)) return true;
  return groupCompletionPct(root, kids) >= 100;
}

/** @deprecated Widok 2 nie pokazuje już zleceń w toku — tylko Widok 1. */
export function isBoardInProgress(_root: OrderRow, _pct: number): boolean {
  return false;
}

/** Widok 2 / Do odbioru: 100% lub State 5, jeszcze nie wydane. */
export function isBoardPickup(root: OrderRow, pct: number): boolean {
  if (isDelivered(root)) return false;
  if (isReadyForPickupState(root)) return true;
  return pct >= 100;
}

/**
 * Widok 2 clusters: tylko ukończone (100% / State 5).
 * Grupy: matka + dzieci razem; FlagOut=1 pomijamy.
 */
export function buildBoardClusters(
  orders: OrderRow[],
  limit = 200,
): BoardCluster[] {
  const byId = new Map(orders.map((o) => [o.Id, o]));
  const childrenByParent = new Map<number, OrderRow[]>();

  for (const o of orders) {
    const parent = Number(o.IdParent) || 0;
    if (parent > 0 && byId.has(parent)) {
      const list = childrenByParent.get(parent) || [];
      list.push(o);
      childrenByParent.set(parent, list);
    }
  }

  for (const [parentId, list] of childrenByParent) {
    list.sort((a, b) => b.Id - a.Id);
    childrenByParent.set(parentId, list);
  }

  const roots = orders.filter(
    (o) => Number(o.IsGroupOrder) === 1 || !Number(o.IdParent),
  );
  const pool = roots
    .filter((o) => o.Id >= MIN_PRODUCTION_ORDER_ID && !isDelivered(o))
    .slice()
    .sort((a, b) => a.Id - b.Id);

  const clusters: BoardCluster[] = [];

  for (const root of pool) {
    if (clusters.length >= limit) break;

    const isGroup = Number(root.IsGroupOrder) === 1;
    const kids = isGroup ? childrenByParent.get(root.Id) || [] : [];

    if (!isBoardReady(root, kids)) continue;

    if (!isGroup) {
      clusters.push({
        rootId: root.Id,
        root,
        isGroup: false,
        members: [root],
        pct: pctOf(root),
      });
      continue;
    }

    const members = [
      root,
      ...kids.filter((k) => isProductionStarted(k) || pctOf(k) >= 100),
    ];

    clusters.push({
      rootId: root.Id,
      root,
      isGroup: true,
      members,
      pct: groupCompletionPct(root, kids),
    });
  }

  return clusters;
}

/**
 * CSS grid (row-major) + 2 kolumny: ułóż DOM tak, by wizualnie
 * sortowanie szło kolumnami (najpierw lewa góra→dół, potem prawa).
 * Wejście: już posortowana lista (np. % malejąco).
 */
export function arrangeForCssGridColumnMajor<T>(items: T[], cols = 2): T[] {
  const n = items.length;
  if (n <= 1 || cols <= 1) return items;
  const rows = Math.ceil(n / cols);
  const out: T[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = c * rows + r;
      if (src < n) out.push(items[src]);
    }
  }
  return out;
}

/** Group display rows into mother+children blocks for View 1 spacing. */
export function buildDisplayGroups(
  orders: OrderRow[],
  gainTimes?: Map<number, number>,
  _opts?: { columnMajorChildren?: boolean },
): Array<Array<OrderRow & { depth: number }>> {
  const rows = buildDisplayRows(orders, gainTimes);
  const groups: Array<Array<OrderRow & { depth: number }>> = [];
  let current: Array<OrderRow & { depth: number }> = [];

  for (const row of rows) {
    if (row.depth === 0) {
      if (current.length) groups.push(current);
      current = [row];
    } else {
      if (!current.length) current = [];
      current.push(row);
    }
  }
  if (current.length) groups.push(current);

  /* Kolejność dzieci: Id DESC z buildDisplayRows — bez układania pod sort % */
  return groups;
}
