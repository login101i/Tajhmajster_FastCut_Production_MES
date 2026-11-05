import type { OrderRow } from '../types';
import { parseProductionPercent } from './percent';

const SNAPSHOT_KEY = 'tajhmajster_prc_snapshot';
const GAINS_KEY = 'tajhmajster_prc_gains';
/** Keep observed gains for sort boost (ms). */
const GAIN_TTL_MS = 48 * 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Compare current ProductionPrc to last snapshot; when % rises, stamp "now".
 * Returns map orderId → last gain timestamp (ms).
 */
export function trackProductionGains(orders: OrderRow[]): Map<number, number> {
  const prev = readJson<Record<string, number>>(SNAPSHOT_KEY, {});
  const gains = readJson<Record<string, number>>(GAINS_KEY, {});
  const nextSnap: Record<string, number> = {};
  const now = Date.now();

  for (const o of orders) {
    const id = String(o.Id);
    const pct = parseProductionPercent(o.ProductionPrc) ?? 0;
    nextSnap[id] = pct;
    if (prev[id] != null && pct > prev[id] + 0.001) {
      gains[id] = now;
    }
  }

  for (const [id, ts] of Object.entries(gains)) {
    if (now - ts > GAIN_TTL_MS) delete gains[id];
  }

  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(nextSnap));
    sessionStorage.setItem(GAINS_KEY, JSON.stringify(gains));
  } catch {
    /* ignore quota */
  }

  const out = new Map<number, number>();
  for (const [id, ts] of Object.entries(gains)) {
    const n = Number(id);
    if (Number.isFinite(n)) out.set(n, ts);
  }
  return out;
}

export function activityTimestamp(
  row: OrderRow,
  gainTimes?: Map<number, number>,
): number {
  const fromGain = gainTimes?.get(row.Id) ?? 0;
  const raw = row.LastActivityAt || row.DateMod || '';
  const fromDb = Date.parse(String(raw).replace(' ', 'T'));
  const dbTs = Number.isFinite(fromDb) ? fromDb : 0;
  return Math.max(fromGain, dbTs);
}
