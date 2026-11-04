import { useI18n } from '../i18n/LanguageContext';
import { pctOf, pickBoardOrders } from '../lib/orderDisplay';
import type { OrderRow } from '../types';

function OrderCard({
  order,
  onSelect,
}: {
  order: OrderRow;
  onSelect: (id: number) => void;
}) {
  const pct = pctOf(order);
  return (
    <button
      type="button"
      className="pb-card"
      onClick={() => onSelect(order.Id)}
      title={`#${order.Id} · ${pct.toFixed(0)}%`}
    >
      <span className="pb-card__fill" style={{ width: `${pct}%` }} aria-hidden />
      <span className="pb-card__body">
        <span className="pb-card__id">#{order.Id}</span>
        <span className="pb-card__pct">{pct.toFixed(0)}%</span>
      </span>
    </button>
  );
}

export function ProductionBoardView({
  orders,
  onSelect,
}: {
  orders: OrderRow[];
  onSelect: (id: number) => void;
}) {
  const { t } = useI18n();
  const board = pickBoardOrders(orders, 10);
  const packing = board.filter((o) => {
    const p = pctOf(o);
    return p >= 80 && p < 100;
  });
  const pickup = board.filter((o) => pctOf(o) >= 100);
  const active = board.filter((o) => pctOf(o) < 80);

  return (
    <div className="pb">
      <div className="pb-section">
        <div className="pb-grid">
          {active.map((o) => (
            <OrderCard key={o.Id} order={o} onSelect={onSelect} />
          ))}
          {active.length === 0 ? (
            <p className="pb-empty">{t('boardEmpty')}</p>
          ) : null}
        </div>
      </div>

      <div className="pb-split">
        <div className="pb-lane">
          <div className="pb-lane__head">
            <span className="pb-lane__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="none"
                  stroke="#43a047"
                  strokeWidth="1.8"
                  d="M4 8h16v11H4zM8 8V6h8v2M4 12h16"
                />
              </svg>
            </span>
            <span className="pb-lane__title">{t('packing')}</span>
          </div>
          <div className="pb-grid pb-grid--lane">
            {packing.map((o) => (
              <OrderCard key={o.Id} order={o} onSelect={onSelect} />
            ))}
            {packing.length === 0 ? (
              <p className="pb-empty">{t('packingEmpty')}</p>
            ) : null}
          </div>
        </div>

        <div className="pb-lane">
          <div className="pb-lane__head">
            <span className="pb-lane__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="none"
                  stroke="#43a047"
                  strokeWidth="1.8"
                  d="M3 15h11v4H3zM14 16h4l3 3v0H14zM6 19a1.5 1.5 0 1 0 0.01 0M17 19a1.5 1.5 0 1 0 0.01 0M3 15l2-6h8l1 6"
                />
              </svg>
            </span>
            <span className="pb-lane__title">{t('pickup')}</span>
          </div>
          {pickup.length === 0 ? (
            <p className="pb-empty">{t('pickupEmpty')}</p>
          ) : (
            <div className="pb-grid pb-grid--lane">
              {pickup.map((o) => (
                <OrderCard key={o.Id} order={o} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
