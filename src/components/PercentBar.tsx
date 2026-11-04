import {
  formatProductionPercentValue,
  parseProductionPercent,
  resolveFillColor,
} from '../lib/percent';

export function PercentBar({
  percent,
  integerOnly = false,
  suffix,
}: {
  percent: number | string | null | undefined;
  /** Show whole percent only, e.g. 10% instead of 10.00% */
  integerOnly?: boolean;
  /** Extra text in the bar, e.g. "2/20" */
  suffix?: string;
}) {
  const parsed = parseProductionPercent(percent);
  if (parsed == null) {
    return <span className="muted">—</span>;
  }

  const precise = formatProductionPercentValue(parsed);
  const pctText = integerOnly ? `${Math.round(parsed)}%` : `${precise}%`;
  const title = suffix ? `${pctText} · ${suffix}` : pctText;
  const label = suffix ? `${pctText}  ${suffix}` : pctText;
  const fill = resolveFillColor(parsed);

  return (
    <div className="percent-bar" title={title}>
      <div className="percent-bar__fill" style={{ width: `${parsed}%`, backgroundColor: fill }} />
      <span className="percent-bar__label">{label}</span>
    </div>
  );
}
