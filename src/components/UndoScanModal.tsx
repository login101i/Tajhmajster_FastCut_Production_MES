import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { undoChecklistScan } from '../lib/api';

const SUCCESS_HOLD_MS = 2_200;

function CheckIcon() {
  return (
    <svg
      className="undo-scan-ok-icon"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        d="M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6z"
        opacity="0.35"
      />
    </svg>
  );
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<number | null>(null);
  const [idJoinInput, setIdJoinInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSucceeded, setJustSucceeded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setJustSucceeded(false);
    setIdJoinInput('');
    if (successTimerRef.current != null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    const tFocus = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(tFocus);
      if (successTimerRef.current != null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
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
    setJustSucceeded(false);
    try {
      const res = await undoChecklistScan(idJoin);
      setIdJoinInput('');
      setJustSucceeded(true);
      if (successTimerRef.current != null) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setJustSucceeded(false);
        successTimerRef.current = null;
        inputRef.current?.focus();
      }, SUCCESS_HOLD_MS);
      await onUndone({
        idJoin: res.idJoin,
        idOrder: res.idOrder,
        previousStamp: res.previousStamp,
        quantityStamp: res.quantityStamp,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJustSucceeded(false);
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
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="undo-scan-input"
            value={idJoinInput}
            onChange={(e) => {
              setIdJoinInput(e.target.value.replace(/[^\d]/g, ''));
              if (justSucceeded) setJustSucceeded(false);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !justSucceeded) void submit();
            }}
            placeholder="MES number"
            disabled={submitting || justSucceeded}
          />
          {justSucceeded ? (
            <button
              type="button"
              className="btn undo-scan-submit undo-scan-submit--ok"
              disabled
              aria-live="polite"
            >
              <CheckIcon />
              <span>{t('undoScanDone')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn undo-scan-submit"
              disabled={submitting || !idJoinInput.trim()}
              onClick={() => void submit()}
            >
              {submitting ? t('undoScanWorking') : t('undoScanConfirm')}
            </button>
          )}
        </div>

        {error ? <p className="undo-scan-error">{error}</p> : null}
      </div>
    </div>
  );
}
