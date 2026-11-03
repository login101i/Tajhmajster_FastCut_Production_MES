import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { fetchOrderDetail } from '../lib/api';
import type { OrderDetailResponse, OrderRow, ProductionSocket } from '../types';
import { GroupStar } from './GroupStar';
import { PercentBar } from './PercentBar';

export function OrderDetail({
  orderId,
  onBack,
  onSelectOrder,
}: {
  orderId: number;
  onBack: () => void;
  onSelectOrder: (id: number) => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchOrderDetail(orderId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) return <div className="panel loading">{t('loadingOrder')}</div>;
  if (error) return <div className="panel error">{error}</div>;
  if (!data?.order) return <div className="panel empty">{t('noData')}</div>;

  const order = data.order;
  const sockets = (data.sockets || []) as ProductionSocket[];
  const group = (data.group || []) as OrderRow[];
  const isGroup = Number(order.IsGroupOrder) === 1;
  const orderNo = (order.OwnNumber || '').trim() || String(order.Id);

  return (
    <div className="panel">
      <div className="detail-header">
        <div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onBack}
            style={{ marginBottom: '0.75rem' }}
          >
            {t('backList')}
          </button>
          <h2 className="detail-title">
            {isGroup ? <GroupStar title={t('groupOrder')} /> : null}
            {orderNo}
          </h2>
          <p className="detail-sub">
            ID {order.Id}
            {[order.Description, order.CompanyName].filter(Boolean).length
              ? ` · ${[order.Description, order.CompanyName].filter(Boolean).join(' · ')}`
              : ''}
          </p>
        </div>
        <div style={{ minWidth: '12rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            {t('productionStatus')}
          </div>
          <PercentBar percent={order.ProductionPrc} />
        </div>
      </div>

      {group.length > 1 ? (
        <div className="group-chip">
          {group.map((g) => (
            <button
              key={g.Id}
              type="button"
              className={g.Id === order.Id ? 'active' : ''}
              onClick={() => onSelectOrder(g.Id)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                {Number(g.IsGroupOrder) === 1 ? <GroupStar title={t('groupOrder')} /> : null}
                {Number(g.IsGroupOrder) === 1 ? t('mother') : t('child')}{' '}
                {(g.OwnNumber || '').trim() || `#${g.Id}`} ·{' '}
                {g.ProductionPrc != null ? `${Number(g.ProductionPrc).toFixed(0)}%` : '—'}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="steps">
        <div
          style={{
            padding: '0.85rem 1.25rem 0.25rem',
            color: 'var(--ll-muted)',
            fontSize: '0.72rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {t('productionSteps')}
        </div>
        {sockets.length === 0 ? (
          <div className="empty">{t('noSteps')}</div>
        ) : (
          sockets.map((s) => (
            <div className="step-row" key={s.Id}>
              <span className="muted">#{s.OrderIndex}</span>
              <div>
                <strong style={{ color: 'var(--ll-navy)' }}>{s.Symbol || '—'}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {s.Description || ''}
                  {Number(s.IncludePercentSummary) !== 1 ? t('outsideAvg') : ''}
                </div>
              </div>
              <PercentBar percent={s.ProductionPercent} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
