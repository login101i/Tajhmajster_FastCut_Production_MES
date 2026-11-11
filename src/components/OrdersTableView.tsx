import {
  buildDisplayRows,
  formatDateTime,
  onlineStatusLabel,
  optimizeStatusLabel,
  orderIdLabel,
  stateStatusLabel,
  typeLetter,
} from '../lib/orderDisplay';
import { parseProductionPercent } from '../lib/percent';
import type { OrderRow } from '../types';
import { GroupStar } from './GroupStar';

function Led({ on, color }: { on: boolean; color: 'green' | 'yellow' | 'grey' }) {
  if (!on) return <span className="ot-led ot-led--off" />;
  return <span className={`ot-led ot-led--${color}`} />;
}

function StackCutIcon({ active }: { active: boolean }) {
  if (!active) return <span className="ot-muted">—</span>;
  return (
    <span className="ot-stack" title="Stan rozkroju">
      <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden>
        <rect x="1" y="1" width="18" height="3.2" rx="0.6" fill="#43a047" />
        <rect x="1" y="6.2" width="18" height="3.2" rx="0.6" fill="#66bb6a" />
        <rect x="1" y="11.4" width="18" height="3.2" rx="0.6" fill="#81c784" />
      </svg>
    </span>
  );
}

function GearIcon({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="ot-gear" title="CNC">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path
          fill="#111"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.6a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
        />
      </svg>
    </span>
  );
}

export function OrdersTableView({
  orders,
  onSelect,
}: {
  orders: OrderRow[];
  onSelect: (id: number) => void;
}) {
  const rows = buildDisplayRows(orders);

  if (rows.length === 0) {
    return <div className="empty">Brak zleceń</div>;
  }

  return (
    <div className="ot-wrap">
      <table className="ot-table">
        <thead>
          <tr>
            <th className="ot-col-pct">Postęp produkcji</th>
            <th className="ot-col-led">F</th>
            <th className="ot-col-led">I</th>
            <th className="ot-col-led">Z</th>
            <th className="ot-col-t">T</th>
            <th className="ot-col-id">Numer zlecenia</th>
            <th className="ot-col-type">Typ zlecenia</th>
            <th className="ot-col-date">Data wygenerowania</th>
            <th className="ot-col-cnc">CNC</th>
            <th className="ot-col-icon">Stan rozkroju</th>
            <th className="ot-col-num">Numer rozkroju</th>
            <th className="ot-col-icon">Stan grupy zasobu</th>
            <th className="ot-col-num">Numer grupy zasobu</th>
            <th className="ot-col-icon">Stan eksportu</th>
            <th className="ot-col-num">Numer eksportu</th>
            <th className="ot-col-status">Status</th>
            <th className="ot-col-opt">Status optymalizacji</th>
            <th className="ot-col-online">Status online</th>
            <th className="ot-col-num">Numer online</th>
            <th className="ot-col-own">Numer własny</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = parseProductionPercent(row.ProductionPrc) ?? 0;
            const inGroup =
              Number(row.IsGroupOrder) === 1 || (Number(row.IdParent) || 0) > 0;
            const t = typeLetter(row);
            const hasCnc =
              Number(row.CNCCnt) > 0 || Number(row['3DGenerateCNCFiles']) > 0;
            const flagOn = Number(row.FlagState) > 0;
            const cutOn = Number(row.JobCutFlag) > 0;
            const matOn = Number(row.MaterialsGroupFlag) > 0;
            const expOn = Number(row.ExportCutFlag) > 0;
            const rowTone =
              Number(row.State) === 4
                ? 'ot-tone-prod'
                : Number(row.State) < 0
                  ? 'ot-tone-edit'
                  : '';

            return (
              <tr
                key={row.Id}
                className={[row.depth > 0 ? 'ot-row-child' : '', rowTone]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(row.Id)}
              >
                <td className="ot-col-pct">
                  <div className="ot-pct">
                    <div className="ot-pct__fill" style={{ width: `${pct}%` }} />
                    <span>{Math.floor(pct + 1e-9)}%</span>
                  </div>
                </td>
                <td className="ot-col-led">
                  <Led on={flagOn} color={Number(row.FlagState) > 1 ? 'yellow' : 'green'} />
                </td>
                <td className="ot-col-led" />
                <td className="ot-col-led" />
                <td className={`ot-col-t ot-t--${t.tone}`}>{t.letter}</td>
                <td className="ot-col-id">
                  <div className="ot-id">
                    {Number(row.IsGroupOrder) === 1 || inGroup ? (
                      <GroupStar title="Zlecenie grupowe" />
                    ) : (
                      <span className="ot-id__spacer" />
                    )}
                    <span className="ot-id__num">{orderIdLabel(row)}</span>
                  </div>
                </td>
                <td className="ot-col-type">{row.TypeStr || row.FormName || ''}</td>
                <td className="ot-col-date">{formatDateTime(row.DateGeneration)}</td>
                <td className={`ot-col-cnc ${hasCnc ? 'ot-cnc-on' : ''}`}>
                  <GearIcon active={hasCnc} />
                </td>
                <td className="ot-col-icon">
                  <StackCutIcon active={cutOn} />
                </td>
                <td className="ot-col-num">
                  {row.JobCutNumber != null && Number(row.JobCutNumber) !== 0
                    ? `(${row.JobCutNumber})`
                    : ''}
                </td>
                <td className="ot-col-icon">
                  <Led on={matOn} color="grey" />
                </td>
                <td className="ot-col-num">
                  {row.MaterialsGroupNumber != null && Number(row.MaterialsGroupNumber) !== 0
                    ? String(row.MaterialsGroupNumber)
                    : ''}
                </td>
                <td className="ot-col-icon">
                  <Led on={expOn} color="grey" />
                </td>
                <td className="ot-col-num">
                  {row.ExportCutNumber != null && Number(row.ExportCutNumber) !== 0
                    ? String(row.ExportCutNumber)
                    : ''}
                </td>
                <td className="ot-col-status">{stateStatusLabel(row.State)}</td>
                <td className="ot-col-opt">{optimizeStatusLabel(row.OptimizeState)}</td>
                <td className="ot-col-online">{onlineStatusLabel(row.OnlineState)}</td>
                <td className="ot-col-num">
                  {row.OnlineOrderId ? String(row.OnlineOrderId) : ''}
                </td>
                <td className="ot-col-own">{row.OwnNumber || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
