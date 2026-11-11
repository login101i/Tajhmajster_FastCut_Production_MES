import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { undoChecklistScan } from '../lib/api';

export function UndoScanModal({
  open,
  onClose,
  onUndone,
}: {
  open: boolean;
  onClose: () => void;
  onUndone: (payload: {
    idJoin: number;
    idOrder: number;
    previousStamp: number;
    quantityStamp: number;
  }) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [idJoinInput, setIdJoinInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setOkMsg('');
    setIdJoinInput('');
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const idJoin = parseInt(idJoinInput.trim(), 10);
    if (!Number.isFinite(idJoin) || idJoin <= 0) {
      setError(t('undoScanInvalid'));
      return;
    }
    setSubmitting(true);
    setError('');
    setOkMsg('');
    try {
      const res = await undoChecklistScan(idJoin);
      setOkMsg(
        t('undoScanSuccess', {
          idJoin: res.idJoin,
          from: res.previousStamp,
          to: res.quantityStamp,
        }),
      );
      setIdJoinInput('');
      await onUndone({
        idJoin: res.idJoin,
        idOrder: res.idOrder,
        previousStamp: res.previousStamp,
        quantityStamp: res.quantityStamp,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ots-overlay" role="presentation" onClick={onClose}>
      <div
        className="ots-modal undo-scan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="undo-scan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ots-modal__head">
          <h2 id="undo-scan-title">{t('undoScanTitle')}</h2>
          <button
            type="button"
            className="btn btn-ghost ots-modal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="undo-scan-sub muted">{t('undoScanHint')}</p>

        <div className="undo-scan-row">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="undo-scan-input"
            value={idJoinInput}
            onChange={(e) => setIdJoinInput(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="MES number"
            disabled={submitting}
          />
          <button
            type="button"
            className="btn undo-scan-submit"
            disabled={submitting || !idJoinInput.trim()}
            onClick={() => void submit()}
          >
            {submitting ? t('undoScanWorking') : t('undoScanConfirm')}
          </button>
        </div>

        {error ? <p className="undo-scan-error">{error}</p> : null}
        {okMsg ? <p className="undo-scan-ok">{okMsg}</p> : null}
      </div>
    </div>
  );
}
