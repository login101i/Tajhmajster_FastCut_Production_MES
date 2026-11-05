import { isChildProductionsGroup } from '../../config/project';
import type { OrderDetailResponse, OrdersResponse } from '../types';

const TOKEN_KEY = 'tajhmajster_monitor_token';

export function getStoredToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken() || import.meta.env.VITE_MONITOR_TOKEN || '';
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    'x-monitor-token': token,
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { ...authHeaders() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}

export function fetchOrders(
  opts: {
    state?: string;
    q?: string;
    limit?: number;
    groupId?: number;
    /** Filter roots by Orders.DateGeneration >= fromDate (YYYY-MM-DD) */
    fromDate?: string;
    /** Filter roots by Orders.Id >= minId */
    minId?: number;
  } = {},
) {
  const qs = new URLSearchParams();
  qs.set('state', opts.state ?? '');
  if (opts.q) qs.set('q', opts.q);
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.groupId) qs.set('groupId', String(opts.groupId));
  if (opts.fromDate) qs.set('fromDate', opts.fromDate);
  if (opts.minId) qs.set('minId', String(opts.minId));
  return apiGet<OrdersResponse>(`/api/orders?${qs.toString()}`);
}

export function fetchOrderDetail(id: number) {
  return apiGet<OrderDetailResponse>(`/api/order-detail?id=${id}`);
}

export type GroupChildrenSyncResult = {
  success: boolean;
  groupId: number;
  dryRun?: boolean;
  motherProductionPrc?: string | number | null;
  motherStamped?: number;
  motherTotalQty?: number;
  children?: Array<{
    childId: number;
    previousPrc: string | number | null;
    productionPrc: string;
    stamped: number;
    totalQty: number;
    pieceRows: number;
  }>;
  productions?: Array<{
    childId: number;
    productionId: number | null;
    action: 'updated' | 'inserted' | 'skipped';
    productionPercent: string;
  }>;
  checklist?: Array<Record<string, unknown>>;
  syncedAt?: string;
  error?: string;
};

/** dryRun=true → only read stamp/qty stats (no UPDATE). */
export function syncGroupChildrenPrc(
  groupId: number,
  opts: { dryRun?: boolean; createChildProductions?: boolean } = {},
) {
  const qs = new URLSearchParams({ groupId: String(groupId) });
  if (opts.dryRun) qs.set('dryRun', '1');
  if (opts.createChildProductions) qs.set('createChildProductions', '1');
  return apiGet<GroupChildrenSyncResult>(`/api/sync-group-children-prc?${qs.toString()}`);
}

export type OrdersToSyncChild = {
  id: number;
  description: string;
  productionPrc: string | number | null;
  state: number;
};

export type OrdersToSyncGroup = {
  groupId: number;
  mother: OrdersToSyncChild;
  children: OrdersToSyncChild[];
};

export type OrdersToSyncPrcResponse = {
  success: boolean;
  from: string;
  minId?: number;
  groups: OrdersToSyncGroup[];
  error?: string;
};

/** Group mothers only (State=4, Id>=minId). Optional from = Productions.DateAdd filter. Standalones are never listed. */
export function fetchOrdersToSyncPrc(opts: { from?: string; minId?: number } = {}) {
  const qs = new URLSearchParams();
  if (opts.from) qs.set('from', opts.from);
  if (opts.minId) qs.set('minId', String(opts.minId));
  const q = qs.toString();
  return apiGet<OrdersToSyncPrcResponse>(`/api/orders-to-sync-prc${q ? `?${q}` : ''}`);
}

/** Run sync for many groups in small batches to avoid flooding the API. */
export async function syncGroupChildrenPrcBatch(
  groupIds: number[],
  opts: { dryRun?: boolean; createChildProductions?: boolean; batchSize?: number } = {},
) {
  const batchSize = Math.max(1, opts.batchSize ?? 8);
  const results: GroupChildrenSyncResult[] = [];
  for (let i = 0; i < groupIds.length; i += batchSize) {
    const chunk = groupIds.slice(i, i + batchSize);
    const part = await Promise.all(
      chunk.map((groupId) =>
        syncGroupChildrenPrc(groupId, {
          dryRun: opts.dryRun,
          createChildProductions:
            opts.createChildProductions && isChildProductionsGroup(groupId),
        }),
      ),
    );
    results.push(...part);
  }
  return results;
}
