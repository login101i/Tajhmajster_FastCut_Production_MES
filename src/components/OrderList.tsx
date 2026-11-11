import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHILD_GAIN_SEGMENT_MS,
  SCAN_FOCUS_FADE_MS,
  SCAN_FOCUS_PULSE_MS,
} from '../../config/project';
import { useI18n } from '../i18n/LanguageContext';
import { buildDisplayGroups, isRejected, orderIdLabel } from '../lib/orderDisplay';
import {
  FILL_GAIN,
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

/** Fokus z widoku 2 (nav): żółty puls 3 s, potem zanikanie 1 s. */
const NAV_FOCUS_PULSE_MS = 3000;
const NAV_FOCUS_FADE_MS = 1000;

type GainSegment = { from: number; to: number };

export function OrderList({
  orders,
  focusOrderId = null,
  focusHighlightIds = [],
  focusVariant = 'nav',
  focusNonce = 0,
  onFocusHandled,
  animOrderId = null,
  animPlayToken = 0,
}: {
  orders: OrderRow[];
  /** Scroll target (primary order / suborder). */
  focusOrderId?: number | null;
  /** All rows to flash (e.g. mother + child after scan). */
  focusHighlightIds?: number[];
  focusVariant?: 'nav' | 'scan';
  /** Bumps to re-run scroll/flash when the same id gains again. */
  focusNonce?: number;
  onFocusHandled?: () => void;
  /** DEV: force grow animation on this order id */
  animOrderId?: number | null;
  animPlayToken?: number;
}) {
  const { t } = useI18n();
  const gainTimes = trackProductionGains(orders).gainTimes;
  const [focusFading, setFocusFading] = useState(false);
  /** Podzlecenia: odcinek przyrostu % (ciemniejszy) przez CHILD_GAIN_SEGMENT_MS. */
  const [gainSegments, setGainSegments] = useState<Map<number, GainSegment>>(
    () => new Map(),
  );
  const prevPctRef = useRef<Map<number, number>>(new Map());
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const onFocusHandledRef = useRef(onFocusHandled);
  onFocusHandledRef.current = onFocusHandled;

  const highlightSet = useMemo(
    () => new Set(focusHighlightIds),
    [focusHighlightIds],
  );

  const groups = useMemo(
    () => buildDisplayGroups(orders, gainTimes),
    [orders, gainTimes],
  );

  const gainTimersRef = useRef<number[]>([]);

  /* Tylko podzlecenia: zapamiętaj przyrost old→new i pokaż ciemniejszy tip 2 s */
  useEffect(() => {
    for (const o of orders) {
      const isChild =
        (Number(o.IdParent) || 0) > 0 && Number(o.IsGroupOrder) !== 1;
      const pct = parseProductionPercent(o.ProductionPrc) ?? 0;
      const prev = prevPctRef.current.get(o.Id);

      if (isChild && prev != null && pct > prev + 0.001) {
        const id = o.Id;
        const from = prev;
        const to = pct;
        setGainSegments((m) => {
          const n = new Map(m);
          n.set(id, { from, to });
          return n;
        });
        const timer = window.setTimeout(() => {
          setGainSegments((m) => {
            const n = new Map(m);
            n.delete(id);
            return n;
          });
        }, CHILD_GAIN_SEGMENT_MS);
        gainTimersRef.current.push(timer);
      }
      prevPctRef.current.set(o.Id, pct);
    }
  }, [orders]);

  useEffect(
    () => () => {
      for (const t of gainTimersRef.current) window.clearTimeout(t);
      gainTimersRef.current = [];
    },
    [],
  );

  useEffect(() => {
    if (focusOrderId == null) {
      setFocusFading(false);
      return;
    }
    setFocusFading(false);
    const pulseMs =
      focusVariant === 'scan' ? SCAN_FOCUS_PULSE_MS : NAV_FOCUS_PULSE_MS;
    const fadeMs =
      focusVariant === 'scan' ? SCAN_FOCUS_FADE_MS : NAV_FOCUS_FADE_MS;
    const raf = window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const fade = window.setTimeout(() => setFocusFading(true), pulseMs);
    const clear = window.setTimeout(() => {
      onFocusHandledRef.current?.();
    }, pulseMs + fadeMs);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(fade);
      window.clearTimeout(clear);
    };
  }, [focusOrderId, focusNonce, focusVariant]);

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
                const isScrollTarget =
                  focusOrderId != null && row.Id === focusOrderId;
                const isFocusRow =
                  isScrollTarget || highlightSet.has(row.Id);
                const rejected = isRejected(row);
                const fillColor = resolveFillColor(pct, { isGroup: isGroupMother });
                const showShine =
                  !rejected &&
                  pct > 0 &&
                  hasRecentProductionGain(row.Id, gainTimes);
                const isChild = row.depth > 0;
                const focusClass =
                  isFocusRow && focusOrderId != null
                    ? [
                        focusVariant === 'scan'
                          ? 'is-focus-order is-focus-order--scan'
                          : 'is-focus-order',
                        focusFading ? 'is-focus-order--fading' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : '';
                const pctPlay =
                  (focusVariant === 'scan' && highlightSet.has(row.Id)) ||
                  (animOrderId != null && row.Id === animOrderId)
                    ? animPlayToken
                    : 0;
                const gainSeg = isChild ? gainSegments.get(row.Id) : undefined;
                return (
                  <tr
                    key={row.Id}
                    ref={isScrollTarget ? focusRef : undefined}
                    className={[
                      isChild ? 'is-child' : '',
                      isGroupMother ? 'is-group-mother' : '',
                      isGroupMother ? 'is-group-fill' : '',
                      focusClass,
                      rejected ? 'is-rejected' : '',
                      pct >= 100 ? 'is-done' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    {!rejected && pct > 0 ? (
                      <>
                        <span
                          className={[
                            'monitor-row__fill',
                            showShine ? 'shine' : '',
                            pct >= 100 ? 'monitor-row__fill--done' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            width: pct >= 100 ? '100%' : `${pct}%`,
                            backgroundColor: fillColor,
                          }}
                          aria-hidden
                        />
                        {gainSeg && pct < 100 ? (
                          <span
                            className="monitor-row__fill monitor-row__fill--gain"
                            style={{
                              left: `${gainSeg.from}%`,
                              width: `${Math.max(0, gainSeg.to - gainSeg.from)}%`,
                              backgroundColor: FILL_GAIN,
                            }}
                            aria-hidden
                          />
                        ) : null}
                      </>
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
                        playToken={pctPlay}
                        emphasize={
                          focusVariant === 'scan' &&
                          highlightSet.has(row.Id) &&
                          !focusFading
                        }
                        gainFrom={gainSeg?.from}
                        gainTo={gainSeg?.to}
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
