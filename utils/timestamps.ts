export function hasTimestamp(value: string | Date | null | undefined): boolean {
  return value != null && value !== '' && String(value) !== 'null';
}

export function parseTimestamp(value: string | Date | null | undefined): number | null {
  if (!hasTimestamp(value)) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}
