export type Lang = 'sl' | 'en' | 'pl';

export const LANGS: Array<{ code: Lang; label: string; flag: string; title: string }> = [
  { code: 'sl', label: 'SL', flag: '🇸🇮', title: 'Slovenščina' },
  { code: 'en', label: 'EN', flag: '🇬🇧', title: 'English' },
  { code: 'pl', label: 'PL', flag: '🇵🇱', title: 'Polski' },
];

const messages = {
  pl: {
    appSubtitle: 'Tajhmajster — monitor produkcji',
    lede:
      'Zlecenia grupowe z dziećmi oraz pojedyncze ze ścieżką produkcji. Numer i % wyróżnione; grupy — jasnoniebieska gwiazdka. Odświeżanie co 30 s.',
    searchPlaceholder: 'Szukaj: nr, id, opis…',
    stateFilter: 'Filtr stanu',
    stateRealization: 'Realizacja (4)',
    stateRealizationDone: 'Realizacja + zakończone',
    stateDone: 'Zakończone (5)',
    stateAll: 'Wszystkie (grupy + produkcja)',
    refresh: 'Odśwież',
    refreshing: 'Odświeżam…',
    logout: 'Wyloguj',
    ordersCount: '{n} zleceń',
    fetchError: 'Błąd pobierania',
    colOrderNo: 'Nr zamówienia',
    colDesc: 'Opis / klient',
    colState: 'Stan',
    colStatus: 'Status %',
    emptyOrders: 'Brak zleceń dla wybranego filtra.',
    stateRealizationShort: 'Realizacja',
    stateDoneShort: 'Zakończone',
    stateN: 'Stan {n}',
    groupOrder: 'Zlecenie grupowe',
    backList: '← Wstecz do listy',
    productionStatus: 'Status produkcji %',
    mother: 'matka',
    child: 'dziecko',
    productionSteps: 'Kroki produkcji',
    noSteps: 'Brak kroków ProductionsSockets dla tego zlecenia.',
    outsideAvg: ' · poza średnią %',
    loadingOrder: 'Ładowanie zlecenia…',
    noData: 'Brak danych',
    loginTitle: 'Logowanie do systemu',
    passwordPlaceholder: 'Hasło monitora',
    logIn: 'Zaloguj',
    loginHint:
      'Tajhmajster — monitor produkcji. Hasło = MONITOR_ACCESS_TOKEN z Netlify / pliku .env.',
  },
  en: {
    appSubtitle: 'Tajhmajster — production monitor',
    lede:
      'Group orders with children, plus standalone orders that have a production path. Order no. and % highlighted; groups — light blue star. Refreshes every 30 s.',
    searchPlaceholder: 'Search: no., id, description…',
    stateFilter: 'State filter',
    stateRealization: 'In progress (4)',
    stateRealizationDone: 'In progress + completed',
    stateDone: 'Completed (5)',
    stateAll: 'All (groups + production)',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    logout: 'Log out',
    ordersCount: '{n} orders',
    fetchError: 'Fetch error',
    colOrderNo: 'Order no.',
    colDesc: 'Description / client',
    colState: 'State',
    colStatus: 'Status %',
    emptyOrders: 'No orders for the selected filter.',
    stateRealizationShort: 'In progress',
    stateDoneShort: 'Completed',
    stateN: 'State {n}',
    groupOrder: 'Group order',
    backList: '← Back to list',
    productionStatus: 'Production status %',
    mother: 'parent',
    child: 'child',
    productionSteps: 'Production steps',
    noSteps: 'No ProductionsSockets steps for this order.',
    outsideAvg: ' · outside % average',
    loadingOrder: 'Loading order…',
    noData: 'No data',
    loginTitle: 'Login to the system',
    passwordPlaceholder: 'Monitor password',
    logIn: 'Log In',
    loginHint:
      'Tajhmajster — production monitor. Password = MONITOR_ACCESS_TOKEN from Netlify / .env.',
  },
  sl: {
    appSubtitle: 'Tajhmajster — monitor proizvodnje',
    lede:
      'Skupinska naročila z otroki ter posamezna s proizvodno potjo. Številka in % poudarjena; skupine — svetlo modra zvezdica. Osvežitev vsakih 30 s.',
    searchPlaceholder: 'Išči: št., id, opis…',
    stateFilter: 'Filter stanja',
    stateRealization: 'V teku (4)',
    stateRealizationDone: 'V teku + zaključeno',
    stateDone: 'Zaključeno (5)',
    stateAll: 'Vsa (skupine + proizvodnja)',
    refresh: 'Osveži',
    refreshing: 'Osvežujem…',
    logout: 'Odjava',
    ordersCount: '{n} naročil',
    fetchError: 'Napaka pri nalaganju',
    colOrderNo: 'Št. naročila',
    colDesc: 'Opis / stranka',
    colState: 'Stanje',
    colStatus: 'Status %',
    emptyOrders: 'Ni naročil za izbrani filter.',
    stateRealizationShort: 'V teku',
    stateDoneShort: 'Zaključeno',
    stateN: 'Stanje {n}',
    groupOrder: 'Skupinsko naročilo',
    backList: '← Nazaj na seznam',
    productionStatus: 'Status proizvodnje %',
    mother: 'mati',
    child: 'otrok',
    productionSteps: 'Koraki proizvodnje',
    noSteps: 'Ni korakov ProductionsSockets za to naročilo.',
    outsideAvg: ' · zunaj povprečja %',
    loadingOrder: 'Nalaganje naročila…',
    noData: 'Ni podatkov',
    loginTitle: 'Prijava v sistem',
    passwordPlaceholder: 'Geslo monitorja',
    logIn: 'Prijava',
    loginHint:
      'Tajhmajster — monitor proizvodnje. Geslo = MONITOR_ACCESS_TOKEN iz Netlify / .env.',
  },
} as const;

export type MessageKey = keyof (typeof messages)['pl'];

export function t(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = messages[lang][key] || messages.pl[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function localeFor(lang: Lang): string {
  if (lang === 'sl') return 'sl-SI';
  if (lang === 'en') return 'en-GB';
  return 'pl-PL';
}
