import { useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';

export function FilterState4Modal({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);

  return (
    <div className="filter-gate" role="presentation">
      <div
        className="filter-gate__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-gate-title"
      >
        <h2 id="filter-gate-title" className="filter-gate__title">
          {t('filterState4Title')}
        </h2>
        <p className="filter-gate__text">{t('filterState4Notice')}</p>
        <p className="filter-gate__hint muted">{t('filterState4Hint')}</p>
        <label className="filter-gate__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>{t('filterState4Checkbox')}</span>
        </label>
        <button
          type="button"
          className="btn filter-gate__btn"
          disabled={!checked}
          onClick={onConfirm}
        >
          {t('filterState4Confirm')}
        </button>
      </div>
    </div>
  );
}
