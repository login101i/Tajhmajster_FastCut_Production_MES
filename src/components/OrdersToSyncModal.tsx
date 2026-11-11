import { useState } from 'react';
import { MIN_PRODUCTION_ORDER_ID } from '../../config/project';
import { useI18n } from '../i18n/LanguageContext';
import type { OrdersToSyncGroup } from '../lib/api';

export function OrdersToSyncModal({
  open,
  loading,
  groups,
  onClose,
  onUpdateGroup,
}: {
  open: boolean;
  loading: boolean;
  groups: OrdersToSyncGroup[];
  onClose: () => void;
  onUpdateGroup: (groupId: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  if (!open) return null;

  const childCount = groups.reduce((n, g) => n + g.children.length, 0);

  const handleUpdate = async (groupId: number) => {
    setUpdatingId(groupId);
    try {
      await onUpdateGroup(groupId);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="ots-overlay" role="presentation" onClick={onClose}>
      <div
        className="ots-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ots-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ots-modal__head">
          <h2 id="ots-title">{t('ordersToSyncTitle')}</h2>
          <button type="button" className="btn btn-ghost ots-modal__close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="ots-modal__hint muted">
          {t('ordersToSyncHint', {
            minId: MIN_PRODUCTION_ORDER_ID,
            groups: groups.length,
            children: childCount,
          })}
        </p>

        {loading ? (
          <p className="ots-modal__loading">{t('ordersToSyncLoading')}</p>
        ) : groups.length === 0 ? (
          <p className="ots-modal__empty">{t('ordersToSyncEmpty')}</p>
        ) : (
          <ul className="ots-list">
            {groups.map((g) => (
              <li key={g.groupId} className="ots-group">
                <div className="ots-group__mother">
                  <strong>
                    #{g.groupId} · {t('prodTestMother')}
                  </strong>
                  <div className="ots-group__actions">
                    <span className="ots-prc">{formatPrc(g.mother.productionPrc)}</span>
                    <button
                      type="button"
                      className="btn ots-update-btn"
                      disabled={updatingId != null || g.children.length === 0}
                      onClick={() => void handleUpdate(g.groupId)}
                    >
                      {updatingId === g.groupId
                        ? t('ordersToSyncUpdating')
                        : t('ordersToSyncUpdate')}
                    </button>
                  </div>
                  {g.mother.description ? (
                    <div className="ots-desc muted">{g.mother.description}</div>
                  ) : null}
                </div>
                {g.children.length === 0 ? (
                  <div className="ots-child muted">{t('ordersToSyncNoChildren')}</div>
                ) : (
                  <ul className="ots-children">
                    {g.children.map((c) => (
                      <li key={c.id}>
                        <span>
                          #{c.id} · {t('child')}
                          {c.description ? ` — ${c.description}` : ''}
                        </span>
                        <span className="ots-prc">{formatPrc(c.productionPrc)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="ots-modal__foot">
          <button type="button" className="btn" onClick={onClose}>
            {t('ordersToSyncClose')}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPrc(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  /* Bez zaokrąglania w górę — jak na monitorze. */
  return `${Math.floor(n + 1e-9)}%`;
}
