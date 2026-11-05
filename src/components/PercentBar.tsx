import { useEffect, useRef, useState } from 'react';
import {
  formatProductionPercentValue,
  parseProductionPercent,
  resolveFillColor,
} from '../lib/percent';

export function PercentBar({
  percent,
  integerOnly = false,
  suffix,
  /** Increment this to force grow animation (e.g. DEV play). */
  playToken = 0,
}: {
  percent: number | string | null | undefined;
  /** Show whole percent only, e.g. 10% instead of 10.00% */
  integerOnly?: boolean;
  /** Extra text in the bar, e.g. "2/20" */
  suffix?: string;
  playToken?: number;
}) {
  const parsed = parseProductionPercent(percent);
  const prevRef = useRef<number | null>(null);
  const [displayWidth, setDisplayWidth] = useState(parsed ?? 0);
  const [growing, setGrowing] = useState(false);

  useEffect(() => {
    if (parsed == null) {
      prevRef.current = null;
      return;
    }

    const prev = prevRef.current;
    const increased = prev != null && parsed > prev + 0.001;
    const forced = playToken > 0;

    if (forced || increased) {
      const from = forced ? 0 : (prev ?? 0);
      setGrowing(true);
      setDisplayWidth(from);
      const raf = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setDisplayWidth(parsed));
      });
      const t = window.setTimeout(() => setGrowing(false), 900);
      prevRef.current = parsed;
      return () => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(t);
      };
    }

    setDisplayWidth(parsed);
    prevRef.current = parsed;
  }, [parsed, playToken]);

  if (parsed == null) {
    return <span className="muted">—</span>;
  }

  const precise = formatProductionPercentValue(parsed);
  const pctText = integerOnly ? `${Math.round(parsed)}%` : `${precise}%`;
  const title = suffix ? `${pctText} · ${suffix}` : pctText;
  const label = suffix ? `${pctText}  ${suffix}` : pctText;
  const fill = resolveFillColor(parsed);

  return (
    <div className={`percent-bar${growing ? ' percent-bar--grow' : ''}`} title={title}>
      <div
        className="percent-bar__fill"
        style={{ width: `${displayWidth}%`, backgroundColor: fill }}
      />
      <span className="percent-bar__label">{label}</span>
    </div>
  );
}
