# Tajhmajster — osobny projekt: śledzenie produkcji (kolumna %)

> Ten plik skopiuj do drugiego projektu. Opisuje **co** wziąć z OptiCut, **jakie tabele** są potrzebne, **jak liczyć %** (w tym zlecenia grupowe matka/córki) oraz **jak to wystawić na Netlify + `.env`**.

**Źródło w tym repo:** `/production` — tabela kroków, kolumna **5 = `%`** (`ProductionPercent` / `Orders.ProductionPrc`).  
**Ostatnia aktualizacja:** 2026-11-06

---

## 0. Monitor produkcji (ten projekt Netlify) — ważne zmiany

Konfiguracja: `config/project.ts`. Detekcja przyrostów %: `src/lib/recentGains.ts`.

### 0.1 Adaptacyjne auto-odświeżanie

Po każdym fetchu lista jest porównywana ze snapshotem `ProductionPrc` (sessionStorage). Gdy **gdziekolwiek** % wzrośnie, zapisywany jest timestamp ostatniego przyrostu (`lastGainAt`).

| Stan (czas od ostatniego przyrostu %) | Interwał | Stała |
|---------------------------------------|----------|--------|
| Brak skanu w sesji / świeża aktywność | **20 s** | `AUTO_REFRESH_ACTIVE_MS` |
| Ostatni skan **&lt; 60 s** (częste skany) | **5 s** | `AUTO_REFRESH_HOT_MS` |
| 1–3 min bez skanu | **20 s** | `AUTO_REFRESH_ACTIVE_MS` |
| **3–12 min** bez skanu | **3 min** | `AUTO_REFRESH_MS` |
| **≥ 12 min** bez skanu | **8 min** | `AUTO_REFRESH_DEEP_IDLE_MS` |

Logika wyboru: `resolveAutoRefreshMs(lastGainAt)` w `config/project.ts`.  
Auto-refresh działa tylko w godzinach `AUTO_REFRESH_HOUR_FROM`…`AUTO_REFRESH_HOUR_TO` (domyślnie 6–18).  
Countdown w DEV pokazuje czas do kolejnego odświeżenia.

### 0.2 Shine (błysk na zielonym progressie)

| Zasada | Wartość |
|--------|---------|
| Kiedy widać | tylko zlecenia/podzlecenia z **świeżym przyrostem %** |
| Okno „świeżości” | `SHINE_RECENT_GAIN_MS` = **10 min** |
| Częstotliwość błysku | co **~10 s** (`SHINE_PERIOD_S`) — CSS `animation: shine 10s` |
| Gdzie | Widok 1 (wiersze `.monitor-row__fill`) oraz Widok 2 / board (`.pb-card__fill`) |

Helper: `hasRecentProductionGain(orderId, gainTimes)` — klasa `shine` dokładana tylko wtedy.

### 0.3 Inne (skrót)

- **Widok 1 grupy:** podzlecenia sortowane stałe **Id DESC** (bez animacji przetasowań po %).
- **Progress w wierszu:** prawa krawędź pod kątem **~8°** + fade/blur (`--progress-slant` w CSS).
- **Header:** chowa się płynnie w **0.5 s** (`.topbar-wrap`).
- **Widok 2 → Widok 1:** klik kafelka scrolluje wiersz na środek + żółty fokus ~3 s.
- **Po skanie (przyrost %):** auto widok 1, scroll do zlecenia/podzlecenia, **zielony flash 3 s**, animacja paska %.

---

## 1. Co chcesz przenieść (cel)

Śledzenie postępu produkcji jak na `/production`:

| Warstwa | Co widać |
|---------|----------|
| Krok (`ProductionsSockets`) | własny `%` w kolumnie 5 tabeli |
| Ścieżka (`Productions`) | `ProductionPercent` = średnia kroków z `IncludePercentSummary=1` |
| Zlecenie (`Orders`) | `ProductionPrc` (string `"66.67"`) — to samo % na liście zleceń |

**Zlecenia grupowe (wymóg):** matka i każde dziecko mają **osobny** status %.  
Przykład OK: matka `40%`, dzieci `80%`, `90%`, `10%`, `33%`.  
**Nie** uśredniaj dzieci do matki przy zapisie — każde `Orders.Id` ma własny `ProductionPrc`.

---

## 2. Model danych (tabele)

```
Materials (MatType=600)     → katalog ścieżek produkcji
MaterialsSockets            → szablon kroków ścieżki
        ↓ send to production
Productions                 → ścieżka na zleceniu (1 wiersz / ścieżka)
ProductionsSockets          → kroki runtime (% , TimeStart/Stop, ConfirmMode)
ProductionsSocketsCheckLists→ (opcjonalnie) checklista sztuk przy FullPartList
Orders                      → ProductionPrc, State, IsGroupOrder, IdParent
```

### 2.1 `Orders` — pola krytyczne dla % i grup

| Kolumna | Typ / sens |
|---------|------------|
| `Id` | PK zlecenia |
| `ProductionPrc` | `varchar` / string `"0.00"`…`"100.00"` — **status % zlecenia** |
| `State` | po wysłaniu na produkcję zwykle `4` |
| `IsGroupOrder` | `1` = matka grupy |
| `IdParent` | u dziecka = `Id` matki; u matki = `0` / `NULL` |

Powiązanie grupy:

- matka: `IsGroupOrder = 1`, `IdParent = 0`
- dziecko: `IdParent = <Id matki>`, `IsGroupOrder = 0`

### 2.2 `Productions` — ścieżka na zleceniu

Kluczowe: `Id`, `OrderId`, `IdMaterial`, `ProductionPercent`, `ProductionState`, `OperationsScheme`, `Symbol`, `IdUnique`.

### 2.3 `ProductionsSockets` — kroki (kolumna % w UI)

Kluczowe: `Id`, `OrderId`, `ProductionId`, `OrderIndex`, `Symbol`, `Description`,  
`ProductionPercent`, `IncludePercentSummary`, `ConfirmMode`, `CheckListType`,  
`TimeStart`, `TimeStop`, `UserIdStart` / `UserIdStop` / `UserIdCheck*`.

### 2.4 `ProductionsSocketsCheckLists` (opcjonalnie)

Brak kolumny `%` — postęp = `QuantityStamp / Quantity`. Po 100% serwer ustawia krok na 100%.

### 2.5 Formuła % zlecenia (musi być ta sama w FE i BE)

```
Orders.ProductionPrc =
  średnia(ProductionsSockets.ProductionPercent)
  WHERE IncludePercentSummary = 1
  (dla ProductionId / OrderId)
```

Implementacja FE: `utils/Functions/Production/functions/orderProductionPercent.ts`  
Implementacja BE: `persistOrderProductionPercent()` w `server/controllers/production.controller.ts`

---

## 3. Zlecenia grupowe — osobny % matki i dzieci

### Stan w OptiCut (dziś)

`persistOrderProductionPercent(orderId, productionId)` aktualizuje **tylko to jedno** `Orders.Id`.  
**Nie** przepisuje `%` matki ze średniej dzieci i odwrotnie.

Czyli architektura **już pozwala** na niezależne % — pod warunkiem że:

1. Każde zlecenie, które ma mieć własny pasek `%`, ma własne wiersze `Productions` + `ProductionsSockets`.
2. Potwierdzenia operatora idą na `socketId` **tego** zlecenia (`OrderId` socketa).
3. UI listy grupowej czyta `ProductionPrc` **per wiersz** (matka osobno, każde dziecko osobno) — bez agregacji przy zapisie.

### Co zrobić w projekcie Tajhmajster

| Zasada | Opis |
|--------|------|
| 1 zlecenie = 1 `ProductionPrc` | matka i dzieci to osobne rekordy `Orders` |
| Osobna ścieżka | jeśli matka ma produkcję „zbiorczą”, i tak ma własny `Productions` — nie dziedziczy % z dzieci |
| Lista grupy | filtr: `Id = motherId OR IdParent = motherId`; kolumna % z `item.ProductionPrc` |
| Opcjonalny widok | „średnia grupy” tylko jako **wyliczenie UI** (read-only), nigdy nie zapisuj tego do `Orders.ProductionPrc` matki |

Pseudo-UI:

```
[Matka #100]  ProductionPrc = 40%     ← własne kroki matki
  [Dziecko #101] 80%
  [Dziecko #102] 90%
  [Dziecko #103] 10%
  [Dziecko #104] 33%
```

---

## 4. Co skopiować (checklist plików)

Ścieżki względem rootu tego monorepo. Minimum = śledzenie % + operator. Maksimum = też „wyślij na produkcję”.

### 4.1 MUST — logika % i status kroków (bez UI)

```
frontend/src/utils/Functions/Production/
  index.ts
  functions/orderProductionPercent.ts
  functions/socketStatus.ts
  functions/authorization.ts          # jeśli zostawiasz role operatora
  constants/confirmModes.ts
  constants/statusLabels.ts
  types/socketScan.ts
  utils/formatPercent.ts
  utils/timestamps.ts
```

### 4.2 MUST — klient API produkcji

```
frontend/src/utils/Functions/SQL/Production/index.tsx
```

(wyciągnij z niego wywołania `fetch*`, `confirm*`, `sendOrderToProduction`, `syncOrderProductionPercent`; podmień `apiEndpoints` / `buildApiUrl` na config Tajhmajster)

### 4.3 MUST — typy

```
frontend/src/app/Interfaces/Productions.tsx
frontend/src/app/Interfaces/Interfaces.tsx   # ProductionsSocketInterface + fragment Orders (ProductionPrc, IsGroupOrder, IdParent)
# albo wyciąć tylko potrzebne interface'y do jednego pliku types/production.ts
```

### 4.4 MUST — UI operatora (odpowiednik `/production`)

```
frontend/src/app/(dashboard)/production/
  page.tsx                              # lub własny route
  ProductionPageClient.tsx
  hooks/useProductionPage.ts
  constants/production.constants.ts
  utils/dateHelpers.ts
  utils/sessionStorageHelpers.ts
  utils/checklistHelpers.ts
  components/ProductionAuthorizationBar.tsx
  components/ProductionOrderPanel.tsx
  components/ProductionStepsTable.tsx      # ← kolumna 5 = %
  components/ProductionSectionHeader.tsx
  components/ProductionOrderSwitchDialog.tsx
  components/ProductionFullPartListPopup.tsx  # tylko jeśli CheckListType=1
```

### 4.5 SHOULD — pasek % jak na liście zleceń

```
frontend/src/components/TableCellWidthPercentage.tsx
```

### 4.6 SHOULD — backend (Express) — bez tego FE nie zapisze % do MySQL

```
server/controllers/production.controller.ts
server/root/production.route.ts
server/controllers/orders.controller.ts   # przynajmniej updateOrderProductionPrc + fetch z IsGroupOrder/IdParent
server/root/orders.route.ts               # PUT /orders/:id/production-prc
```

Plus wspólne: pool MySQL, auth middleware (uproszczony w Tajhmajster), montowanie routerów w `app`.

### 4.7 OPTIONAL — „wyślij na produkcję” (tworzenie ścieżki)

```
frontend/src/app/(dashboard)/production/components/OrdersSendToProduction.tsx
frontend/src/utils/Functions/Production/functions/stepFilter.ts
frontend/src/utils/Functions/Production/functions/productionPathSocketFilter.ts
# + settings production-paths tylko jeśli Tajhmajster ma edytować szablony Materials MatType 600
```

### 4.8 NIE kopiuj na start (zbędne dla samego śledzenia %)

- cały dashboard OptiCut, configurator3D, OptiCutForm, planning Gantt
- i18n wszystkich języków (wystarczy hardcode PL albo mały plik kluczy `_ProductionPage`)
- wastes / OrdersOptimizeWastes hooki
- DevComponentHint / developMode (można wyciąć)

### 4.9 Zależności UI do podmiany / uproszczenia

Przy kopiowaniu `useProductionPage` / komponentów pojawią się importy — zamień stubami:

| Import OptiCut | W Tajhmajster |
|----------------|---------------|
| `useLanguage` / `TranslationDebugText` | stringi PL albo własny i18n |
| `useGlobalContext` (`developMode`, `user`) | własny auth context |
| `SimpleLoader`, `GlobalButton` | własne / HTML button |
| `Help_Page_QuestionMarkSign` | usuń |
| `DevComponentHint` | usuń |

---

## 5. API, które muszą działać

| Metoda | Endpoint | Po co |
|--------|----------|-------|
| GET | `/production/fetchProductions?OrderId=` | ścieżki zlecenia |
| GET | `/production/fetchProductionSockets?OrderId=` lub `?Id=` | kroki + % |
| POST | `/production/confirmSocketOperation` | potwierdzenie kroku → przelicza % |
| GET | `/production/fetchProductionSocketCheckLists` | FullPartList |
| POST | `/production/confirmCheckListItem` | sztuka → % kroku → % zlecenia |
| POST | `/production/sendOrderToProduction` | (opcjonalnie) start ścieżki |
| PUT | `/orders/:id/production-prc` | ręczny sync % |
| GET | lista zleceń z `ProductionPrc`, `IsGroupOrder`, `IdParent` | widok grupy |

Body confirm (skrót):

```json
{ "socketId": 453, "userId": 12, "firstScanAt": 1711364054000 }
```

Po sukcesie serwer: update socketa → `Productions.ProductionPercent` → `Orders.ProductionPrc`.

---

## 6. Netlify + `.env` (tak, env jest możliwe — ale z zastrzeżeniem)

### 6.1 Co Netlify umie

- **Environment variables** w Site settings → Environment variables (build + Functions).
- Hosting **frontendu** (statyczny / Next na Netlify).
- **Netlify Functions** (serverless) jako cienkie API.

### 6.2 Czego Netlify NIE lubi

Długowieczny Express + `mysql2` pool jak na VPS **nie** jest modelem Netlify.  
**Nie** wstawiaj haseł MySQL do `NEXT_PUBLIC_*` — wyciekną do przeglądarki.

### 6.3 Rekomendowany układ Tajhmajster

```
[Przeglądarka] → Netlify (frontend)
                      ↓ HTTPS
              [API Node]  ← tu MYSQL_* z .env / panelu hosta
                      ↓
                   MySQL
```

Opcje API:

| Opcja | Kiedy |
|-------|--------|
| **A. Osobny backend** (Railway / Render / Fly / VPS / Cyberfolks) | Najbliżej obecnego `server/` — **zalecane** |
| **B. Netlify Functions** opakowujące SQL | Tylko mały read/confirm; uważaj na limity połączeń MySQL na cold start |
| **C. Tylko frontend na Netlify + istniejące API OptiCut** | Najszybszy MVP: Tajhmajster woła `https://api.…/api/v1/production/...` |

### 6.4 Przykład `.env` (backend — NIE commitować)

```env
NODE_ENV=production

MYSQL_HOST=...
MYSQL_PORT=
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...

# albo wariant jak w OptiCut:
# MYSQL_CYBERFOLKS_HOST=
# MYSQL_CYBERFOLKS_USER=
# MYSQL_CYBERFOLKS_PASSWORD=
# MYSQL_CYBERFOLKS_DATABASE=
# MYSQL_CYBERFOLKS_PORT=

ACCESS_TOKEN=...
REFRESH_TOKEN=...
CORS_ALLOWED_ORIGINS=https://twoja-apka.netlify.app
```

Frontend (Netlify env):

```env
NEXT_PUBLIC_API_URL=https://twoje-api.example.com/api/v1
```

W panelu Netlify dodaj te same klucze → Redeploy.  
Lokalnie: plik `.env` / `.env.local` (w `.gitignore`).

### 6.5 MySQL z internetu

Host MySQL musi akceptować połączenia z IP backendu (whitelist / public host).  
Lokalny `localhost` z laptopa **nie** zadziała z Netlify Functions bez tunelu (np. PlanetScale / managed MySQL z publicznym endpointem).

---

## 7. Minimalna architektura aplikacji Tajhmajster

1. **Lista / grupa zleceń** — fetch orders; ikona grupy; % z `ProductionPrc` per wiersz.
2. **Ekran operatora** (kopia `/production`) — authorize → kod zlecenia/kroku → tabela z kolumną `%` → Confirm.
3. **Backend** — te same endpointy co wyżej; po confirm tylko `orderId` socketa dostaje nowy `ProductionPrc`.
4. **Reguła grupy** — dokumentuj w kodzie: `// NEVER overwrite mother ProductionPrc from children average`.

---

## 8. Kolejność wdrożenia (praktyczna)

1. Skopiuj sekcje **4.1–4.3** + uproszczony backend (**4.6**) podłączony do tej samej (lub kopii) bazy.
2. Odpal tylko odczyt: lista zleceń + `fetchProductionSockets` + wyświetlenie kolumny `%`.
3. Dopnij `confirmSocketOperation` i sprawdź w DB: `ProductionsSockets.ProductionPercent` oraz `Orders.ProductionPrc`.
4. Weź zlecenie grupowe: potwierdź krok u dziecka → % dziecka rośnie, % matki **bez zmian** (i odwrotnie).
5. Frontend na Netlify; API + `MYSQL_*` na hostingu z Node; CORS na domenę Netlify.
6. (Opcja) `OrdersSendToProduction` + `sendOrderToProduction`.

---

## 9. Szybki test akceptacyjny (grupa)

| Krok | Oczekiwane |
|------|------------|
| Matka `#M` ma własne sockety; dzieci `#D1…Dn` własne | osobne `Productions` per Id |
| Confirm na `#D1` → 80% | `Orders.ProductionPrc` dla `#D1` = 80; `#M` bez zmiany |
| Confirm ścieżki matki → 40% | `#M` = 40; dzieci nietknięte |
| Lista grupy | widać 40 / 80 / 90 / 10 / 33 niezależnie |

---

## 10. Referencje w OptiCut (czytaj przy wątpliwościach)

| Temat | Plik |
|-------|------|
| Pełny przebieg produkcji | `production/page_production_readme.md` |
| Popup „wyślij na produkcję” | `production/components/OrdersSendToProduction_readme.md` |
| Formuła % | `utils/Functions/Production/functions/orderProductionPercent.ts` |
| Persist % po skanie | `server/controllers/production.controller.ts` → `persistOrderProductionPercent` |
| Kolumna % na liście zleceń | `orders/page.tsx` + `TableCellWidthPercentage` |
| Grupy matka/córki | `Orders.IsGroupOrder` / `Orders.IdParent`; home feature V 2.091 |

---

## 11. TL;DR — co wkleić do drugiego repo

1. Skopiuj ten README.  
2. Skopiuj foldery z checklisty **§4.1–4.4 + 4.6**.  
3. Podłącz MySQL przez **backend** (nie z przeglądarki); na Netlify tylko `NEXT_PUBLIC_API_URL`.  
4. Trzymaj **osobny** `ProductionPrc` dla matki i każdego dziecka — kolumna 5 / pasek % czyta zawsze lokalne pole zlecenia.
