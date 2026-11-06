import { SHINE_RECENT_GAIN_MS } from '../../config/project';
import type { OrderRow } from '../types';
import { parseProductionPercent } from './percent';

const SNAPSHOT_KEY = 'tajhmajster_prc_snapshot';
const GAINS_KEY = 'tajhmajster_prc_gains';
const LAST_GAIN_KEY = 'tajhmajster_last_prc_gain';
/** Keep observed gains for sort boost (ms). */
const GAIN_TTL_MS = 48 * 60 * 60 * 1000;

export type GainTrackResult = {
  gainTimes: Map<number, number>;
  /** Czy w tym przebiegu wykryto świeży przyrost %. */
  hadFreshGain: boolean;
  /** Najnowszy znany przyrost (ms) albo null. */
  lastGainAt: number | null;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getLastProductionGainAt(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_GAIN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function setLastProductionGainAt(ts: number): void {
  try {
    sessionStorage.setItem(LAST_GAIN_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * Compare current ProductionPrc to last snapshot; when % rises, stamp "now".
 * Returns gain map + whether this pass saw a fresh increase.
 */
export function trackProductionGains(orders: OrderRow[]): GainTrackResult {
  const prev = readJson<Record<string, number>>(SNAPSHOT_KEY, {});
  const gains = readJson<Record<string, number>>(GAINS_KEY, {});
  const nextSnap: Record<string, number> = {};
  const now = Date.now();
  let hadFreshGain = false;

  for (const o of orders) {
    const id = String(o.Id);
    const pct = parseProductionPercent(o.ProductionPrc) ?? 0;
    nextSnap[id] = pct;
    if (prev[id] != null && pct > prev[id] + 0.001) {
      gains[id] = now;
      hadFreshGain = true;
    }
  }

  for (const [id, ts] of Object.entries(gains)) {
    if (now - ts > GAIN_TTL_MS) delete gains[id];
  }

  let lastGainAt = getLastProductionGainAt();
  if (hadFreshGain) {
    lastGainAt = now;
    setLastProductionGainAt(now);
  } else if (lastGainAt == null) {
    for (const ts of Object.values(gains)) {
      if (lastGainAt == null || ts > lastGainAt) lastGainAt = ts;
    }
    if (lastGainAt != null) setLastProductionGainAt(lastGainAt);
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
  return { gainTimes: out, hadFreshGain, lastGainAt };
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

/** Czy zlecenie miało przyrost % w oknie shine / „ostatni czas”. */
export function hasRecentProductionGain(
  orderId: number,
  gainTimes: Map<number, number>,
  withinMs = SHINE_RECENT_GAIN_MS,
  now = Date.now(),
): boolean {
  const ts = gainTimes.get(orderId);
  if (ts == null) return false;
  return now - ts < withinMs;
}
