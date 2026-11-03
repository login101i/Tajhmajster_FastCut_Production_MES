import {
  formatProductionPercentValue,
  parseProductionPercent,
  resolveFillColor,
} from '../lib/percent';

export function PercentBar({
  percent,
}: {
  percent: number | string | null | undefined;
}) {
  const parsed = parseProductionPercent(percent);
  if (parsed == null) {
    return <span className="muted">—</span>;
  }

  const precise = formatProductionPercentValue(parsed);
  const label = `${precise}%`;
  const shortLabel = `${parsed >= 10 ? parsed.toFixed(0) : precise}%`;
  const fill = resolveFillColor(parsed);

  return (
    <div className="percent-bar" title={label}>
      <div className="percent-bar__fill" style={{ width: `${parsed}%`, backgroundColor: fill }} />
      <span className="percent-bar__label">{shortLabel}</span>
    </div>
  );
}
