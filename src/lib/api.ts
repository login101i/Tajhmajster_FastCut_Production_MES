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

export function fetchOrders(opts: { state?: string; q?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  qs.set('state', opts.state ?? '4');
  if (opts.q) qs.set('q', opts.q);
  if (opts.limit) qs.set('limit', String(opts.limit));
  return apiGet<OrdersResponse>(`/api/orders?${qs.toString()}`);
}

export function fetchOrderDetail(id: number) {
  return apiGet<OrderDetailResponse>(`/api/order-detail?id=${id}`);
}
