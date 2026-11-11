/** Light blue progress — podzlecenia / niski %. */
export const FILL_LIGHT = '#bbdefb';
export const FILL_MID = '#90caf9';
export const FILL_HIGH = '#64b5f6';
/** 100% — ciemniejszy niebieski. */
export const FILL_DONE = '#1565c0';
/** Matka zlecenia grupowego — wyraźny niebieski (dzieci: jasny). */
export const FILL_GROUP = '#1976d2';
/** Przyrost % na podzleceniu (odcinek old→new, ~2 s). */
export const FILL_GAIN = '#0d47a1';

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
  /* Matka grupy — niebieski; podzlecenia / zwykłe — jasnoniebieska skala */
  if (opts?.isGroup) return FILL_GROUP;
  if (percent >= 90) return FILL_HIGH;
  if (percent >= 50) return FILL_MID;
  return FILL_LIGHT;
}
