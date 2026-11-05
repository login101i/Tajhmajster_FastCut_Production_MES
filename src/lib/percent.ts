/** Light green progress (matches order-number cell fill). */
export const FILL_LIGHT = '#c8e6c9';
export const FILL_MID = '#a5d6a7';
export const FILL_HIGH = '#81c784';
/** 100% — ciemniejsza zieleń. */
export const FILL_DONE = '#2e7d32';
/** Matka zlecenia grupowego — ciemniejsza zieleń (podzlecenia: zwykła skala). */
export const FILL_GROUP = '#388e3c';

export function parseProductionPercent(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(100, Math.max(0, num));
}

export function formatProductionPercentValue(value: number | string | null | undefined): string {
  const parsed = parseProductionPercent(value);
  if (parsed == null) return '0.00';
  return parsed.toFixed(2);
}

export function resolveFillColor(
  percent: number,
  opts?: { isGroup?: boolean },
): string {
  if (percent >= 100) return FILL_DONE;
  /* Tylko matka grupy — ciemna zieleń; dzieci jak normalne zlecenia */
  if (opts?.isGroup) return FILL_GROUP;
  if (percent >= 90) return FILL_HIGH;
  if (percent >= 50) return FILL_MID;
  return FILL_LIGHT;
}
