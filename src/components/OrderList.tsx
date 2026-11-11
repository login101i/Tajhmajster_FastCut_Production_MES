import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { buildDisplayGroups, isRejected, orderIdLabel } from '../lib/orderDisplay';
import {
  formatProductionPercentValue,
  parseProductionPercent,
  resolveFillColor,
} from '../lib/percent';
import {
  hasRecentProductionGain,
  trackProductionGains,
} from '../lib/recentGains';
import type { OrderRow } from '../types';
import { GroupChildLine, GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

/** Fokus z widoku 2: żółty puls 3 s, potem zanikanie 1 s. */
const FOCUS_PULSE_MS = 3000;
const FOCUS_FADE_MS = 1000;
const FOCUS_HIGHLIGHT_MS = FOCUS_PULSE_MS + FOCUS_FADE_MS;

export function OrderList({
  orders,
  focusOrderId = null,
  onFocusHandled,
  animOrderId = null,
  animPlayToken = 0,
}: {
  orders: OrderRow[];
  /** Scroll this order (or its group mother) to the top of the list. */
  focusOrderId?: number | null;
  onFocusHandled?: () => void;
  /** DEV: force grow animation on this order id */
  animOrderId?: number | null;
  animPlayToken?: number;
}) {
  const { t } = useI18n();
  const gainTimes = trackProductionGains(orders).gainTimes;
  const [focusFading, setFocusFading] = useState(false);
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const onFocusHandledRef = useRef(onFocusHandled);
  onFocusHandledRef.current = onFocusHandled;

  const groups = useMemo(
    () => buildDisplayGroups(orders, gainTimes),
    [orders, gainTimes],
  );

  useEffect(() => {
    if (focusOrderId == null) {
      setFocusFading(false);
      return;
    }
    setFocusFading(false);
    const raf = window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const fade = window.setTimeout(() => setFocusFading(true), FOCUS_PULSE_MS);
    const clear = window.setTimeout(() => {
      onFocusHandledRef.current?.();
    }, FOCUS_HIGHLIGHT_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(fade);
      window.clearTimeout(clear);
    };
  }, [focusOrderId]);

  /* Lewy przycisk myszy + przeciągnięcie = scroll pionowy (jak touch) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let dragging = false;
    let startY = 0;
    let startScroll = 0;

    const scrollRoot = () =>
      (document.scrollingElement as HTMLElement | null) ?? document.documentElement;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      startY = e.clientY;
      startScroll = scrollRoot().scrollTop;
      el.classList.add('is-drag-scrolling');
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();
      scrollRoot().scrollTop = startScroll - (e.clientY - startY);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-drag-scrolling');
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp);
      el.classList.remove('is-drag-scrolling');
    };
  }, [groups.length]);

  if (groups.length === 0) {
    return <div className="empty">{t('emptyOrders')}</div>;
  }

  return (
    <div className="table-wrap table-wrap--drag-scroll" ref={wrapRef}>
      <table className="monitor">
        <thead>
          <tr>
            <th className="order-num-col">{t('colOrderNo')}</th>
            <th className="desc-col">{t('colDesc')}</th>
            <th className="percent-cell">{t('colStatus')}</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const motherId = group[0]?.Id;

          const isMultiGroup =
            group.length > 1 || group.some((r) => Number(r.IsGroupOrder) === 1);

          return (
            <tbody
              key={motherId}
              className={`order-group${isMultiGroup ? ' order-group--multi' : ' order-group--simple'}`}
            >
              {group.map((row) => {
                const isGroup = Number(row.IsGroupOrder) === 1;
                const isGroupMother =
                  isGroup || (row.depth === 0 && group.length > 1);
                const pct = parseProductionPercent(row.ProductionPrc) ?? 0;
                const pctLabel = `${formatProductionPercentValue(pct)}%`;
                const isFocusRow = focusOrderId != null && row.Id === focusOrderId;
                const rejected = isRejected(row);
                const fillColor = resolveFillColor(pct, { isGroup: isGroupMother });
                const showShine =
                  !rejected &&
                  pct > 0 &&
                  hasRecentProductionGain(row.Id, gainTimes);
                const isChild = row.depth > 0;
                return (
                  <tr
                    key={row.Id}
                    ref={isFocusRow ? focusRef : undefined}
                    className={[
                      isChild ? 'is-child' : '',
                      isGroupMother ? 'is-group-mother' : '',
                      isGroupMother ? 'is-group-fill' : '',
                      isFocusRow
                        ? `is-focus-order${focusFading ? ' is-focus-order--fading' : ''}`
                        : '',
                      rejected ? 'is-rejected' : '',
                      pct >= 100 ? 'is-done' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    {!rejected && pct > 0 ? (
                      <span
                        className={`monitor-row__fill${showShine ? ' shine' : ''}`}
                        style={{ width: `${pct}%`, backgroundColor: fillColor }}
                        aria-hidden
                      />
                    ) : null}
                    <td className="order-num-cell">
                      <div
                        className={[
                          'order-num',
                          'order-num--over-fill',
                          isChild ? 'order-num--child' : '',
                          isGroup ? 'order-num--mother' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="order-num__icon">
                          {isGroup ? (
                            <GroupStar title={t('groupOrder')} />
                          ) : isChild ? (
                            <GroupChildLine title={t('child')} />
                          ) : null}
                        </span>
                        <span className="order-num__main">
                          <span className="order-num__value">{orderIdLabel(row)}</span>
                          {row.OwnNumber ? (
                            <span className="order-num__own" title={row.OwnNumber}>
                              {row.OwnNumber}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="desc-cell">
                      <div className="order-desc order-desc--own">
                        {row.OwnNumber || '—'}
                      </div>
                      <div className="order-desc order-desc--description">
                        {row.Description || row.FormName || '—'}
                      </div>
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
                        {[row.CompanyName, row.MaterialsSymbols].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="percent-cell">
                      <PercentBar
                        percent={row.ProductionPrc}
                        integerOnly
                        isGroup={isGroupMother}
                        playToken={
                          animOrderId != null && row.Id === animOrderId ? animPlayToken : 0
                        }
                      />
                      <span className="sr-only">{pctLabel}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
