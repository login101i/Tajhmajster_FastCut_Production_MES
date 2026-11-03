import { useI18n } from '../i18n/LanguageContext';
import {
  formatProductionPercentValue,
  parseProductionPercent,
} from '../lib/percent';
import type { OrderRow } from '../types';
import { GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

/**
 * NR zamówienia = Id zlecenia.
 * Dziecko grupy: "108 / 110" (Id dziecka / Id matki).
 */
function orderIdLabel(row: OrderRow): string {
  const parent = Number(row.IdParent) || 0;
  const isGroupMother = Number(row.IsGroupOrder) === 1;
  if (!isGroupMother && parent > 0) {
    return `${row.Id} / ${parent}`;
  }
  return String(row.Id);
}

/** Mothers / standalone first; children nested under mother. */
export function buildDisplayRows(orders: OrderRow[]): Array<OrderRow & { depth: number }> {
  const byId = new Map(orders.map((o) => [o.Id, o]));
  const children = new Map<number, OrderRow[]>();
  const roots: OrderRow[] = [];
  const placedAsChild = new Set<number>();

  for (const o of orders) {
    const parent = Number(o.IdParent) || 0;
    const isMother = Number(o.IsGroupOrder) === 1;
    if (!isMother && parent && byId.has(parent)) {
      const list = children.get(parent) || [];
      list.push(o);
      children.set(parent, list);
      placedAsChild.add(o.Id);
    }
  }

  for (const o of orders) {
    if (!placedAsChild.has(o.Id)) {
      roots.push(o);
    }
  }

  // Keep newest mothers/standalone first; children ascending under mother
  roots.sort((a, b) => b.Id - a.Id);

  const out: Array<OrderRow & { depth: number }> = [];
  for (const root of roots) {
    out.push({ ...root, depth: 0 });
    const kids = (children.get(root.Id) || []).slice().sort((a, b) => a.Id - b.Id);
    for (const kid of kids) {
      out.push({ ...kid, depth: 1 });
    }
  }
  return out;
}

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
                    {isGroup ? <GroupStar title={t('groupOrder')} /> : null}
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
