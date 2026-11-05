import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { buildDisplayGroups, isRejected, orderIdLabel } from '../lib/orderDisplay';
import {
  formatProductionPercentValue,
  parseProductionPercent,
  resolveFillColor,
} from '../lib/percent';
import { trackProductionGains } from '../lib/recentGains';
import type { OrderRow } from '../types';
import { GroupChildLine, GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

export function OrderList({
  orders,
  onSelect,
  focusOrderId = null,
  onFocusHandled,
  animOrderId = null,
  animPlayToken = 0,
}: {
  orders: OrderRow[];
  onSelect: (id: number) => void;
  /** Scroll this order (or its group mother) to the top of the list. */
  focusOrderId?: number | null;
  onFocusHandled?: () => void;
  /** DEV: force grow animation on this order id */
  animOrderId?: number | null;
  animPlayToken?: number;
}) {
  const { t } = useI18n();
  const groups = buildDisplayGroups(orders, trackProductionGains(orders));
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const onFocusHandledRef = useRef(onFocusHandled);
  onFocusHandledRef.current = onFocusHandled;

  useEffect(() => {
    if (focusOrderId == null) return;
    const id = window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onFocusHandledRef.current?.();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusOrderId]);

  if (groups.length === 0) {
    return <div className="empty">{t('emptyOrders')}</div>;
  }

  return (
    <div className="table-wrap">
      <table className="monitor">
        <thead>
          <tr>
            <th className="order-num-col">{t('colOrderNo')}</th>
            <th className="percent-cell">{t('colStatus')}</th>
            <th className="desc-col">{t('colDesc')}</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const motherId = group[0]?.Id;
          const focusInGroup =
            focusOrderId != null &&
            group.some(
              (r) =>
                r.Id === focusOrderId ||
                Number(r.IdParent) === focusOrderId ||
                (Number(r.IsGroupOrder) === 1 && r.Id === focusOrderId),
            );
          // Prefer focusing the mother row of the group containing focusOrderId
          const focusRowId = focusInGroup
            ? group.find((r) => r.Id === focusOrderId)?.Id ??
              group.find((r) => Number(r.IdParent) === focusOrderId)?.Id ??
              motherId
            : null;
          // If focus is a child, still scroll mother (group start) to top
          const scrollTargetId =
            focusOrderId != null && focusInGroup
              ? motherId
              : null;

          return (
            <tbody key={motherId} className="order-group">
              {group.map((row) => {
                const isGroup = Number(row.IsGroupOrder) === 1;
                const isGroupMother =
                  isGroup || (row.depth === 0 && group.length > 1);
                const pct = parseProductionPercent(row.ProductionPrc) ?? 0;
                const pctLabel = `${formatProductionPercentValue(pct)}%`;
                const isScrollTarget = scrollTargetId != null && row.Id === scrollTargetId;
                const rejected = isRejected(row);
                /* Ciemna zieleń tylko matka grupy; podzlecenia = zwykła skala */
                const fillColor = resolveFillColor(pct, { isGroup: isGroupMother });
                return (
                  <tr
                    key={row.Id}
                    ref={isScrollTarget ? focusRef : undefined}
                    className={[
                      row.depth > 0 ? 'is-child' : '',
                      isGroupMother ? 'is-group-mother' : '',
                      isGroupMother ? 'is-group-fill' : '',
                      focusRowId === row.Id || isScrollTarget ? 'is-focus-order' : '',
                      rejected ? 'is-rejected' : '',
                      pct >= 100 ? 'is-done' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}
                    onClick={() => onSelect(row.Id)}
                  >
                    <td className="row-progress" aria-hidden>
                      <span
                        className="row-progress__fill"
                        style={{ width: `${pct}%`, backgroundColor: fillColor }}
                      />
                    </td>
                    <td className="order-num-cell">
                      <div
                        className={[
                          'order-num',
                          'order-num--over-fill',
                          row.depth > 0 ? 'order-num--child' : '',
                          isGroup ? 'order-num--mother' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="order-num__icon">
                          {isGroup ? (
                            <GroupStar title={t('groupOrder')} />
                          ) : row.depth > 0 ? (
                            <GroupChildLine title={t('child')} />
                          ) : null}
                        </span>
                        <span className="order-num__value">{orderIdLabel(row)}</span>
                      </div>
                    </td>
                    <td className="percent-cell">
                      <PercentBar
                        percent={row.ProductionPrc}
                        isGroup={isGroupMother}
                        playToken={
                          animOrderId != null && row.Id === animOrderId ? animPlayToken : 0
                        }
                      />
                      <span className="sr-only">{pctLabel}</span>
                    </td>
                    <td className="desc-cell">
                      <div className="order-desc">{row.Description || row.FormName || '—'}</div>
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
                        {[row.CompanyName, row.MaterialsSymbols].filter(Boolean).join(' · ')}
                      </div>
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
