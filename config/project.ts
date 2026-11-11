/**
 * =============================================================================
 *  Tajhmajster Production Tracker — konfiguracja projektu
 * =============================================================================
 *  Zmieniaj wartości TUTAJ. Po zapisie odśwież przeglądarkę.
 *  Dla zmian w API (Netlify Functions) zrestartuj `npm run dev` / local-api.
 *
 *  Reguła % (Id >= MIN_PRODUCTION_ORDER_ID, State = na produkcji):
 *  - Zlecenie GRUPOWE (IsGroupOrder=1): widok 1 syncuje ProductionPrc DZIECI
 *    z checklisty matki (QuantityStamp/Quantity) — Odśwież + auto-refresh,
 *    bez trybu DEV. Matki nie nadpisujemy.
 *  - Zlecenie POJEDYNCZE (np. 8727): NIE syncujemy — OptiCut sam ustawia
 *    Orders.ProductionPrc; monitor tylko odczytuje wartość przy Odśwież.
 * =============================================================================
 */

/** Wersja UI (prawy górny róg topbara). */
export const APP_VERSION = 'V.2.1';

/**
 * Szybki sygnał skanu (Netlify + MySQL):
 * lekki GET /api/production-last-change co LAST_CHANGE_POLL_MS.
 * Pełny sync tylko gdy `version` się zmieni.
 *
 * Backup pełnego odświeżenia (gdy last-change nic nie złapie):
 * adaptacyjnie 3–8 min wg ostatniego przyrostu %.
 */
/** Poll fingerprint checklisty / DateMod (ms). */
export const LAST_CHANGE_POLL_MS = 1_500;
/** Backup pełnego odświeżenia gdy jest aktywność %. */
export const AUTO_REFRESH_MS = 3 * 60_000;
/** Backup przy długim bezruchu. */
export const AUTO_REFRESH_DEEP_IDLE_MS = 8 * 60_000;
/** Po tylu ms bez przyrostu % → deep idle backup. */
export const AUTO_REFRESH_DEEP_IDLE_AFTER_MS = 12 * 60_000;

/** Alias historyczny — countdown / stare UI. */
export const AUTO_REFRESH_ACTIVE_MS = LAST_CHANGE_POLL_MS;
export const AUTO_REFRESH_HOT_MS = LAST_CHANGE_POLL_MS;
export const AUTO_REFRESH_HOT_FOR_MS = 60_000;
export const AUTO_REFRESH_IDLE_TO_DEFAULT_MS = AUTO_REFRESH_DEEP_IDLE_AFTER_MS;

/** Backup full-refresh interval (last-change handles near-instant scans). */
export function resolveAutoRefreshMs(
  lastGainAt: number | null,
  now = Date.now(),
): number {
  if (lastGainAt == null) return AUTO_REFRESH_MS;
  const idle = now - lastGainAt;
  if (idle < AUTO_REFRESH_DEEP_IDLE_AFTER_MS) return AUTO_REFRESH_MS;
  return AUTO_REFRESH_DEEP_IDLE_MS;
}

/**
 * Shine (błysk na pasku %): tylko zlecenia z przyrostem w ostatnich X ms.
 * Animacja CSS: jeden przebieg co ~SHINE_PERIOD_MS.
 */
export const SHINE_RECENT_GAIN_MS = 10 * 60_000;
/** Okres pętli shine (s) — jeden przebłysk co 10 s. */
export const SHINE_PERIOD_S = 10;

/**
 * Po wykryciu przyrostu % (skan formatki): niebieski flash wiersza + scroll.
 * Puls trwa SCAN_FOCUS_PULSE_MS (3 s), potem zanikanie SCAN_FOCUS_FADE_MS.
 */
export const SCAN_FOCUS_PULSE_MS = 3_000;
export const SCAN_FOCUS_FADE_MS = 1_000;

/**
 * Podzlecenie: przyrost % na pasku (odcinek old→new) ciemniejszym kolorem.
 */
export const CHILD_GAIN_SEGMENT_MS = 2_000;

/** Ukryj header po braku ruchu: telefon (ms). */
export const HEADER_HIDE_MS_PHONE = 3 * 60_000;

/** Ukryj header po braku ruchu: tablet / desktop (ms). */
export const HEADER_HIDE_MS_WIDE = 3 * 60_000;

/**
 * Pokazuj ukryty header po ruchu myszy dopiero po tylu ms ciągłej aktywności.
 * Krótki „przelot” przez ekran nie odsłania navbara.
 */
export const HEADER_SHOW_DELAY_MS = 1_000;
/** Max przerwa między eventami mousemove, by uznać ruch za ciągły. */
export const HEADER_SHOW_MOVE_GAP_MS = 280;

/** Breakpoint „telefon” dla layoutu headera / hide (px). */
export const HEADER_PHONE_MAX_PX = 800;

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
/** Po logowaniu: potwierdzenie filtra State 4 (session). */
export const STORAGE_KEY_FILTER_STATE4_ACK = 'tajhmajster_filter_state4_ack';

/** Czy groupId ma dostawać rekordy Productions dla dzieci. */
export function isChildProductionsGroup(groupId: number): boolean {
  return (CHILD_PRODUCTIONS_GROUP_IDS as readonly number[]).includes(groupId);
}
