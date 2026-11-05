import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LoginGate } from './components/LoginGate';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { OrderDetail } from './components/OrderDetail';
import { OrderList } from './components/OrderList';
import { OrdersTableView } from './components/OrdersTableView';
import { OrdersToSyncModal } from './components/OrdersToSyncModal';
import { ProductionBoardView } from './components/ProductionBoardView';
import {
  ProductionTestView,
  type SyncResult,
} from './components/ProductionTestView';
import { useI18n } from './i18n/LanguageContext';
import {
  clearStoredToken,
  fetchOrders,
  fetchOrdersToSyncPrc,
  getStoredToken,
  syncGroupChildrenPrc,
  syncGroupChildrenPrcBatch,
  type OrdersToSyncGroup,
} from './lib/api';
import type { AppView, OrderRow } from './types';
import {
  ANIM_DEMO_ORDER_ID,
  APP_VERSION,
  AUTO_REFRESH_HOUR_FROM,
  AUTO_REFRESH_HOUR_TO,
  AUTO_REFRESH_MS,
  isAutoRefreshHours,
  isChildProductionsGroup,
  MIN_PRODUCTION_ORDER_ID,
  ORDERS_GROUP_LIMIT,
  ORDERS_LIST_LIMIT,
  PRODUCTION_TEST_GROUP_IDS,
  STORAGE_KEY_DEV_MODE,
  STORAGE_KEY_PROD_TEST,
  STORAGE_KEY_VIEW,
  SYNC_PRC_BATCH_SIZE,
  SYNC_PRODUCTIONS_FROM_DATE,
} from '../config/project';

export { MIN_PRODUCTION_ORDER_ID, PRODUCTION_TEST_GROUP_IDS };

function TopBar({
  title,
  nav,
  actions,
  logout,
  devMode,
  onToggleDev,
}: {
  title: string;
  nav?: ReactNode;
  actions?: ReactNode;
  logout?: ReactNode;
  devMode: boolean;
  onToggleDev: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="logo-badge" aria-label="LIGNUM LINK">
          <span className="logo-badge__mark">LL</span>
          Lignum Link
        </div>
        <div className="topbar__title">{title}</div>
        {actions ? <div className="topbar__actions">{actions}</div> : null}
      </div>
      {nav ? <div className="topbar__center">{nav}</div> : null}
      <div className="topbar__right">
        <LanguageSwitcher />
        {logout}
        <span className="app-version" title={APP_VERSION}>
          {APP_VERSION}
        </span>
        <button
          type="button"
          className={`dev-toggle dev-toggle--ghost${devMode ? ' dev-toggle--on' : ''}`}
          onClick={onToggleDev}
          aria-pressed={devMode}
          aria-label="DEV"
          title=""
        />
      </div>
    </header>
  );
}

function readView(): AppView {
  const raw = sessionStorage.getItem(STORAGE_KEY_VIEW);
  // Widok 2 (tabela OptiCut) ukryty w UI — logika zostaje; przywróć listę
  if (raw === '2') return 1;
  if (raw === '1' || raw === '3') return Number(raw) as AppView;
  return 1;
}

function ViewListIcon() {
  return (
    <svg className="view-switch__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
      />
    </svg>
  );
}

function ViewBoardIcon() {
  return (
    <svg className="view-switch__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 3h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3z"
      />
    </svg>
  );
}

export default function App() {
  const { t, locale } = useI18n();
  const needsGate = Boolean(import.meta.env.VITE_REQUIRE_LOGIN !== '0');
  const [unlocked, setUnlocked] = useState(() => {
    return Boolean(getStoredToken() || import.meta.env.VITE_MONITOR_TOKEN);
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [view, setView] = useState<AppView>(() => readView());
  const [devMode, setDevMode] = useState(
    () => sessionStorage.getItem(STORAGE_KEY_DEV_MODE) === '1',
  );
  const [prodTest, setProdTest] = useState(() => {
    if (sessionStorage.getItem(STORAGE_KEY_DEV_MODE) !== '1') return false;
    return sessionStorage.getItem(STORAGE_KEY_PROD_TEST) === '1';
  });
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
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewGroups, setSyncPreviewGroups] = useState<OrdersToSyncGroup[]>([]);
  const [focusOrderId, setFocusOrderId] = useState<number | null>(null);
  const [refreshInSec, setRefreshInSec] = useState(Math.ceil(AUTO_REFRESH_MS / 1000));
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const [animPlayToken, setAnimPlayToken] = useState(0);

  const viewRef = useRef(view);
  viewRef.current = view;
  const devModeRef = useRef(devMode);
  devModeRef.current = devMode;
  const prodTestRef = useRef(prodTest);
  prodTestRef.current = prodTest;

  useEffect(() => {
    const board = view === 3 && !prodTest;
    document.body.classList.toggle('view-board', board);
    return () => document.body.classList.remove('view-board');
  }, [view, prodTest]);

  const selectView = (next: AppView) => {
    setView(next);
    sessionStorage.setItem(STORAGE_KEY_VIEW, String(next));
    setSelectedId(null);
    setFocusOrderId(null);
  };

  const openOrderInView1 = (orderId: number) => {
    setSelectedId(null);
    setView(1);
    sessionStorage.setItem(STORAGE_KEY_VIEW, '1');
    setFocusOrderId(orderId);
  };

  const toggleDevMode = () => {
    setDevMode((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY_DEV_MODE, next ? '1' : '0');
      if (!next) {
        setCreateChildProductions(false);
        setSyncPreviewOpen(false);
        if (prodTestRef.current) {
          sessionStorage.setItem(STORAGE_KEY_PROD_TEST, '0');
          setProdTest(false);
          setSyncByGroup({});
        }
      }
      return next;
    });
  };

  const toggleProdTest = () => {
    setProdTest((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY_PROD_TEST, next ? '1' : '0');
      setSelectedId(null);
      setSyncByGroup({});
      setCreateChildProductions(false);
      setSyncPreviewOpen(false);
      return next;
    });
  };

  const load = useCallback(
    async (opts: { writePrc?: boolean } = {}) => {
      const writePrc = opts.writePrc === true;
      setLoading(true);
      setError('');
      try {
        if (prodTestRef.current) {
          const syncs = await Promise.all(
            PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
              syncGroupChildrenPrc(groupId, {
                dryRun: false,
                createChildProductions:
                  createChildProductionsRef.current &&
                  isChildProductionsGroup(groupId),
              }),
            ),
          );
          const nextSync: Record<number, SyncResult> = {};
          for (const s of syncs) nextSync[s.groupId] = s;
          setSyncByGroup(nextSync);

          const orderLists = await Promise.all(
            PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
              fetchOrders({ state: '', groupId, limit: ORDERS_GROUP_LIMIT }),
            ),
          );
          const byId = new Map<number, OrderRow>();
          for (const res of orderLists) {
            for (const o of res.orders || []) byId.set(o.Id, o);
          }
          setOrders([...byId.values()]);
        } else {
          if (
            writePrc &&
            devModeRef.current &&
            viewRef.current === 1
          ) {
            const preview = await fetchOrdersToSyncPrc({
              from: SYNC_PRODUCTIONS_FROM_DATE,
              minId: MIN_PRODUCTION_ORDER_ID,
            });
            const groupIds = (preview.groups || []).map((g) => g.groupId);
            if (groupIds.length > 0) {
              await syncGroupChildrenPrcBatch(groupIds, {
                dryRun: false,
                batchSize: SYNC_PRC_BATCH_SIZE,
              });
            }
          }

          const res = await fetchOrders({
            state: '',
            limit: ORDERS_LIST_LIMIT,
            minId: MIN_PRODUCTION_ORDER_ID,
          });
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
    },
    [t],
  );

  const openSyncPreview = useCallback(async () => {
    setSyncPreviewOpen(true);
    setSyncPreviewLoading(true);
    setError('');
    try {
      const preview = await fetchOrdersToSyncPrc({
        from: SYNC_PRODUCTIONS_FROM_DATE,
        minId: MIN_PRODUCTION_ORDER_ID,
      });
      setSyncPreviewGroups(preview.groups || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fetchError');
      setError(message);
      setSyncPreviewOpen(false);
    } finally {
      setSyncPreviewLoading(false);
    }
  }, [t]);

  const updateOneGroupPrc = useCallback(
    async (groupId: number) => {
      try {
        setError('');
        await syncGroupChildrenPrc(groupId, { dryRun: false });
        const preview = await fetchOrdersToSyncPrc({
          from: SYNC_PRODUCTIONS_FROM_DATE,
          minId: MIN_PRODUCTION_ORDER_ID,
        });
        setSyncPreviewGroups(preview.groups || []);
        const res = await fetchOrders({
          state: '',
          limit: ORDERS_LIST_LIMIT,
          minId: MIN_PRODUCTION_ORDER_ID,
        });
        setOrders(res.orders || []);
        setUpdatedAt(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : t('fetchError');
        setError(message);
        throw err;
      }
    },
    [t],
  );

  const updateChildrenPrc = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const syncs = await Promise.all(
        PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
          syncGroupChildrenPrc(groupId, {
            dryRun: false,
            createChildProductions:
              createChildProductionsRef.current &&
              isChildProductionsGroup(groupId),
          }),
        ),
      );
      const nextSync: Record<number, SyncResult> = {};
      for (const s of syncs) nextSync[s.groupId] = s;
      setSyncByGroup(nextSync);

      const orderLists = await Promise.all(
        PRODUCTION_TEST_GROUP_IDS.map((groupId) =>
          fetchOrders({ state: '', groupId, limit: ORDERS_GROUP_LIMIT }),
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
    // Initial / view change: no DB write of % (auto-refresh also read-only)
    void load({ writePrc: false });
    if (prodTest || autoRefreshStopped) {
      setRefreshInSec(0);
      return;
    }

    const totalSec = Math.ceil(AUTO_REFRESH_MS / 1000);
    setRefreshInSec(isAutoRefreshHours() ? totalSec : 0);
    let left = totalSec;

    const tick = window.setInterval(() => {
      if (!isAutoRefreshHours()) {
        left = totalSec;
        setRefreshInSec(0);
        return;
      }
      left -= 1;
      if (left <= 0) {
        left = totalSec;
        void load({ writePrc: false });
      }
      setRefreshInSec(left);
    }, 1000);

    return () => window.clearInterval(tick);
  }, [unlocked, selectedId, load, prodTest, view, autoRefreshStopped]);

  if (needsGate && !unlocked) {
    return <LoginGate onUnlock={() => setUnlocked(true)} />;
  }

  const showOrdersToSync = devMode && !prodTest && view === 1;

  const headerNav =
    selectedId == null && !prodTest ? (
      <div className="view-switch" role="group" aria-label={t('viewsLabel')}>
        <button
          type="button"
          className={view === 1 ? 'active' : ''}
          onClick={() => selectView(1)}
        >
          <ViewListIcon />
          {t('view1')}
        </button>
        {/* Stary widok 2 (OrdersTableView) ukryty — logika w App zostaje */}
        <button
          type="button"
          className={view === 3 ? 'active' : ''}
          onClick={() => selectView(3)}
        >
          <ViewBoardIcon />
          {t('view2')}
        </button>
      </div>
    ) : null;

  const headerActions =
    selectedId == null ? (
      <>
        {devMode ? (
          <button
            type="button"
            className={`btn ${prodTest ? '' : 'btn-ghost'} prod-test-btn`}
            onClick={toggleProdTest}
          >
            {prodTest ? t('prodTestOff') : t('prodTestOn')}
          </button>
        ) : null}
        <span className="refresh-with-countdown">
          <button
            className="btn"
            type="button"
            onClick={() =>
              void load({
                writePrc: Boolean(devMode && !prodTest && view === 1),
              })
            }
            disabled={loading}
          >
            {loading ? t('refreshing') : t('refresh')}
          </button>
          {devMode && !prodTest ? (
            <>
              <button
                type="button"
                className={`btn btn-ghost stop-refresh-btn${autoRefreshStopped ? ' stop-refresh-btn--stopped' : ''}`}
                onClick={() => setAutoRefreshStopped((v) => !v)}
                aria-pressed={autoRefreshStopped}
                title={
                  autoRefreshStopped ? t('startRefresh') : t('stopRefresh')
                }
              >
                {autoRefreshStopped ? t('startRefresh') : t('stopRefresh')}
              </button>
              <span
                className="refresh-countdown"
                aria-live="polite"
                title={`Auto-refresh ${AUTO_REFRESH_HOUR_FROM}:00–${AUTO_REFRESH_HOUR_TO}:00`}
              >
                {autoRefreshStopped || refreshInSec <= 0
                  ? '—'
                  : `${refreshInSec}s`}
              </span>
            </>
          ) : null}
        </span>
        {showOrdersToSync ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void openSyncPreview()}
            disabled={loading || syncPreviewLoading}
          >
            {t('ordersToSync')}
          </button>
        ) : null}
        {devMode && !prodTest && view === 1 ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setAnimPlayToken((n) => n + 1);
              setFocusOrderId(ANIM_DEMO_ORDER_ID);
            }}
            title={`#${ANIM_DEMO_ORDER_ID}`}
          >
            {t('playAnim')}
          </button>
        ) : null}
      </>
    ) : null;

  const headerLogout =
    selectedId == null ? (
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
    ) : null;

  return (
    <>
      <TopBar
        title={t('appSubtitle')}
        nav={headerNav}
        actions={headerActions}
        logout={headerLogout}
        devMode={devMode}
        onToggleDev={toggleDevMode}
      />
      <div
        className={`app-shell${view === 2 && !prodTest ? ' app-shell--wide' : ''}${view === 3 && !prodTest ? ' app-shell--board' : ''}`}
      >
        {selectedId != null ? (
          <OrderDetail
            orderId={selectedId}
            onBack={() => setSelectedId(null)}
            onSelectOrder={setSelectedId}
          />
        ) : (
          <>
            {devMode ? (
              <div className="toolbar toolbar--meta">
                <span className="meta">
                  {t('ordersCount', { n: orders.length })}
                  {updatedAt ? ` · ${updatedAt.toLocaleTimeString(locale)}` : ''}
                  {` · ${t('devModeOn')}`}
                </span>
              </div>
            ) : null}

            {prodTest ? <p className="lede">{t('ledeProdTest')}</p> : null}

            <div
              className={`panel panel--flush-top ${view === 3 && !prodTest ? 'panel--flat' : ''}`}
            >
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
                <OrderList
                  orders={orders}
                  onSelect={setSelectedId}
                  focusOrderId={focusOrderId}
                  onFocusHandled={() => setFocusOrderId(null)}
                  animOrderId={ANIM_DEMO_ORDER_ID}
                  animPlayToken={animPlayToken}
                />
              ) : null}
              {!error && !prodTest && view === 2 ? (
                <OrdersTableView orders={orders} onSelect={setSelectedId} />
              ) : null}
              {!error && !prodTest && view === 3 ? (
                <ProductionBoardView orders={orders} onSelect={openOrderInView1} />
              ) : null}
            </div>
          </>
        )}
      </div>

      <OrdersToSyncModal
        open={syncPreviewOpen}
        loading={syncPreviewLoading}
        groups={syncPreviewGroups}
        onClose={() => setSyncPreviewOpen(false)}
        onUpdateGroup={updateOneGroupPrc}
      />
    </>
  );
}
