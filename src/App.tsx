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
import { UndoScanModal } from './components/UndoScanModal';
import {
  ProductionTestView,
  type SyncResult,
} from './components/ProductionTestView';
import { useI18n } from './i18n/LanguageContext';
import {
  clearStoredToken,
  fetchOrders,
  fetchOrdersToSyncPrc,
  fetchProductionLastChange,
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
  HEADER_SHOW_DELAY_MS,
  HEADER_SHOW_MOVE_GAP_MS,
  isAutoRefreshHours,
  isChildProductionsGroup,
  LAST_CHANGE_POLL_MS,
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
  resolveScanFocusTargets,
  trackProductionGains,
  type GainTrackResult,
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
        </div>

        <div className="topbar__desktop">
          <div className="topbar__left">
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

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`refresh-icon${spinning ? ' refresh-icon--spin' : ''}`}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
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
  /** Dodatkowe wiersze flash (np. matka + dziecko po skanie). */
  const [focusHighlightIds, setFocusHighlightIds] = useState<number[]>([]);
  /** nav = klik z widoku 2 (żółty); scan = przyrost % (zielony). */
  const [focusVariant, setFocusVariant] = useState<'nav' | 'scan'>('nav');
  /** Ponów animację fokus nawet dla tego samego Id. */
  const [focusNonce, setFocusNonce] = useState(0);
  const [refreshInSec, setRefreshInSec] = useState(() =>
    Math.ceil(resolveAutoRefreshMs(getLastProductionGainAt()) / 1000),
  );
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const [undoScanOpen, setUndoScanOpen] = useState(false);
  /** DEV: status polla last-change (~1.5 s). */
  const [lastChangeDev, setLastChangeDev] = useState<{
    phase: 'off' | 'wait' | 'same' | 'change' | 'baseline' | 'off-hours' | 'error';
    nextAt: number;
    stampSum: number | null;
    changedGroupIds: number[];
    detail: string;
  }>({
    phase: 'off',
    nextAt: 0,
    stampSum: null,
    changedGroupIds: [],
    detail: '',
  });
  const [lastChangeCountdownSec, setLastChangeCountdownSec] = useState(0);
  const lastGainAtRef = useRef<number | null>(getLastProductionGainAt());
  const lastChangeVersionRef = useRef<string | null>(null);
  /** groupId → "stampSum:qtySum" z ostatniego last-change. */
  const lastChangeGroupsRef = useRef<Map<number, string>>(new Map());
  const lastChangeOrdersModRef = useRef<number>(0);
  const loadInFlightRef = useRef(false);
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

  // Header: chowa się po bezruchu. Mysz odkrywa dopiero po ~1 s ciągłego ruchu.
  useEffect(() => {
    let hideTimer: number | undefined;
    let showTimer: number | undefined;
    let moveGapTimer: number | undefined;
    let lastScrollY = window.scrollY;
    const headerHiddenRef = { current: false };

    const hideDelay = () =>
      window.matchMedia(`(max-width: ${HEADER_PHONE_MAX_PX}px)`).matches
        ? HEADER_HIDE_MS_PHONE
        : HEADER_HIDE_MS_WIDE;

    const clearShowPending = () => {
      if (showTimer) window.clearTimeout(showTimer);
      if (moveGapTimer) window.clearTimeout(moveGapTimer);
      showTimer = undefined;
      moveGapTimer = undefined;
    };

    const scheduleHide = () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        headerHiddenRef.current = true;
        setHeaderHidden(true);
      }, hideDelay());
    };

    const showHeaderNow = () => {
      if (focusNavLockRef.current) return;
      clearShowPending();
      headerHiddenRef.current = false;
      setHeaderHidden(false);
      scheduleHide();
    };

    /** Mysz: pokaż dopiero po HEADER_SHOW_DELAY_MS ciągłego ruchu (nie przy szybkim przelocie). */
    const onMouseMove = () => {
      if (focusNavLockRef.current) return;
      if (!headerHiddenRef.current) {
        scheduleHide();
        return;
      }
      if (moveGapTimer) window.clearTimeout(moveGapTimer);
      moveGapTimer = window.setTimeout(clearShowPending, HEADER_SHOW_MOVE_GAP_MS);
      if (!showTimer) {
        showTimer = window.setTimeout(() => {
          showTimer = undefined;
          showHeaderNow();
        }, HEADER_SHOW_DELAY_MS);
      }
    };

    const onScroll = () => {
      if (focusNavLockRef.current) return;
      const y = window.scrollY;
      const dy = y - lastScrollY;
      lastScrollY = y;
      if (dy < -4) showHeaderNow();
    };

    const onWheel = (e: WheelEvent) => {
      if (focusNavLockRef.current) return;
      if (e.deltaY < 0) showHeaderNow();
    };

    const intentionalShowEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'touchstart',
      'keydown',
    ];

    showHeaderNow();
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    for (const ev of intentionalShowEvents) {
      window.addEventListener(ev, showHeaderNow, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      clearShowPending();
      window.removeEventListener('mousemove', onMouseMove);
      for (const ev of intentionalShowEvents) {
        window.removeEventListener(ev, showHeaderNow);
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
    setFocusVariant('nav');
    setFocusHighlightIds([orderId]);
    setFocusOrderId(orderId);
    setFocusNonce((n) => n + 1);
  };

  const clearFocusOrder = () => {
    setFocusOrderId(null);
    setFocusHighlightIds([]);
    setFocusVariant('nav');
    focusNavLockRef.current = false;
  };

  /** Po wykryciu przyrostu % (skan) — widok 1, scroll, zielony flash 3 s. */
  const applyScanFocusFromGains = useCallback(
    (rows: OrderRow[], tracked: GainTrackResult) => {
      if (tracked.lastGainAt != null) lastGainAtRef.current = tracked.lastGainAt;
      if (!tracked.hadFreshGain || tracked.freshGainIds.length === 0) return;
      if (prodTestRef.current) return;

      const { primaryId, highlightIds } = resolveScanFocusTargets(
        rows,
        tracked.freshGainIds,
      );
      if (!primaryId) return;

      focusNavLockRef.current = true;
      setHeaderHidden(false);
      setSelectedId(null);
      setView(1);
      sessionStorage.setItem(STORAGE_KEY_VIEW, '1');
      setFocusVariant('scan');
      setFocusHighlightIds(highlightIds);
      setFocusOrderId(primaryId);
      setFocusNonce((n) => n + 1);
      setAnimPlayToken((n) => n + 1);
    },
    [],
  );

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
    async (
      opts: {
        writePrc?: boolean;
        /** Sync tylko tych matek (szybka ścieżka po last-change). */
        onlyGroupIds?: number[];
        /** Bez spinnera całej strony (poll w tle). */
        silent?: boolean;
      } = {},
    ) => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      const writePrc = opts.writePrc === true;
      const onlyGroupIds = opts.onlyGroupIds;
      const silent = opts.silent === true;
      if (!silent) setLoading(true);
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
          applyScanFocusFromGains(rows, tracked);
          setOrders(rows);
        } else {
          // Sync dzieci: albo wskazane grupy (szybko), albo wszystkie (ręczne Odśwież / backup)
          if (writePrc && (viewRef.current === 1 || viewRef.current === 3)) {
            let groupIds = onlyGroupIds;
            if (!groupIds) {
              const preview = await fetchOrdersToSyncPrc({
                from: SYNC_PRODUCTIONS_FROM_DATE,
                minId: MIN_PRODUCTION_ORDER_ID,
              });
              groupIds = (preview.groups || []).map((g) => g.groupId);
            }
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
          applyScanFocusFromGains(rows, tracked);
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
        if (!silent) setLoading(false);
        loadInFlightRef.current = false;
      }
    },
    [t, applyScanFocusFromGains],
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
        applyScanFocusFromGains(rows, tracked);
        setOrders(rows);
        setUpdatedAt(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : t('fetchError');
        setError(message);
        throw err;
      }
    },
    [t, applyScanFocusFromGains],
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
      applyScanFocusFromGains(rows, tracked);
      setOrders(rows);
      setUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fetchError');
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [t, applyScanFocusFromGains]);

  // Prefetch od razu po logowaniu (także gdy popup State 4 jest otwarty)
  useEffect(() => {
    if (!unlocked || selectedId != null) return;
    const v = viewRef.current;
    const shouldWritePrc =
      !prodTestRef.current && (v === 1 || v === 3);
    void load({ writePrc: shouldWritePrc });
  }, [unlocked, selectedId, load, prodTest, view]);

  // Lekki poll last-change (~1.5 s) → sync TYLKO zmienionych grup (+ fetch listy)
  useEffect(() => {
    if (
      !unlocked ||
      !filterState4Acked ||
      selectedId != null ||
      prodTest ||
      autoRefreshStopped
    ) {
      setLastChangeDev({
        phase: 'off',
        nextAt: 0,
        stampSum: null,
        changedGroupIds: [],
        detail: autoRefreshStopped
          ? 'stop'
          : selectedId != null
            ? 'detail'
            : 'off',
      });
      return;
    }

    let cancelled = false;
    let nextAt = Date.now() + LAST_CHANGE_POLL_MS;
    if (devModeRef.current) {
      setLastChangeDev({
        phase: 'wait',
        nextAt,
        stampSum: null,
        changedGroupIds: [],
        detail: 'poll…',
      });
    }

    const rememberSnapshot = (res: Awaited<ReturnType<typeof fetchProductionLastChange>>) => {
      lastChangeVersionRef.current = res.version;
      lastChangeOrdersModRef.current = res.ordersModUnix || 0;
      const next = new Map<number, string>();
      for (const g of res.groups || []) {
        next.set(g.groupId, `${g.stampSum}:${g.qtySum}`);
      }
      lastChangeGroupsRef.current = next;
    };

    type LcPhase =
      | 'off'
      | 'wait'
      | 'same'
      | 'change'
      | 'baseline'
      | 'off-hours'
      | 'error';

    const reportDev = (
      phase: LcPhase,
      res: Awaited<ReturnType<typeof fetchProductionLastChange>> | null,
      changedGroupIds: number[] = [],
      detail = '',
    ) => {
      if (!devModeRef.current) return;
      nextAt = Date.now() + LAST_CHANGE_POLL_MS;
      setLastChangeDev({
        phase,
        nextAt,
        stampSum: res?.stampSum ?? null,
        changedGroupIds,
        detail,
      });
    };

    const poll = async () => {
      if (cancelled) return;
      // Last-change zawsze aktywny (nie tylko DEV / nie tylko 6–18) — skan → animacja
      try {
        const res = await fetchProductionLastChange({
          minId: MIN_PRODUCTION_ORDER_ID,
        });
        if (cancelled || !res?.version) {
          reportDev('error', res ?? null, [], 'brak version');
          return;
        }

        if (lastChangeVersionRef.current == null) {
          rememberSnapshot(res);
          reportDev('baseline', res, [], `Σstamp=${res.stampSum}`);
          return;
        }
        if (res.version === lastChangeVersionRef.current) {
          reportDev('same', res, [], `Σstamp=${res.stampSum}`);
          return;
        }

        const prevGroups = lastChangeGroupsRef.current;
        const changedGroupIds: number[] = [];
        for (const g of res.groups || []) {
          const key = `${g.stampSum}:${g.qtySum}`;
          if (prevGroups.get(g.groupId) !== key) changedGroupIds.push(g.groupId);
        }
        // Nowa matka na liście / usunięta — też zsynchronizuj nowe Id
        for (const g of res.groups || []) {
          if (!prevGroups.has(g.groupId) && !changedGroupIds.includes(g.groupId)) {
            changedGroupIds.push(g.groupId);
          }
        }

        const ordersModChanged =
          (res.ordersModUnix || 0) !== lastChangeOrdersModRef.current;

        rememberSnapshot(res);

        const v = viewRef.current;
        const canWrite = !prodTestRef.current && (v === 1 || v === 3);

        reportDev(
          'change',
          res,
          changedGroupIds,
          changedGroupIds.length
            ? `#${changedGroupIds.join(',#')}`
            : ordersModChanged
              ? 'DateMod'
              : 'version',
        );

        if (changedGroupIds.length > 0 && canWrite) {
          // Szybka ścieżka: sync 1–N zmienionych matek, nie całej listy grup
          await load({
            writePrc: true,
            onlyGroupIds: changedGroupIds,
            silent: true,
          });
        } else if (ordersModChanged || changedGroupIds.length > 0) {
          // Sam DateMod / OptiCut — wystarczy odczyt listy
          await load({ writePrc: false, silent: true });
        }

        // Po syncu DateMod dzieci się zmienia — zresetuj fingerprint
        try {
          const again = await fetchProductionLastChange({
            minId: MIN_PRODUCTION_ORDER_ID,
          });
          if (!cancelled && again?.version) {
            rememberSnapshot(again);
            if (devModeRef.current) {
              nextAt = Date.now() + LAST_CHANGE_POLL_MS;
              setLastChangeDev((prev) => ({
                ...prev,
                nextAt,
                stampSum: again.stampSum,
              }));
            }
          }
        } catch {
          /* ignore */
        }
      } catch {
        reportDev('error', null, [], 'network');
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), LAST_CHANGE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    unlocked,
    filterState4Acked,
    selectedId,
    load,
    prodTest,
    autoRefreshStopped,
    devMode,
  ]);

  // DEV: odliczanie do kolejnego ticka last-change
  useEffect(() => {
    if (!devMode || !unlocked || prodTest) {
      setLastChangeCountdownSec(0);
      return;
    }
    const tick = window.setInterval(() => {
      const left = Math.max(0, lastChangeDev.nextAt - Date.now());
      setLastChangeCountdownSec(left / 1000);
    }, 100);
    return () => window.clearInterval(tick);
  }, [devMode, unlocked, prodTest, lastChangeDev.nextAt]);

  // Backup pełnego odświeżenia (3–8 min) — last-change obsługuje skany
  useEffect(() => {
    if (
      !unlocked ||
      !filterState4Acked ||
      selectedId != null ||
      prodTest ||
      autoRefreshStopped
    ) {
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
        const v = viewRef.current;
        const writePrc =
          !prodTestRef.current && (v === 1 || v === 3);
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
        <button
          type="button"
          className="undo-scan-nav-btn"
          onClick={() => setUndoScanOpen(true)}
          title={t('undoScanBtn')}
        >
          {t('undoScanBtn')}
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
            className="btn btn-icon refresh-btn"
            type="button"
            onClick={() =>
              void load({
                writePrc: Boolean(!prodTest && (view === 1 || view === 3)),
              })
            }
            disabled={loading}
            aria-label={loading ? t('refreshing') : t('refresh')}
            title={loading ? t('refreshing') : t('refresh')}
          >
            <RefreshIcon spinning={loading} />
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
                title={`Backup full refresh ${AUTO_REFRESH_HOUR_FROM}:00–${AUTO_REFRESH_HOUR_TO}:00 · 3min / 8min`}
              >
                {autoRefreshStopped || refreshInSec <= 0
                  ? '—'
                  : refreshInSec >= 60
                    ? `${Math.floor(refreshInSec / 60)}:${String(refreshInSec % 60).padStart(2, '0')}`
                    : `${refreshInSec}s`}
              </span>
              <span
                className={[
                  'last-change-dev',
                  lastChangeDev.phase === 'change'
                    ? 'last-change-dev--hit'
                    : '',
                  lastChangeDev.phase === 'same' ||
                  lastChangeDev.phase === 'baseline'
                    ? 'last-change-dev--ok'
                    : '',
                  lastChangeDev.phase === 'off-hours' ||
                  lastChangeDev.phase === 'error'
                    ? 'last-change-dev--warn'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title="DEV last-change poll (QuantityStamp fingerprint)"
              >
                {`LC ${lastChangeCountdownSec.toFixed(1)}s · ${
                  lastChangeDev.phase === 'same'
                    ? 'same'
                    : lastChangeDev.phase === 'change'
                      ? `HIT ${lastChangeDev.detail}`
                      : lastChangeDev.phase === 'baseline'
                        ? 'baseline'
                        : lastChangeDev.phase === 'off-hours'
                          ? `OFF ${lastChangeDev.detail}`
                          : lastChangeDev.phase === 'error'
                            ? `ERR ${lastChangeDev.detail}`
                            : lastChangeDev.phase === 'wait'
                              ? 'wait'
                              : lastChangeDev.detail || lastChangeDev.phase
                }${
                  lastChangeDev.stampSum != null
                    ? ` · Σ${lastChangeDev.stampSum}`
                    : ''
                }`}
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
                  focusHighlightIds={focusHighlightIds}
                  focusVariant={focusVariant}
                  focusNonce={focusNonce}
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

      <UndoScanModal
        open={undoScanOpen}
        onClose={() => setUndoScanOpen(false)}
        onUndone={async ({ idOrder }) => {
          await load({
            writePrc: Boolean(!prodTestRef.current && (viewRef.current === 1 || viewRef.current === 3)),
            onlyGroupIds: [idOrder],
            silent: true,
          });
        }}
      />
    </>
  );
}
