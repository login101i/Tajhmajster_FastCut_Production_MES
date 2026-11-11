/** Historia IdJoin w sesji (cofnięcia + kliknięcia z listy API). */

const STORAGE_KEY = 'tajhmajster_recent_idjoins';
const MAX = 20;

export type RecentScanItem = {
  idJoin: number;
  idOrder?: number;
  symbol?: string;
  description?: string;
  quantityStamp?: number;
  quantity?: number;
};

function read(): RecentScanItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentScanItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && Number(x.idJoin) > 0);
  } catch {
    return [];
  }
}

function write(items: RecentScanItem[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX)));
}

/** Wstaw na początek (najnowszy = index 0). */
export function pushRecentScan(item: RecentScanItem) {
  const idJoin = Number(item.idJoin);
  if (!Number.isFinite(idJoin) || idJoin <= 0) return;
  const prev = read().filter((x) => x.idJoin !== idJoin);
  write([{ ...item, idJoin }, ...prev]);
}

export function readRecentScans(): RecentScanItem[] {
  return read();
}

/** Scal sesję + listę z API; sesja ma pierwszeństwo kolejności. Max `limit`. */
export function mergeRecentScans(
  apiItems: RecentScanItem[],
  limit = 7,
): RecentScanItem[] {
  const out: RecentScanItem[] = [];
  const seen = new Set<number>();
  for (const src of [...read(), ...apiItems]) {
    const id = Number(src.idJoin);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...src, idJoin: id });
    if (out.length >= limit) break;
  }
  return out;
}
