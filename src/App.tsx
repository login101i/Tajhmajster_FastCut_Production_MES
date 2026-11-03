import { useCallback, useEffect, useState } from 'react';
import { LoginGate } from './components/LoginGate';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { OrderDetail } from './components/OrderDetail';
import { OrderList } from './components/OrderList';
import { useI18n } from './i18n/LanguageContext';
import {
  clearStoredToken,
  fetchOrders,
  getStoredToken,
} from './lib/api';
import type { OrderRow } from './types';

const REFRESH_MS = 30_000;

function TopBar() {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="logo-badge" aria-label="LIGNUM LINK">
        <span className="logo-badge__mark">LL</span>
        Lignum Link
      </div>
      <div className="topbar__right">
        <div className="topbar__title">{t('appSubtitle')}</div>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export default function App() {
  const { t, locale } = useI18n();
  const needsGate = Boolean(import.meta.env.VITE_REQUIRE_LOGIN !== '0');
  const [unlocked, setUnlocked] = useState(() => {
    return Boolean(getStoredToken() || import.meta.env.VITE_MONITOR_TOKEN);
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState('4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrders({ state: stateFilter, q: q.trim() || undefined });
      setOrders(res.orders || []);
      setUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fetchError');
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearStoredToken();
        setUnlocked(false);
      }
    } finally {
      setLoading(false);
    }
  }, [q, stateFilter, t]);

  useEffect(() => {
    if (!unlocked || selectedId != null) return;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [unlocked, selectedId, load]);

  if (needsGate && !unlocked) {
    return <LoginGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <>
      <TopBar />
      <div className="app-shell">
        <p className="lede">{t('lede')}</p>

        {selectedId != null ? (
          <OrderDetail
            orderId={selectedId}
            onBack={() => setSelectedId(null)}
            onSelectOrder={setSelectedId}
          />
        ) : (
          <>
            <div className="toolbar">
              <input
                className="field"
                placeholder={t('searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load();
                }}
              />
              <select
                className="field"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                aria-label={t('stateFilter')}
              >
                <option value="4">{t('stateRealization')}</option>
                <option value="4,5">{t('stateRealizationDone')}</option>
                <option value="5">{t('stateDone')}</option>
                <option value="">{t('stateAll')}</option>
              </select>
              <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
                {loading ? t('refreshing') : t('refresh')}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  clearStoredToken();
                  setUnlocked(false);
                }}
              >
                {t('logout')}
              </button>
              <span className="meta">
                {t('ordersCount', { n: orders.length })}
                {updatedAt ? ` · ${updatedAt.toLocaleTimeString(locale)}` : ''}
              </span>
            </div>

            <div className="panel">
              {error ? <div className="error">{error}</div> : null}
              {!error ? <OrderList orders={orders} onSelect={setSelectedId} /> : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
