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
  opts: { state?: string; q?: string; limit?: number; groupId?: number } = {},
) {
  const qs = new URLSearchParams();
  qs.set('state', opts.state ?? '');
  if (opts.q) qs.set('q', opts.q);
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.groupId) qs.set('groupId', String(opts.groupId));
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
