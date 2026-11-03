/** Pink fill — legacy default; prefer `resolveProductionPercentFillColor`. */
export const PRODUCTION_PERCENT_FILL_COLOR = '#f9a8d4';

/** Tiered green fills for production % progress bars. */
export const PRODUCTION_PERCENT_FILL_LIGHT_GREEN = '#bbf7d0'; // faint green
export const PRODUCTION_PERCENT_FILL_GREEN = '#86efac';
export const PRODUCTION_PERCENT_FILL_DARK_GREEN = '#86efac';

export function resolveProductionPercentFillColor(percent: number): string {
  if (percent >= 90) return PRODUCTION_PERCENT_FILL_DARK_GREEN;
  if (percent >= 50) return PRODUCTION_PERCENT_FILL_GREEN;
  return PRODUCTION_PERCENT_FILL_LIGHT_GREEN;
}

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
