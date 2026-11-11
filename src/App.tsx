import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FilterState4Modal } from './components/FilterState4Modal';
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
  HEADER_HIDE_MS_PHONE,
  HEADER_HIDE_MS_WIDE,
  HEADER_PHONE_MAX_PX,
  isAutoRefreshHours,
  isChildProductionsGroup,
  MIN_PRODUCTION_ORDER_ID,
  ORDERS_GROUP_LIMIT,
  ORDERS_LIST_LIMIT,
  PRODUCTION_TEST_GROUP_IDS,
  resolveAutoRefreshMs,
  STORAGE_KEY_DEV_MODE,
  STORAGE_KEY_FILTER_STATE4_ACK,
  STORAGE_KEY_PROD_TEST,
  STORAGE_KEY_VIEW,
  SYNC_PRC_BATCH_SIZE,
  SYNC_PRODUCTIONS_FROM_DATE,
} from '../config/project';
import {
  getLastProductionGainAt,
  trackProductionGains,
} from './lib/recentGains';

export { MIN_PRODUCTION_ORDER_ID, PRODUCTION_TEST_GROUP_IDS };

function TopBar({
  nav,
  actions,
  logout,
  devMode,
  onToggleDev,
  hidden,
}: {
  nav?: ReactNode;
  actions?: ReactNode;
  logout?: ReactNode;
  devMode: boolean;
  onToggleDev: () => void;
  hidden?: boolean;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (hidden) setMenuOpen(false);
  }, [hidden]);

  return (
    <div className={`topbar-wrap${hidden ? ' topbar-wrap--hidden' : ''}`}>
      <header className={`topbar${hidden ? ' topbar--hidden' : ''}`}>
        <div className="topbar__phone">
          <button
            type="button"
            className="topbar__burger"
            aria-label={t('menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          {nav ? <div className="topbar__phone-nav">{nav}</div> : null}
          <div className="logo-badge logo-badge--compact" aria-label="LIGNUM LINK">
            <span className="logo-badge__mark">LL</span>
          </div>
        </div>

        <div className="topbar__desktop">
          <div className="topbar__left">
            <div className="logo-badge" aria-label="LIGNUM LINK">
              <span className="logo-badge__mark">LL</span>
              Lignum Link
            </div>
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
        </div>

        {menuOpen ? (
          <div className="topbar__drawer" role="dialog" aria-label={t('menu')}>
            {actions ? <div className="topbar__drawer-actions">{actions}</div> : null}
            <div className="topbar__drawer-foot">
              <LanguageSwitcher />
              {logout}
              <span className="app-version" title={APP_VERSION}>
                {APP_VERSION}
              </span>
            </div>
          </div>
        ) : null}
      </header>
    </div>
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
  const [filterState4Acked, setFilterState4Acked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY_FILTER_STATE4_ACK) === '1',
  );
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [syncByGroup, setSyncByGroup] = useState<Record<number, SyncResult>>({});
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewGroups, setSyncPreviewGroups] = useState<OrdersToSyncGroup[]>([]);
  const [focusOrderId, setFocusOrderId] = useState<number | null>(null);
  const [refreshInSec, setRefreshInSec] = useState(() =>
    Math.ceil(resolveAutoRefreshMs(getLastProductionGainAt()) / 1000),
  );
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const lastGainAtRef = useRef<number | null>(getLastProductionGainAt());
  const [animPlayToken, setAnimPlayToken] = useState(0);
  const [headerHidden, setHeaderHidden] = useState(false);
  /** Widok 2 → 1 (żółty fokus): header zostaje widoczny, bez chowania/pokazywania */
  const focusNavLockRef = useRef(false);

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

  // Header: chowa się po bezruchu. Scroll w dół NIE pokazuje; scroll w górę / mysz — tak.
  useEffect(() => {
    let timer: number | undefined;
    let lastScrollY = window.scrollY;

    const hideDelay = () =>
      window.matchMedia(`(max-width: ${HEADER_PHONE_MAX_PX}px)`).matches
        ? HEADER_HIDE_MS_PHONE
        : HEADER_HIDE_MS_WIDE;

    const scheduleHide = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setHeaderHidden(true), hideDelay());
    };

    const showHeader = () => {
      if (focusNavLockRef.current) return;
      setHeaderHidden(false);
      scheduleHide();
    };

    const onScroll = () => {
      if (focusNavLockRef.current) return;
      const y = window.scrollY;
      const dy = y - lastScrollY;
      lastScrollY = y;
      /* Tylko scroll w górę odkrywa ukryty header */
      if (dy < -4) showHeader();
    };

    const onWheel = (e: WheelEvent) => {
      if (focusNavLockRef.current) return;
      if (e.deltaY < 0) showHeader();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'touchstart',
      'keydown',
    ];

    showHeader();
    for (const ev of activityEvents) {
      window.addEventListener(ev, showHeader, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      if (timer) window.clearTimeout(timer);
      for (const ev of activityEvents) {
        window.removeEventListener(ev, showHeader);
      }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('header-hidden', headerHidden);
  }, [headerHidden]);

  const selectView = (next: AppView) => {
    focusNavLockRef.current = false;
    setView(next);
    sessionStorage.setItem(STORAGE_KEY_VIEW, String(next));
    setSelectedId(null);
    setFocusOrderId(null);
  };

  const openOrderInView1 = (orderId: number) => {
    focusNavLockRef.current = true;
    setHeaderHidden(false);
    setSelectedId(null);
    setView(1);
    sessionStorage.setItem(STORAGE_KEY_VIEW, '1');
    setFocusOrderId(orderId);
  };

  const clearFocusOrder = () => {
    setFocusOrderId(null);
    focusNavLockRef.current = false;
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
          const rows = [...byId.values()];
          const tracked = trackProductionGains(rows);
          if (tracked.lastGainAt != null) lastGainAtRef.current = tracked.lastGainAt;
          setOrders(rows);
        } else {
          // Zapis % dzieci z checklisty matki — przy ręcznym Odśwież (nie auto-refresh).
          // Bez tego matki mają ProductionPrc z OptiCut, a dzieci zostają na 0.00.
          if (writePrc && viewRef.current === 1) {
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
          const rows = res.orders || [];
          const tracked = trackProductionGains(rows);
          if (tracked.lastGainAt != null) lastGainAtRef.current = tracked.lastGainAt;
          setOrders(rows);
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
        const rows = res.orders || [];
        const tracked = trackProductionGains(rows);
        if (tracked.lastGainAt != null) lastGainAtRef.current = tracked.lastGainAt;
        setOrders(rows);
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
      const rows = [...byId.values()];
      const tracked = trackProductionGains(rows);
      if (tracked.lastGainAt != null) lastGainAtRef.current = tracked.lastGainAt;
      setOrders(rows);
      setUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fetchError');
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [t]);

  useEffect(() => {
    if (!unlocked || !filterState4Acked || selectedId != null) return;
    // Sync % dzieci zawsze (bez DEV) — start / zmiana widoku / auto-refresh
    const shouldWritePrc = !prodTestRef.current && viewRef.current === 1;
    void load({ writePrc: shouldWritePrc });
    if (prodTest || autoRefreshStopped) {
      setRefreshInSec(0);
      return;
    }

    const nextSec = () =>
      Math.ceil(resolveAutoRefreshMs(lastGainAtRef.current) / 1000);

    let left = nextSec();
    setRefreshInSec(isAutoRefreshHours() ? left : 0);

    const tick = window.setInterval(() => {
      if (!isAutoRefreshHours()) {
        left = nextSec();
        setRefreshInSec(0);
        return;
      }
      left -= 1;
      if (left <= 0) {
        const writePrc = !prodTestRef.current && viewRef.current === 1;
        void load({ writePrc }).finally(() => {
          left = nextSec();
          setRefreshInSec(left);
        });
        left = nextSec();
      }
      setRefreshInSec(Math.max(left, 0));
    }, 1000);

    return () => window.clearInterval(tick);
  }, [
    unlocked,
    filterState4Acked,
    selectedId,
    load,
    prodTest,
    view,
    autoRefreshStopped,
  ]);

  const ackFilterState4 = () => {
    sessionStorage.setItem(STORAGE_KEY_FILTER_STATE4_ACK, '1');
    setFilterState4Acked(true);
  };

  if (needsGate && !unlocked) {
    return (
      <LoginGate
        onUnlock={() => {
          sessionStorage.removeItem(STORAGE_KEY_FILTER_STATE4_ACK);
          setFilterState4Acked(false);
          setUnlocked(true);
        }}
      />
    );
  }

  if (unlocked && !filterState4Acked) {
    return <FilterState4Modal onConfirm={ackFilterState4} />;
  }

  /* Ten sam pasek DEV w widoku 1 i 2 (board = view 3) */
  const showDevChrome = devMode && !prodTest;
  const showOrdersToSync = showDevChrome;

  const goView1ForAnim = () => {
    if (view !== 1) {
      setView(1);
      sessionStorage.setItem(STORAGE_KEY_VIEW, '1');
    }
  };

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
                writePrc: Boolean(!prodTest && view === 1),
              })
            }
            disabled={loading}
          >
            {loading ? t('refreshing') : t('refresh')}
          </button>
          {showDevChrome ? (
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
                title={`Auto-refresh ${AUTO_REFRESH_HOUR_FROM}:00–${AUTO_REFRESH_HOUR_TO}:00 · 60s / 3min / 8min wg przyrostu %`}
              >
                {autoRefreshStopped || refreshInSec <= 0
                  ? '—'
                  : refreshInSec >= 60
                    ? `${Math.floor(refreshInSec / 60)}:${String(refreshInSec % 60).padStart(2, '0')}`
                    : `${refreshInSec}s`}
              </span>
            </>
          ) : null}
        </span>
        {!prodTest ? (
          <span className="filter-state4-header" title={t('filterState4Notice')}>
            {t('filterState4Header')}
          </span>
        ) : null}
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
        {showDevChrome ? (
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                goView1ForAnim();
                setAnimPlayToken((n) => n + 1);
                setFocusOrderId(ANIM_DEMO_ORDER_ID);
              }}
              title={`#${ANIM_DEMO_ORDER_ID}`}
            >
              {t('playAnim')}
            </button>
          </>
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
          sessionStorage.removeItem(STORAGE_KEY_FILTER_STATE4_ACK);
          setFilterState4Acked(false);
          setUnlocked(false);
        }}
      >
        {t('logout')}
      </button>
    ) : null;

  return (
    <>
      <TopBar
        nav={headerNav}
        actions={headerActions}
        logout={headerLogout}
        devMode={devMode}
        onToggleDev={toggleDevMode}
        hidden={headerHidden}
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
              className={[
                'panel',
                'panel--flush-top',
                view === 3 && !prodTest ? 'panel--flat' : '',
                view === 1 && !prodTest ? 'panel--ghost' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {error ? <div className="error">{error}</div> : null}
              {!error && loading && orders.length === 0 ? (
                <div className="page-loading" role="status" aria-live="polite">
                  <span className="page-loading__spinner" aria-hidden />
                  <span className="page-loading__text">{t('loadingOrders')}</span>
                </div>
              ) : null}
              {!error && !(loading && orders.length === 0) && prodTest ? (
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
              {!error && !(loading && orders.length === 0) && !prodTest && view === 1 ? (
                <OrderList
                  orders={orders}
                  focusOrderId={focusOrderId}
                  onFocusHandled={clearFocusOrder}
                  animOrderId={ANIM_DEMO_ORDER_ID}
                  animPlayToken={animPlayToken}
                />
              ) : null}
              {!error && !(loading && orders.length === 0) && !prodTest && view === 2 ? (
                <OrdersTableView orders={orders} onSelect={setSelectedId} />
              ) : null}
              {!error && !(loading && orders.length === 0) && !prodTest && view === 3 ? (
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
