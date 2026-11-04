import { useCallback, useEffect, useRef, useState } from 'react';
import { LoginGate } from './components/LoginGate';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { OrderDetail } from './components/OrderDetail';
import { OrderList } from './components/OrderList';
import { OrdersTableView } from './components/OrdersTableView';
import { ProductionBoardView } from './components/ProductionBoardView';
import {
  ProductionTestView,
  type SyncResult,
} from './components/ProductionTestView';
import { useI18n } from './i18n/LanguageContext';
import {
  clearStoredToken,
  fetchOrders,
  getStoredToken,
  syncGroupChildrenPrc,
} from './lib/api';
import type { AppView, OrderRow } from './types';

const REFRESH_MS = 30_000;
const VIEW_KEY = 'tajhmajster_view';
const TEST_MODE_KEY = 'tajhmajster_prod_test';
const DEV_MODE_KEY = 'tajhmajster_dev_mode';
/** Production test group orders */
export const PRODUCTION_TEST_GROUP_IDS = [9121, 9124] as const;

function TopBar({
  devMode,
  onToggleDev,
}: {
  devMode: boolean;
  onToggleDev: () => void;
}) {
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
        <button
          type="button"
          className={`dev-toggle ${devMode ? 'dev-toggle--on' : ''}`}
          onClick={onToggleDev}
          aria-pressed={devMode}
          title={t('devModeTitle')}
        >
          DEV
        </button>
      </div>
    </header>
  );
}

function readView(): AppView {
  const raw = sessionStorage.getItem(VIEW_KEY);
  if (raw === '1' || raw === '2' || raw === '3') return Number(raw) as AppView;
  return 1;
}

export default function App() {
  const { t, locale } = useI18n();
  const needsGate = Boolean(import.meta.env.VITE_REQUIRE_LOGIN !== '0');
  const [unlocked, setUnlocked] = useState(() => {
    return Boolean(getStoredToken() || import.meta.env.VITE_MONITOR_TOKEN);
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [view, setView] = useState<AppView>(() => readView());
  const [prodTest, setProdTest] = useState(
    () => sessionStorage.getItem(TEST_MODE_KEY) === '1',
  );
  const [devMode, setDevMode] = useState(
    () => sessionStorage.getItem(DEV_MODE_KEY) === '1',
  );
  /** DEV-only: upsert child Productions for group 9124 (off by default). */
  const [createChildProductions, setCreateChildProductions] = useState(false);
  const createChildProductionsRef = useRef(createChildProductions);
  createChildProductionsRef.current = createChildProductions;
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [syncByGroup, setSyncByGroup] = useState<Record<number, SyncResult>>({});

  const selectView = (next: AppView) => {
    setView(next);
    sessionStorage.setItem(VIEW_KEY, String(next));
    setSelectedId(null);
  };

  const toggleDevMode = () => {
    setDevMode((prev) => {
      const next = !prev;
      sessionStorage.setItem(DEV_MODE_KEY, next ? '1' : '0');
      if (!next) setCreateChildProductions(false);
      return next;
    });
  };

  const toggleProdTest = () => {
    setProdTest((prev) => {
      const next = !prev;
      sessionStorage.setItem(TEST_MODE_KEY, next ? '1' : '0');
      setSelectedId(null);
      setSyncByGroup({});
      setCreateChildProductions(false);
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (prodTest) {
        // Refresh writes child Orders.ProductionPrc from checklist (mothers unchanged)
        const syncs = await Promise.all(
          PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
            syncGroupChildrenPrc(groupId, {
              dryRun: false,
              createChildProductions:
                createChildProductionsRef.current && groupId === 9124,
            }),
          ),
        );
        const nextSync: Record<number, SyncResult> = {};
        for (const s of syncs) nextSync[s.groupId] = s;
        setSyncByGroup(nextSync);

        const orderLists = await Promise.all(
          PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
            fetchOrders({ state: '', groupId, limit: 50 }),
          ),
        );
        const byId = new Map<number, OrderRow>();
        for (const res of orderLists) {
          for (const o of res.orders || []) byId.set(o.Id, o);
        }
        setOrders([...byId.values()]);
      } else {
        const res = await fetchOrders({ state: '', limit: 300 });
        setOrders(res.orders || []);
        setSyncByGroup({});
      }
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
  }, [t, prodTest]);

  const updateChildrenPrc = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const syncs = await Promise.all(
        PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
          syncGroupChildrenPrc(groupId, {
            dryRun: false,
            createChildProductions:
              createChildProductionsRef.current && groupId === 9124,
          }),
        ),
      );
      const nextSync: Record<number, SyncResult> = {};
      for (const s of syncs) nextSync[s.groupId] = s;
      setSyncByGroup(nextSync);

      const orderLists = await Promise.all(
        PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
          fetchOrders({ state: '', groupId, limit: 50 }),
        ),
      );
      const byId = new Map<number, OrderRow>();
      for (const res of orderLists) {
        for (const o of res.orders || []) byId.set(o.Id, o);
      }
      setOrders([...byId.values()]);
      setUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fetchError');
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [t]);

  useEffect(() => {
    if (!unlocked || selectedId != null) return;
    void load();
    // Auto-refresh only outside production test (30s later for test mode)
    if (prodTest) return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [unlocked, selectedId, load, prodTest]);

  if (needsGate && !unlocked) {
    return <LoginGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <>
      <TopBar devMode={devMode} onToggleDev={toggleDevMode} />
      <div className={`app-shell ${view === 2 && !prodTest ? 'app-shell--wide' : ''}`}>
        {selectedId != null ? (
          <OrderDetail
            orderId={selectedId}
            onBack={() => setSelectedId(null)}
            onSelectOrder={setSelectedId}
          />
        ) : (
          <>
            <div className="toolbar">
              {!prodTest ? (
                <div className="view-switch" role="group" aria-label={t('viewsLabel')}>
                  <button
                    type="button"
                    className={view === 1 ? 'active' : ''}
                    onClick={() => selectView(1)}
                  >
                    {t('view1')}
                  </button>
                  <button
                    type="button"
                    className={view === 2 ? 'active' : ''}
                    onClick={() => selectView(2)}
                  >
                    {t('view2')}
                  </button>
                  <button
                    type="button"
                    className={view === 3 ? 'active' : ''}
                    onClick={() => selectView(3)}
                  >
                    {t('view3')}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className={`btn ${prodTest ? '' : 'btn-ghost'} prod-test-btn`}
                onClick={toggleProdTest}
              >
                {prodTest ? t('prodTestOff') : t('prodTestOn')}
              </button>
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
                {devMode ? ` · ${t('devModeOn')}` : ''}
              </span>
            </div>

            <p className="lede">
              {prodTest
                ? t('ledeProdTest')
                : view === 1
                  ? t('ledeView1')
                  : view === 2
                    ? t('ledeView2')
                    : t('ledeView3')}
            </p>

            <div className={`panel ${view === 3 && !prodTest ? 'panel--flat' : ''}`}>
              {error ? <div className="error">{error}</div> : null}
              {!error && prodTest ? (
                <ProductionTestView
                  groupIds={[...PRODUCTION_TEST_GROUP_IDS]}
                  orders={orders}
                  syncByGroup={syncByGroup}
                  syncing={syncing}
                  devMode={devMode}
                  createChildProductions={createChildProductions}
                  onCreateChildProductionsChange={setCreateChildProductions}
                  onUpdateChildren={() => void updateChildrenPrc()}
                  onSelect={setSelectedId}
                />
              ) : null}
              {!error && !prodTest && view === 1 ? (
                <OrderList orders={orders} onSelect={setSelectedId} />
              ) : null}
              {!error && !prodTest && view === 2 ? (
                <OrdersTableView orders={orders} onSelect={setSelectedId} />
              ) : null}
              {!error && !prodTest && view === 3 ? (
                <ProductionBoardView orders={orders} onSelect={setSelectedId} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
