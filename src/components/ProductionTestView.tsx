import { useI18n } from '../i18n/LanguageContext';
import { buildDisplayRows, orderIdLabel } from '../lib/orderDisplay';
import { parseProductionPercent } from '../lib/percent';
import type { OrderRow } from '../types';
import { GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

export type SyncChildUpdate = {
  childId: number;
  previousPrc: string | number | null;
  productionPrc: string;
  stamped: number;
  totalQty: number;
  pieceRows: number;
};

export type SyncResult = {
  success: boolean;
  groupId: number;
  motherProductionPrc?: string | number | null;
  motherStamped?: number;
  motherTotalQty?: number;
  children?: SyncChildUpdate[];
  checklist?: Array<Record<string, unknown>>;
  syncedAt?: string;
  error?: string;
};

function scanLabel(stamped: number, total: number): string | undefined {
  if (total <= 0) return undefined;
  return `${stamped}/${total}`;
}

function syncForRow(
  row: OrderRow,
  groupIds: number[],
  syncByGroup: Record<number, SyncResult>,
): SyncResult | null {
  if (groupIds.includes(row.Id) && syncByGroup[row.Id]) return syncByGroup[row.Id];
  const parent = Number(row.IdParent) || 0;
  if (parent && syncByGroup[parent]) return syncByGroup[parent];
  return null;
}

export function ProductionTestView({
  groupIds,
  orders,
  syncByGroup,
  syncing,
  devMode,
  createChildProductions,
  onCreateChildProductionsChange,
  onUpdateChildren,
  onSelect,
}: {
  groupIds: number[];
  orders: OrderRow[];
  syncByGroup: Record<number, SyncResult>;
  syncing: boolean;
  devMode: boolean;
  createChildProductions: boolean;
  onCreateChildProductionsChange: (next: boolean) => void;
  onUpdateChildren: () => void;
  onSelect: (id: number) => void;
}) {
  const { t } = useI18n();
  const rows = buildDisplayRows(orders);
  const idsLabel = groupIds.join(', ');
  const lastSyncedAt = groupIds
    .map((id) => syncByGroup[id]?.syncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const checklistTotal = groupIds.reduce(
    (sum, id) => sum + (syncByGroup[id]?.checklist?.length || 0),
    0,
  );

  return (
    <div className="pt-wrap">
      <div className="pt-banner">
        <div>
          <strong>{t('prodTestTitle')}</strong>
          <div className="pt-banner__sub">{t('prodTestHint', { id: idsLabel })}</div>
          {devMode ? (
            <label className="pt-dev-option">
              <input
                type="checkbox"
                checked={createChildProductions}
                disabled={syncing}
                onChange={(e) => onCreateChildProductionsChange(e.target.checked)}
              />
              <span>{t('devCreateChildProductions')}</span>
            </label>
          ) : null}
        </div>
        <button
          type="button"
          className="btn pt-update-btn"
          onClick={onUpdateChildren}
          disabled={syncing}
        >
          {syncing ? t('prodTestUpdating') : t('prodTestUpdate')}
        </button>
      </div>

      <div className="table-wrap pt-table-wrap">
        <table className="monitor pt-table">
          <thead>
            <tr>
              <th className="order-num-col">{t('colOrderNo')}</th>
              <th className="percent-cell">{t('colStatus')}</th>
              <th className="desc-col">{t('colDesc')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMother =
                groupIds.includes(row.Id) || Number(row.IsGroupOrder) === 1;
              const pct = parseProductionPercent(row.ProductionPrc) ?? 0;
              const sync = syncForRow(row, groupIds, syncByGroup);
              const syncChild = sync?.children?.find((c) => c.childId === row.Id);

              const motherTotal = Number(sync?.motherTotalQty) || 0;
              const motherStamped = Number(sync?.motherStamped) || 0;
              const motherScan = scanLabel(motherStamped, motherTotal);

              const suffix = isMother
                ? motherScan
                : syncChild
                  ? scanLabel(syncChild.stamped, syncChild.totalQty)
                  : undefined;

              const displayPct = isMother
                ? motherTotal > 0
                  ? (motherStamped / motherTotal) * 100
                  : row.ProductionPrc
                : syncChild && syncChild.totalQty > 0
                  ? (syncChild.stamped / syncChild.totalQty) * 100
                  : row.ProductionPrc;

              return (
                <tr
                  key={row.Id}
                  className={isMother ? 'pt-row-mother' : 'is-child'}
                  onClick={() => onSelect(row.Id)}
                >
                  <td className="order-num-cell">
                    <div className="order-num-fill" style={{ width: `${pct}%` }} aria-hidden />
                    <div className="order-num order-num--over-fill">
                      <span className="order-num__icon">
                        {isMother ? <GroupStar title={t('groupOrder')} /> : null}
                      </span>
                      <span className="order-num__value">{orderIdLabel(row)}</span>
                    </div>
                  </td>
                  <td className="percent-cell">
                    <PercentBar percent={displayPct} integerOnly suffix={suffix} />
                  </td>
                  <td className="desc-cell">
                    <div className="order-desc">
                      {isMother ? t('prodTestMother') : t('child')} ·{' '}
                      {row.Description || row.FormName || '—'}
                    </div>
                    {!isMother && !suffix ? (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {t('prodTestNoPieces')}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lastSyncedAt ? (
        <p className="pt-footer muted">
          {t('prodTestLastSync')}: {new Date(lastSyncedAt).toLocaleTimeString()}
          {checklistTotal > 0 ? ` · checklist: ${checklistTotal}` : ''}
        </p>
      ) : null}
    </div>
  );
}
