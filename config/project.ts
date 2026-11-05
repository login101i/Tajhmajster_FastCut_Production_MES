/**
 * =============================================================================
 *  Tajhmajster Production Tracker — konfiguracja projektu
 * =============================================================================
 *  Zmieniaj wartości TUTAJ. Po zapisie odśwież przeglądarkę.
 *  Dla zmian w API (Netlify Functions) zrestartuj `npm run dev` / local-api.
 *
 *  Reguła % (Id >= MIN_PRODUCTION_ORDER_ID, State = na produkcji):
 *  - Zlecenie GRUPOWE (IsGroupOrder=1): sync aktualizuje ProductionPrc DZIECI
 *    z checklisty matki (QuantityStamp/Quantity). Matki nie nadpisujemy.
 *  - Zlecenie POJEDYNCZE (np. 8727): NIE syncujemy — OptiCut sam ustawia
 *    Orders.ProductionPrc; monitor tylko odczytuje wartość przy Odśwież.
 * =============================================================================
 */

/** Wersja UI (prawy górny róg topbara). */
export const APP_VERSION = 'V.1.07';

/** Auto-odświeżanie listy (ms). 30_000 = 30 s, 60_000 = 60 s. */
export const AUTO_REFRESH_MS = 60_000;

/**
 * Godziny lokalne, w których działa auto-odświeżanie (oszczędność DB).
 * Od AUTO_REFRESH_HOUR_FROM włącznie do AUTO_REFRESH_HOUR_TO wyłącznie
 * (np. 6–18 = 06:00–17:59).
 */
export const AUTO_REFRESH_HOUR_FROM = 6;
export const AUTO_REFRESH_HOUR_TO = 18;

/** Czy teraz jest w oknie auto-odświeżania (czas lokalny przeglądarki). */
export function isAutoRefreshHours(d = new Date()): boolean {
  const h = d.getHours();
  return h >= AUTO_REFRESH_HOUR_FROM && h < AUTO_REFRESH_HOUR_TO;
}

/** Stan zlecenia = Realizacja (na produkcji). */
export const ORDER_STATE_ON_PRODUCTION = 4;

/** Stan zlecenia = Odrzucone (ciemny bordowy w widoku 1/3). */
export const ORDER_STATE_REJECTED = 2;

/**
 * Minimalne Orders.Id na liście głównej, widoku 3 i w syncu % grup.
 * Pokazujemy / syncujemy tylko zlecenia z Id >= tej wartości (+ State produkcja).
 */
export const MIN_PRODUCTION_ORDER_ID = 8700;

/**
 * Opcjonalny filtr daty Productions.DateAdd dla listy kandydatów syncu
 * (puste = wyłączony — wszystkie grupy Id>=MIN na produkcji).
 * Format YYYY-MM-DD albo '' żeby nie filtrować po dacie.
 */
export const SYNC_PRODUCTIONS_FROM_DATE = '';

/**
 * Widok 1: zlecenia z 0% spadają w dół, jeśli od wysłania na produkcję
 * (DateExecution / DateMod) minęło więcej niż ten czas bez przyrostu %.
 */
export const ZERO_PCT_IDLE_DROP_MS = 24 * 60 * 60 * 1000;

/** Limit rekordów przy pobieraniu listy zleceń (główny monitor). */
export const ORDERS_LIST_LIMIT = 500;

/** Limit przy pobieraniu jednej grupy (Production test). */
export const ORDERS_GROUP_LIMIT = 50;

/**
 * Grupy w trybie „Production test” (tylko przy włączonym DEV).
 * Sync % dzieci + podgląd checklisty.
 */
export const PRODUCTION_TEST_GROUP_IDS = [9121, 9124] as const;

/**
 * Dla tych groupId (przy createChildProductions=1) sync tworzy/aktualizuje
 * wiersze Productions dla dzieci (nie matki).
 */
export const CHILD_PRODUCTIONS_GROUP_IDS = [9124] as const;

/** Symbol ścieżki Productions kopiowanej na dzieci (tylko powyższe grupy). */
export const CHILD_PRODUCTIONS_SYMBOL = 'TAJHMAJSTER _KOMISIONIRANJE';

/**
 * DEV → „Play animation”: Id zlecenia, na którym testujesz animację paska %.
 */
export const ANIM_DEMO_ORDER_ID = 9039;

/** Równoległe requesty syncu % przy Odśwież (DEV, widok 1). */
export const SYNC_PRC_BATCH_SIZE = 8;

/* ── sessionStorage keys (zwykle nie zmieniać) ── */
export const STORAGE_KEY_VIEW = 'tajhmajster_view';
export const STORAGE_KEY_PROD_TEST = 'tajhmajster_prod_test';
export const STORAGE_KEY_DEV_MODE = 'tajhmajster_dev_mode';

/** Czy groupId ma dostawać rekordy Productions dla dzieci. */
export function isChildProductionsGroup(groupId: number): boolean {
  return (CHILD_PRODUCTIONS_GROUP_IDS as readonly number[]).includes(groupId);
}
