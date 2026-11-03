import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LANGS, localeFor, t, type Lang, type MessageKey } from './messages';

const STORAGE_KEY = 'tajhmajster_lang';

function readStoredLang(): Lang {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'sl' || raw === 'en' || raw === 'pl') return raw;
  return 'pl';
}

type I18nCtx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  locale: string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === 'sl' ? 'sl' : next;
  }, []);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => t(lang, key, vars),
      locale: localeFor(lang),
    }),
    [lang, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside LanguageProvider');
  return ctx;
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div className={`lang-switch ${className}`} role="group" aria-label="Language">
      {LANGS.map((item) => (
        <button
          key={item.code}
          type="button"
          className={lang === item.code ? 'active' : ''}
          title={item.title}
          aria-pressed={lang === item.code}
          onClick={() => setLang(item.code)}
        >
          <span className="lang-switch__flag" aria-hidden>
            {item.flag}
          </span>
          <span className="lang-switch__code">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
