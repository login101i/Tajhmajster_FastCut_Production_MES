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

  const backBar = (
    <div className="detail-backbar">
      <button className="btn detail-back-btn" type="button" onClick={onBack}>
        {t('backList')}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="panel">
        {backBar}
        <div className="loading">{t('loadingOrder')}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="panel">
        {backBar}
        <div className="error">{error}</div>
      </div>
    );
  }
  if (!data?.order) {
    return (
      <div className="panel">
        {backBar}
        <div className="empty">{t('noData')}</div>
      </div>
    );
  }

  const order = data.order;
  const sockets = (data.sockets || []) as ProductionSocket[];
  const group = (data.group || []) as OrderRow[];
  const isGroup = Number(order.IsGroupOrder) === 1;
  const parent = Number(order.IdParent) || 0;
  const orderNo =
    !isGroup && parent > 0 ? `${order.Id} / ${parent}` : String(order.Id);

  return (
    <div className="panel">
      {backBar}
      <div className="detail-header">
        <div>
          <h2 className="detail-title">
            {isGroup ? <GroupStar title={t('groupOrder')} /> : null}
            {orderNo}
          </h2>
          <p className="detail-sub">
            {[order.Description, order.CompanyName, order.OwnNumber]
              .filter(Boolean)
              .join(' · ') || '—'}
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
                {Number(g.IsGroupOrder) === 1
                  ? g.Id
                  : `${g.Id} / ${Number(g.IdParent) || order.Id}`}{' '}
                · {g.ProductionPrc != null ? `${Math.floor(Number(g.ProductionPrc) + 1e-9)}%` : '—'}
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
