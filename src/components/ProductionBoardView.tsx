import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import {
  buildBoardClusters,
  isBoardInProgress,
  isBoardPickup,
  isRejected,
  pctOf,
  type BoardCluster,
} from '../lib/orderDisplay';
import { resolveFillColor } from '../lib/percent';
import {
  hasRecentProductionGain,
  trackProductionGains,
} from '../lib/recentGains';
import type { OrderRow } from '../types';

/** Niebieska ikona „zlecenie grupowe” (środek kafelka matki). */
function GroupOrderIcon({ compact }: { compact?: boolean }) {
  const size = compact ? 28 : 40;
  return (
    <span className="pb-group-icon" title="Group order" aria-label="Group order">
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <rect x="3" y="4" width="8" height="8" rx="1.5" fill="#1e88e5" />
        <rect x="13" y="4" width="8" height="8" rx="1.5" fill="#42a5f5" />
        <rect x="3" y="14" width="8" height="8" rx="1.5" fill="#42a5f5" />
        <rect x="13" y="14" width="8" height="8" rx="1.5" fill="#1e88e5" />
      </svg>
    </span>
  );
}

function OrderCard({
  order,
  onSelect,
  role,
  pickup,
  showGroupIcon,
  shine,
}: {
  order: OrderRow;
  onSelect: (id: number) => void;
  role?: 'mother' | 'child';
  pickup?: boolean;
  showGroupIcon?: boolean;
  shine?: boolean;
}) {
  const pct = pctOf(order);
  const rejected = isRejected(order);
  /* Ciemna zieleń tylko matka; dzieci = zwykła zieleń */
  const fillColor = resolveFillColor(pct, { isGroup: role === 'mother' });
  const prevRef = useRef<number | null>(null);
  const [displayWidth, setDisplayWidth] = useState(pct);
  const [growing, setGrowing] = useState(false);
  const showShine = Boolean(shine) && !rejected && pct > 0;

  // Jak PercentBar w widoku 1: animacja gdy % wzrośnie
  useEffect(() => {
    const prev = prevRef.current;
    const increased = prev != null && pct > prev + 0.001;

    if (increased) {
      setGrowing(true);
      setDisplayWidth(prev ?? 0);
      const raf = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setDisplayWidth(pct));
      });
      const t = window.setTimeout(() => setGrowing(false), 900);
      prevRef.current = pct;
      return () => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(t);
      };
    }

    setDisplayWidth(pct);
    prevRef.current = pct;
  }, [pct]);

  return (
    <button
      type="button"
      className={[
        'pb-card',
        role === 'mother' ? 'pb-card--mother' : '',
        role === 'child' ? 'pb-card--child' : '',
        pickup ? 'pb-card--pickup' : '',
        growing ? 'pb-card--grow' : '',
        rejected ? 'pb-card--rejected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(order.Id)}
      title={[order.Id, order.OwnNumber, `${pct.toFixed(0)}%`].filter(Boolean).join(' · ')}
    >
      <span
        className={`pb-card__fill${showShine ? ' shine' : ''}`}
        style={{ width: `${displayWidth}%`, backgroundColor: fillColor }}
        aria-hidden
      />
      <span className="pb-card__body">
        <span className="pb-card__id-block">
          <span className="pb-card__id">{order.Id}</span>
          {order.OwnNumber ? (
            <span className="pb-card__own" title={order.OwnNumber}>
              {order.OwnNumber}
            </span>
          ) : null}
        </span>
        {!pickup && showGroupIcon ? (
          <GroupOrderIcon compact={role === 'child'} />
        ) : null}
        {!pickup && role !== 'mother' ? (
          <span className="pb-card__pct">{pct.toFixed(0)}%</span>
        ) : null}
      </span>
    </button>
  );
}

function ClusterBlock({
  cluster,
  onSelect,
  pickup,
  gainTimes,
}: {
  cluster: BoardCluster;
  onSelect: (id: number) => void;
  pickup?: boolean;
  gainTimes: Map<number, number>;
}) {
  if (!cluster.isGroup) {
    return (
      <div className="pb-cluster pb-cluster--solo">
        <OrderCard
          order={cluster.root}
          onSelect={onSelect}
          pickup={pickup}
          shine={hasRecentProductionGain(cluster.root.Id, gainTimes)}
        />
      </div>
    );
  }

  const mother = cluster.members.find((o) => o.Id === cluster.rootId);
  const children = cluster.members
    .filter((o) => o.Id !== cluster.rootId)
    .slice()
    .sort((a, b) => b.Id - a.Id);
  const iconOnFirstChild = !mother && children.length > 0;

  return (
    <div className="pb-cluster" role="group" aria-label={`#${cluster.rootId}`}>
      {mother ? (
        <OrderCard
          order={mother}
          onSelect={onSelect}
          role="mother"
          pickup={pickup}
          showGroupIcon
          shine={hasRecentProductionGain(mother.Id, gainTimes)}
        />
      ) : null}
      {children.length > 0 ? (
        <div className="pb-cluster__children">
          {children.map((o, i) => (
            <OrderCard
              key={o.Id}
              order={o}
              onSelect={onSelect}
              role="child"
              pickup={pickup}
              showGroupIcon={iconOnFirstChild && i === 0}
              shine={hasRecentProductionGain(o.Id, gainTimes)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ClusterGrid({
  clusters,
  onSelect,
  empty,
  lane,
  pickup,
  gainTimes,
}: {
  clusters: BoardCluster[];
  onSelect: (id: number) => void;
  empty: string;
  lane?: boolean;
  pickup?: boolean;
  gainTimes: Map<number, number>;
}) {
  return (
    <div
      className={`pb-grid${lane ? ' pb-grid--lane' : ''}${pickup ? ' pb-grid--pickup' : ''}`}
    >
      {clusters.map((c) => (
        <ClusterBlock
          key={c.rootId}
          cluster={c}
          onSelect={onSelect}
          pickup={pickup}
          gainTimes={gainTimes}
        />
      ))}
      {clusters.length === 0 ? <p className="pb-empty">{empty}</p> : null}
    </div>
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
  const gainTimes = trackProductionGains(orders).gainTimes;
  const clusters = buildBoardClusters(orders);
  const active = clusters.filter((c) => isBoardInProgress(c.root, c.pct));
  const pickup = clusters.filter((c) => isBoardPickup(c.root, c.pct));

  return (
    <div className="pb pb--with-pickup">
      <div className="pb-main">
        <ClusterGrid
          clusters={active}
          onSelect={onSelect}
          empty={t('boardEmpty')}
          gainTimes={gainTimes}
        />
      </div>

      <aside className="pb-lane pb-lane--pickup">
        <div className="pb-lane__head pb-lane__head--pickup-row">
          <span className="pb-lane__icon pb-lane__icon--car" aria-hidden>
            <svg viewBox="0 0 24 24" width="56" height="56">
              <path
                fill="none"
                stroke="#1976d2"
                strokeWidth="1.6"
                d="M3 15h11v4H3zM14 16h4l3 3v0H14zM6 19a1.5 1.5 0 1 0 0.01 0M17 19a1.5 1.5 0 1 0 0.01 0M3 15l2-6h8l1 6"
              />
            </svg>
          </span>
          <span className="pb-lane__exit-arrow" aria-hidden title="→">
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path
                fill="none"
                stroke="#1976d2"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 12h14M12 5l7 7-7 7"
              />
            </svg>
          </span>
          <span className="pb-lane__title pb-lane__title--pickup">{t('pickup')}</span>
        </div>
        <ClusterGrid
          clusters={pickup}
          onSelect={onSelect}
          empty={t('pickupEmpty')}
          lane
          pickup
          gainTimes={gainTimes}
        />
      </aside>
    </div>
  );
}
