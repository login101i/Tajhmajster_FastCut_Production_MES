import { useI18n } from '../i18n/LanguageContext';
import { buildDisplayRows, orderIdLabel } from '../lib/orderDisplay';
import {
  formatProductionPercentValue,
  parseProductionPercent,
} from '../lib/percent';
import type { OrderRow } from '../types';
import { GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

export function OrderList({
  orders,
  onSelect,
}: {
  orders: OrderRow[];
  onSelect: (id: number) => void;
}) {
  const { t } = useI18n();
  const rows = buildDisplayRows(orders);

  if (rows.length === 0) {
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
        <tbody>
          {rows.map((row) => {
            const isGroup = Number(row.IsGroupOrder) === 1;
            const pct = parseProductionPercent(row.ProductionPrc) ?? 0;
            const pctLabel = `${formatProductionPercentValue(pct)}%`;
            return (
              <tr
                key={row.Id}
                className={row.depth > 0 ? 'is-child' : undefined}
                onClick={() => onSelect(row.Id)}
              >
                <td className="order-num-cell">
                  <div className="order-num-fill" style={{ width: `${pct}%` }} aria-hidden />
                  <div className="order-num order-num--over-fill">
                    <span className="order-num__icon">
                      {isGroup ? <GroupStar title={t('groupOrder')} /> : null}
                    </span>
                    <span className="order-num__value">{orderIdLabel(row)}</span>
                  </div>
                </td>
                <td className="percent-cell">
                  <PercentBar percent={row.ProductionPrc} />
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
      </table>
    </div>
  );
}
