import { FormEvent, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { setStoredToken } from '../lib/api';
import { LanguageSwitcher } from './LanguageSwitcher';

function LogoBadge() {
  return (
    <div className="logo-badge" aria-label="LIGNUM LINK">
      <span className="logo-badge__mark">LL</span>
      Lignum Link
    </div>
  );
}

export function LoginGate({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    setStoredToken(password.trim());
    setError('');
    onUnlock();
  }

  return (
    <div className="login-page">
      <div className="login-hero" aria-hidden>
        <div className="login-hero__art" />
      </div>
      <div className="login-panel">
        <div className="login-panel__top">
          <LanguageSwitcher />
          <div className="login-panel__brand">
            <LogoBadge />
          </div>
        </div>
        <h1>{t('loginTitle')}</h1>
        <form onSubmit={submit}>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <div className="error" style={{ padding: 0, textAlign: 'left' }}>
              {error}
            </div>
          ) : null}
          <button className="btn" type="submit">
            {t('logIn')}
          </button>
        </form>
        <p className="login-hint">{t('loginHint')}</p>
      </div>
    </div>
  );
}
