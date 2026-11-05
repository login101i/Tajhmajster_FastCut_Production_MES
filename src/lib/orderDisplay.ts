import {
  MIN_PRODUCTION_ORDER_ID,
  ORDER_STATE_ON_PRODUCTION,
} from '../../config/project';
import type { OrderRow } from '../types';
import { parseProductionPercent } from './percent';

export function orderIdLabel(row: OrderRow): string {
  const parent = Number(row.IdParent) || 0;
  const isGroupMother = Number(row.IsGroupOrder) === 1;
  if (!isGroupMother && parent > 0) {
    return `${row.Id} / ${parent}`;
  }
  return String(row.Id);
}

export function buildDisplayRows(orders: OrderRow[]): Array<OrderRow & { depth: number }> {
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

  for (const o of orders) {
    if (!placedAsChild.has(o.Id)) roots.push(o);
  }

  roots.sort((a, b) => b.Id - a.Id);

  const out: Array<OrderRow & { depth: number }> = [];
  for (const root of roots) {
    out.push({ ...root, depth: 0 });
    const kids = (children.get(root.Id) || []).slice().sort((a, b) => a.Id - b.Id);
    for (const kid of kids) out.push({ ...kid, depth: 1 });
  }
  return out;
}

export function stateStatusLabel(state: number): string {
  const map: Record<number, string> = {
    [-1]: 'Edycja/korekta (-1)',
    0: 'Nowe (0)',
    1: 'Pobrane (1)',
    2: 'Oferta (2)',
    3: 'Zamówione (3)',
    4: 'Realizacja (4)',
    5: 'Zakończone (5)',
  };
  return map[state] ?? `Status (${state})`;
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
  const roots = orders.filter(
    (o) => Number(o.IsGroupOrder) === 1 || !Number(o.IdParent),
  );
  const pool = roots
    .filter(
      (o) =>
        Number(o.State) === ORDER_STATE_ON_PRODUCTION &&
        o.Id >= MIN_PRODUCTION_ORDER_ID,
    )
    .slice()
    .sort((a, b) => a.Id - b.Id);
  return pool.slice(0, limit);
}

/** Group display rows into mother+children blocks for View 1 spacing. */
export function buildDisplayGroups(
  orders: OrderRow[],
): Array<Array<OrderRow & { depth: number }>> {
  const rows = buildDisplayRows(orders);
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
  return groups;
}
