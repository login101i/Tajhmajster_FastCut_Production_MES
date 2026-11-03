/** Light green progress (matches order-number cell fill). */
export const FILL_LIGHT = '#c8e6c9';
export const FILL_MID = '#a5d6a7';
export const FILL_HIGH = '#81c784';

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

export function resolveFillColor(percent: number): string {
  if (percent >= 90) return FILL_HIGH;
  if (percent >= 50) return FILL_MID;
  return FILL_LIGHT;
}
