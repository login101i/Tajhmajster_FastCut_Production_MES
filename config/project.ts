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
export const APP_VERSION = 'V.1.06';

/** Auto-odświeżanie listy (ms). 30_000 = 30 s, 60_000 = 60 s. */
export const AUTO_REFRESH_MS = 60_000;

/** Stan zlecenia = „na produkcji” / Realizacja. */
export const ORDER_STATE_ON_PRODUCTION = 4;

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
