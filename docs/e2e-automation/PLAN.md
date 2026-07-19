# DBExec — Real-Browser (Playwright) End-to-End Automation Plan

> **Status:** PLAN ONLY. Nothing here has been executed. This document is the
> step-by-step script a later executor follows **after** the two in-flight
> feature waves land and a running stack is confirmed. It creates **real data**
> on the user's local machine and inside the **GauravOrg** organisation — see
> **§7 Risks** and get the user's explicit go-ahead before running.
>
> Companion file: [`sample-clinical-data.sql`](./sample-clinical-data.sql)
> (already written — do not regenerate).

---

## 0. Scope, ports, and the one hard constraint

**The scenario (in order):**

1. Seed a synthetic clinical warehouse into local Postgres (`clinical` schema in the `DbExec` database). *(raw SQL — the only non-UI step)*
2. Log in to the DBExec web UI.
3. Create a **datasource** pointing at that Postgres.
4. Create a **DB-access role/user** (live Postgres role) + a **query-runner connection**.
5. Create a **SQL dataset** on the six-table join, then add several **calculated fields** (both engines).
6. Build a **maximal analysis** — 6 tabs, 18–22 visuals across chart families, time-intelligence, Top-N, table-calc, reference line, a geo map, KPI big-numbers, cross-filter + drill — then **Save** (draft-until-Save) and **reload-verify**.
7. Capture **screenshot evidence** at every milestone and assert data actually rendered.

**Confirmed environment (dev, verified against the repos):**

| Piece | URL / DSN | Start command | Notes |
|---|---|---|---|
| Frontend (Angular 18 + PrimeNG) | `http://localhost:4200` | `npm start` (`ng serve`) in `DBExec-UI` | `package.json` → `"start": "ng serve"`. `environment.apiServer` dev = `http://localhost:3000/api/v1`. |
| Backend (Express + TypeORM) | `http://localhost:3000/api/v1` | `npm run dev` in `DBExec-API` | `.env` → `SERVER_PORT=3000`. Health route `GET /health`. |
| Warehouse Postgres (data source) | `localhost:5432` db `DbExec` user `postgres` pw `<DB_PASSWORD>` | user-managed (Postgres.app / Docker / brew) | Same server + db-name as the app's master DB — see the constraint below. |

> **Ignore ports 8755 / 9058** — those are the prod/desktop build ports named
> in the original brief. Dev (what the executor runs) is **4200 / 3000**.

**Login:** organisation **`GauravOrg`**, username **`administrator`**, password **`Pass@1234`**.

### The one hard constraint (read before running the SQL)

The DBExec **application's own master database is *also* named `DbExec`** on the
same `localhost:5432` server (`DBExec-API/.env → DB_NAME=DbExec`). Its master
tables live in the **`public`** schema; the **GauravOrg** per-org tables live in
a **`dbexec`** schema (org onboarding "creates dbexec schema"). Therefore the
sample data **must not** go in `public` or `dbexec`.

**Resolution (already baked into the SQL):** all six clinical tables + the
`encounter_analytics` view are created in a dedicated **`clinical`** schema.
It is physically isolated from both app schemas. Cleanup is a single
`DROP SCHEMA clinical CASCADE`. The datasource we create targets database
`DbExec`; the dataset is scoped to the `clinical` schema.

---

## 1. Preconditions & how to bring the stack up

The executor runs on the user's Mac. Foreground `sleep` is blocked in the
harness, so use background start + a readiness poll, and be prepared to ask the
user to run a `! <cmd>` if a service must be launched interactively.

### 1.1 Check what's already up

```bash
# Backend health (expect HTTP 200 + {"message": "...ok..."} )
curl -fsS http://localhost:3000/health && echo "  <- BE up"

# Frontend dev server (expect 200 and an Angular index.html)
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:4200/

# Warehouse Postgres reachable + our creds valid
PGPASSWORD=<DB_PASSWORD> psql -h localhost -p 5432 -U postgres -d DbExec -tAc "select 1" \
  && echo "  <- Postgres up + creds OK"
```

### 1.2 Start anything that's down

- **Backend:** in `DBExec-API`, `npm run dev` (nodemon + ts-node). It boots on
  `:3000`. Do **not** pass `DB_SYNC=true` / `DB_CLEAR=true` — those mutate the
  app DB. Wait for readiness by polling `GET /health` until 200.
- **Frontend:** in `DBExec-UI`, `npm start`. First compile can take 30–90 s.
  Poll `http://localhost:4200/` until 200, then additionally wait for Angular
  to bootstrap in-browser (see harness `waitForAngular`, §6.3).
- **Postgres:** user-managed. If down, ask the user to start it
  (`! pg_ctl start` / open Postgres.app / `! docker start <pg>`), then re-poll.

Readiness poll example (backgroundable, no foreground sleep):

```bash
# Wait up to ~2 min for BE, then FE
until curl -fsS http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done; echo "BE ready"
until curl -fsS http://localhost:4200/ >/dev/null 2>&1; do sleep 2; done; echo "FE ready"
```

### 1.3 Seed the warehouse (Step 1 of the scenario)

The SQL is idempotent (`DROP SCHEMA IF EXISTS clinical CASCADE` at the top).
Run it exactly as documented in the file header:

```bash
PGPASSWORD=<DB_PASSWORD> psql -h localhost -p 5432 -U postgres -d DbExec \
  -v ON_ERROR_STOP=1 -f docs/e2e-automation/sample-clinical-data.sql
```

**Assert the seed worked** — the script prints two summaries; the executor must
eyeball them:

- Row counts: `facilities 10, providers 50, patients 500, encounters 5000`,
  `diagnoses ~10k`, `procedures ~5k`.
- Financial summary: `total_billed` in the multi-**million** range,
  `collection_rate_pct` ~55–75 %, encounter dates `2023-01-01 … 2025-12-31`.

If counts are wrong or the summaries error, STOP and fix the SQL before touching
the UI — every downstream assertion depends on this data.

### 1.4 Playwright install & launch

- Install once (in `DBExec-UI` or a sibling e2e workspace):
  `npm i -D @playwright/test && npx playwright install chromium`.
- **Run headless** (this is a remote/automated context) with the video +
  screenshot + trace artifacts on. The build uses **Monaco** (dataset SQL
  editor and the calc-field editor) and **ECharts + echarts-gl** (charts),
  both loaded locally by the bundle — headless Chromium renders them fine, but
  see §7 for the Monaco/CDN caveat.
- One project, Chromium, `baseURL: http://localhost:4200`, `viewport
  1920×1080`, `actionTimeout 15000`, `navigationTimeout 30000`,
  `trace: 'on'`, `video: 'on'`, `screenshot: 'only-on-failure'` (we also take
  explicit milestone screenshots — §6.2).

---

## 2. How the shared UI controls work (selector cookbook)

Read from the actual templates. Every screen is built from `app-custom-*`
components that wrap PrimeNG. These four patterns cover ~95 % of interactions.

### 2.1 `app-custom-input` → renders `input[pInputText]` (or `textarea[pInputTextarea]`)
`custom-input.component.html` puts the real `<input>` inside `.form-field`, next
to a `<label>`. It sets `[attr.id]` from `inputId` when provided.

- **By form control:** `app-custom-input[formcontrolname="name"] input`
- **By stable id (login):** `#auth-account`, `#auth-username`, `#auth-password`
- **By label (most resilient):** locate the `.form-field` whose `label` text
  matches, then its `input`/`textarea`.
- **Fill:** `locator.fill(value)` then (for validators that fire on blur)
  `locator.blur()`. Password fields carry a `.password-toggle-icon` you can
  click to reveal for a screenshot.

### 2.2 `app-custom-dropdown` → renders `p-dropdown` with `appendTo="body"`
`custom-dropdown.component.html`: the trigger is `.p-dropdown`; clicking it opens
an **overlay appended to `document.body`** (`.p-dropdown-panel`). Options are
`.p-dropdown-item`; the filter box is `input.p-dropdown-filter`.

**Interaction recipe (works for both static `[options]` and `serverMode`+`fetcher`):**
1. Click the trigger: `page.locator('<scope> .p-dropdown').click()`.
2. Wait for the panel: `page.locator('.p-dropdown-panel').waitFor()`.
3. If filterable, type into `.p-dropdown-filter` to narrow (server-mode debounces a fetch — wait for `.p-dropdown-item` to refresh).
4. Click the option by text: `page.locator('.p-dropdown-item', { hasText: 'PostgreSQL' }).click()`.
5. Assert the trigger label updated.

> Because the panel is appended to `<body>`, **never** scope the option locator
> under the field — scope it under `.p-dropdown-panel` (or page root).

### 2.3 `app-custom-multiselect` → `p-multiSelect`, also `appendTo="body"`
Panel `.p-multiselect-panel`, items `.p-multiselect-item`, filter
`.p-multiselect-filter`. Used for the analysis **drill dimensions**. Click each
item; close by clicking the trigger again or pressing `Escape`.

### 2.4 `app-custom-toggle` / `app-custom-calendar` / `app-custom-number`
- Toggle: click the rendered switch inside the `app-custom-toggle` host.
- Calendar: `appendTo="body"`; click the input, panel is `.p-datepicker`, pick a day cell, or use the button bar.
- Number: PrimeNG `inputNumber`; the real input is `input.p-inputnumber-input` (or spinner buttons `.p-inputnumber-button`).

### 2.5 Confirmations & dialogs
- The app's confirm/save popups use the **`.confirmation-popup`** overlay
  pattern (backdrop + `.popup-content` + `.popup-header` + `.popup-actions`),
  **not** `p-dialog` — except the **calc-field dialog** and the **filter
  dialog**, which are real `p-dialog` (`.p-dialog`, styleClass
  `add-custom-field-dialog`). Buttons inside carry visible text (`| translate`
  keys resolved to English), so prefer `getByRole('button', { name: 'Save' })`
  / `hasText`.
- Toasts (success/error) render via PrimeNG `p-toast` (`.p-toast-message`,
  `.p-toast-message-success`). Use them as success assertions where a redirect
  doesn't already prove it.

### 2.6 SPA readiness
- After any `page.goto`, run `waitForAngular` (§6.3) — waits for
  `window.getAllAngularTestabilities()` to be stable — plus a
  `networkidle`-ish wait for the feature's first data call.
- Lists use `app-custom-table` (`<tr>/<td>`, first column `.ct-frozen`) with
  **infinite scroll** (batch 50) — locate a row by its visible text
  (`page.locator('tr', { hasText: '<name>' })`), don't rely on nth-child.

---

## 3. Per-UI-step script (real routes, selectors, assertions)

Every step: **navigate → act → assert → screenshot**. Names below use a run
suffix `E2E-<timestamp>` so re-runs don't clash on unique-name validators.

### Step 2 — Log in
- **Route:** `/login` (`AUTH.LOGIN`). Component `app-login`, form `#auth-form`.
- **Act:**
  - `#auth-account`.fill(`GauravOrg`)
  - `#auth-username`.fill(`administrator`)
  - `#auth-password`.fill(`Pass@1234`)
  - Click submit `button.auth-form__submit` (label "Sign in").
- **Flow:** on success the app routes to **`/relay`** (phase-2 session load) then
  lands on the role home under `/app/...`. **Assert:** URL no longer `/login`,
  URL matches `/app` or `/relay`→`/app`, and the app shell/sidebar is present.
  A wrong login shows `.auth-form__error` — assert it is **absent**.
- **Auth token:** the interceptor stores the JWT and sends it as the
  **`x-auth-token`** header (not `Authorization: Bearer`). We don't touch it;
  the browser session carries it. (If a later step wants a direct API assert,
  read the token from `localStorage`/storage the way `http-request.interceptor`
  does.)
- **Evidence:** `01-login.png` (post-login home).

### Step 3 — Create a datasource (Postgres → DbExec)
- **Route:** list `/app/datasources` (`DATASOURCE.LIST`); create `/app/datasources/new` (`DATASOURCE.ADD`). Navigate straight to `/app/datasources/new`.
- **Component:** `app-add-datasource`. **Fields (form controls):**
  - `name` → `E2E Clinical PG <suffix>`
  - `description` → `E2E synthetic clinical warehouse`
  - `type` → dropdown, pick **PostgreSQL** (value `postgres`; auto-fills port 5432)
  - `host` → `localhost`
  - `port` → `5432` (pre-filled on type=postgres; overwrite to be safe)
  - `database` → `DbExec`
  - `username` → `postgres`
  - `password` → `<DB_PASSWORD>`
- **MANDATORY test-connection gate:** Save is disabled until
  `connectionTested === true`. Click **`.test-connection-btn`** ("Test
  Connection"), then **wait for** `.connection-status.success` ("Connection
  successful"). Only then is `.btn-save` enabled.
- **Save:** click `.btn-save` (label "Save"). On success it navigates to
  `/app/datasources`. **Assert:** URL is the list AND a row with the datasource
  name is present (`tr:has-text("E2E Clinical PG …")`).
- **Capture the id:** open the row (view) — URL becomes `/app/datasources/<id>`
  — record `<id>` for later steps / DB-row verification.
- **Evidence:** `02-datasource-created.png` (list row + success toast).

### Step 4a — Create a DB-access role/user (live Postgres role)
- **Route:** list `/app/db-roles` (`DB_ACCESS.ROLES_LIST`); create
  `/app/db-roles/new` (`DB_ACCESS.roleNew()`). Component `app-add-db-role`.
- **Datasource picker first:** the form body is hidden until a datasource is
  chosen. Use the `app-datasource-picker` (a server-mode `app-custom-dropdown`,
  `appendTo="body"`, filter by name) → pick the datasource from Step 3.
- **Fill (create-mode = "From scratch", the default tab):**
  - `name` → `e2e_clinical_reader` (must match `^[A-Za-z_][A-Za-z0-9_$]*$`)
  - **Can log in** toggle → **ON** (default) → reveals Password + Connection
    Limit + Valid Until + login attributes.
  - `password` → a strong value, e.g. `E2eClinical#2026`
  - Leave attributes default (INHERIT on; SUPERUSER/BYPASSRLS off — avoids the
    superuser-confirm branch).
- **Save:** click the **Create** button `.btn-save` (label "Create"), disabled
  until `datasourceId && roleForm.valid`. On success it navigates back to
  `/app/db-roles`. **Assert:** the roles list now contains `e2e_clinical_reader`.
- **What this really does:** issues a live `CREATE ROLE e2e_clinical_reader
  LOGIN PASSWORD …` against the warehouse Postgres (stateless — no DBExec
  mapping table). This role is a **cleanup item** (§7).
- **Evidence:** `03a-db-role-created.png`.

### Step 4b — Create a query-runner connection
- **Route:** list `/app/query-runner/connections` (`QUERY_RUNNER.CONNECTIONS_LIST`); create `/app/query-runner/connections/new` (`connectionNew()`). Component `app-add-connection`.
- **Fill:**
  - `name` → `E2E Clinical Conn <suffix>`
  - `datasourceId` → server-mode dropdown, pick the Step-3 datasource by name
  - `username` → `postgres` (or the `e2e_clinical_reader` role from 4a — either
    is valid; `postgres` guarantees read access for previews)
  - `password` → matching password
- **Save:** `.btn-save` (label "Create"), disabled while `form.invalid`. On
  success navigates to the connections list. **Assert:** connection row present.
- **Note:** connections are **owner-private** (scoped to `administrator`) — the
  list only shows this user's connections, which is fine here.
- **Evidence:** `03b-connection-created.png`.

### Step 5 — Create a SQL dataset on the six-table join
- **Entry:** list `/app/datasets` (`DATASET.LIST`), component `app-list-dataset`.
  Click the toolbar **New** button → opens `app-dataset-picker-dialog`
  (`.ds-picker-popup`).
  - Datasource dropdown (server-mode) → pick the Step-3 datasource.
  - **Schema** dropdown (optional) → pick **`clinical`** (scopes the editor +
    intellisense to our schema). Leaving it blank also works but scoping is
    cleaner.
  - Click **Continue** (`.btn-save`, disabled until a datasource is chosen).
- **Editor route:** navigates to `/app/datasets/new?datasourceId=<id>&schema=clinical`.
  Component `app-add-dataset` — a **Monaco** SQL editor
  (`#sql-editor-container`) with a schema explorer sidebar.
- **Type the SQL** (the join — equivalent to `clinical.encounter_analytics`).
  Set the Monaco value directly (see §6.4 `setMonacoValue`) rather than typing
  char-by-char:

  ```sql
  SELECT
    e.id                    AS encounter_id,
    e.encounter_date,
    e.encounter_type,
    e.department,
    e.length_of_stay_days,
    e.total_charge,
    e.amount_paid,
    p.mrn,
    p.birth_date,
    p.sex,
    p.state                 AS patient_state,
    pr.name                 AS provider_name,
    pr.specialty,
    f.name                  AS facility_name,
    f.state                 AS facility_state,
    f.region,
    f.lat                   AS facility_lat,
    f.lon                   AS facility_lon,
    dx.icd10_code           AS primary_icd10,
    dx.description          AS primary_diagnosis,
    dx.is_chronic
  FROM clinical.encounters e
  JOIN clinical.patients   p  ON p.id  = e.patient_id
  JOIN clinical.providers  pr ON pr.id = e.provider_id
  JOIN clinical.facilities f  ON f.id  = e.facility_id
  LEFT JOIN LATERAL (
    SELECT icd10_code, description, is_chronic
    FROM clinical.diagnoses d
    WHERE d.encounter_id = e.id ORDER BY d.id LIMIT 1
  ) dx ON true
  ```

  > (You may instead do `SELECT * FROM clinical.encounter_analytics` — the view
  > the SQL file created — but the explicit join exercises the editor + the
  > BE's field-typing more thoroughly. Prefer the explicit join.)

- **Preview:** click **Run** (`.btn-run`, label "Run"). **Assert** the results
  sheet (`.results-sheet`) opens with a row-count chip (`~5000 row(s)`) and a
  populated `p-table` (columns include `total_charge`, `provider_name`,
  `region`, …). Assert it is **not** an error card (`.results-error-card` absent)
  and **not** empty (`.results-empty-card` absent).
- **Save:** click **Save as Dataset** (`.btn-dataset`, the toolbar save icon) →
  opens `app-save-dataset-dialog` (`.confirmation-popup`).
  - `name` → `E2E Clinical Encounters <suffix>`
  - `description` → `Encounters joined to patients, providers, facilities, diagnoses`
  - leave cache toggle default.
  - Click **Save Dataset** (`.btn-confirm`). On success navigates to the dataset
    detail/list. **Assert** a toast + the dataset appears in `/app/datasets`.
- **Open the dataset detail** (`/app/datasets/<datasetId>`, `app-view-dataset`) —
  record `<datasetId>`.
- **Evidence:** `04-dataset-preview.png` (results grid with real rows),
  `05-dataset-saved.png` (detail page listing typed fields).

### Step 5b — Add calculated fields (BOTH engines)
Calc fields are added from **`view-dataset`** via the **Add custom field** action
(the `add-custom-field-dialog`, a `p-dialog` styleClass
`add-custom-field-dialog`). The dialog has: left rail = dataset fields
(reference chips), centre = display-name input + **Data type** dropdown +
**Monaco formula editor** (`#formula-editor-container`), right rail = function
reference (137-fn library). Footer: **Validate** (pre-flight) + **Add Field**.

Add each field below (open dialog → set name → set data type → set formula via
`setMonacoValue` → click **Validate**, assert `.acf-validation.is-valid` → click
**Add Field**, assert it appears in the field list). The dialog documents the
dual concept: a field's **display name is also its `{brace}` handle**.

The two engines (per BE `calculated-fields` module):
- **SQL `[bracket]` expression** — references columns as `[col]`, compiled to SQL.
- **JS `{brace}` FormulaCompiler** — references fields as `{Field Name}`, 137
  functions (e.g. `concat`, `if`, `year`, `datediff`).

Fields to create (mix of both engines, incl. a big-number measure and a
CASE/`if` bucket):

| # | Display name | Data type | Engine | Formula |
|---|---|---|---|---|
| 1 | `Collection Rate` | Number/Measure | SQL bracket | `[amount_paid] / NULLIF([total_charge], 0)` |
| 2 | `Charge Per Day` | Number/Measure | SQL bracket | `[total_charge] / NULLIF([length_of_stay_days], 0)` |
| 3 | `Patient Age` | Number/Measure | JS brace | `datediff('year', {birth_date}, now())` *(fallback: `year(now()) - year({birth_date})`)* |
| 4 | `Provider @ Facility` | Text/Dimension | JS brace | `concat({provider_name}, ' @ ', {facility_name})` |
| 5 | `Severity Bucket` | Text/Dimension | JS brace | `if({length_of_stay_days} >= 10, 'High', if({length_of_stay_days} >= 4, 'Medium', 'Low'))` |
| 6 | `Total Charge (Big $)` | Number/Measure | SQL bracket | `[total_charge] * 1.0` *(a passthrough measure so a KPI SUM lands in the millions)* |

> Exact function names/spelling for the JS engine (`datediff`, `concat`, `if`,
> `year`, `now`) should be confirmed against the function-reference rail inside
> the dialog (searchable) — the compiler validates on **Validate**; if a name
> mismatches, the rail shows the correct usage. The bracket-engine formulas are
> plain SQL and will validate directly. If `datediff`/`year` aren't present,
> compute age in the SQL dataset instead (`AGE(birth_date)` → years) and drop
> field 3 — but prefer proving the JS engine.

- **Assert per field:** `.acf-validation.is-valid` after Validate; the new field
  appears in the dataset's field list (custom fields flagged, `field.type === 2`).
- **Evidence:** `06-calc-field-collection-rate.png` (valid SQL-bracket formula),
  `07-calc-field-severity-js.png` (valid JS-brace formula),
  `08-dataset-fields-with-calc.png` (dataset detail showing all 6 calc fields).

### Step 6 — Build the MAXIMAL analysis

**Create the analysis** from the dataset. On the dataset detail/list
(`app-view-dataset` / `app-list-dataset`), use **Use as Analysis** →
create-analysis dialog (name/description) →
`analysesService.addAnalyses({ name, description, datasetId, datasource })` →
navigates to `/app/analyses`. Then open it in **edit** mode.

- Name → `E2E Clinical Command Center <suffix>`, description → any.
- After create you land on `/app/analyses` (list). Find the row by name
  (`onEdit` → `/app/analyses/<id>/edit`) and open **Edit** to reach
  `app-edit-analyses`. Record `<analysisId>`.

**The authoring model (verified from `edit-analyses` + `visuals-chart-sidebar` +
`visual-config-sidebar`):**

- On open, the analysis **auto-loads the dataset** — the toolbar status dot
  (`.a-status__dot--loaded`) shows `N rows loaded`. **Wait for `--loaded`**
  before adding visuals (Add Visual is disabled until data is loaded).
- **Tabs strip** at the bottom (`.analysis-tab-strip`). Add a tab:
  click `.analysis-tab-add` (opens `#addTabOp` overlay `.add-tab-panel`) →
  optionally pick a type chip → type name in `.add-tab-name` → click
  `.add-tab-btn.primary`. Select a tab by clicking `.analysis-tab` (text match).
- **Add a visual:** in the right **Visuals** panel (toggle via the
  `.a-segment__btn` "Visuals"), click **Add Visual** (`.add-visual-button`,
  disabled until data loaded). A new `.visual-box` appears on the canvas,
  auto-focused; the sidebar shows the **chart-type grid**.
- **Pick chart type:** search in the grid search box, click a `.chart-type-card`
  (by chart name). The sidebar switches to **Data Mapping** (role slots).
- **Map fields:** click a role slot `.axis-slot` (it activates,
  `activeAxisSelection` set → the **Fields** panel enters `.selection-mode`),
  then click a `.field-card` (by `.field-name` text) in the left Fields panel.
  Scalar roles auto-close; multi roles (valueColumns/indicators/dimensions) stay
  open and accept more clicks (or use the "+ Add Column" chip).
  - **Typed-encoding guard:** a text field dropped on a numeric role (e.g. yAxis)
    is **rejected with a warning**. Always put dimensions (category/region/date)
    on category/x roles and measures on value/y roles.
- **Configure (per visual)** in the **visual-config-sidebar** (`.config-section`s):
  - **Aggregation** (`ANALYSES.DATA_SECTION`): Dimension dropdown +
    Measure dropdown + **Aggregate** dropdown (Sum/Average/Count/Min/Max — loaded
    from reference-data). Use SUM/AVG as appropriate.
  - **Top-N** (`isCapable('topN')`, in `DATA_FORMAT_SECTION`): **Limit** dropdown
    (Top/Bottom N) + **Limit count** number + optional "Other" bucket toggle.
  - **Analytics** (`ANALYTICS.SECTION`, cartesian charts):
    - **Trend** dropdown (moving average / forecast / poly).
    - **Quick calc** dropdown = the **table-calc** (`running_total`,
      `percent_of_total`, `difference`, `rank`, …). ← table-calc requirement.
    - **Compare** dropdown = **time-intelligence** (`previous_period` = MoM-style,
      `same_period_last_year` = YoY) + a **Compare date column** dropdown
      (pick `encounter_date`). ← time-intelligence requirement.
  - **Reference line** (`referenceLines`, gated by capability): **Add reference
    line** → pick type (min/max/mean/median/custom) + style. ← reference-line
    requirement.
  - **Interactions** (in the chart sidebar): **Cross-filter** toggle
    (`ANALYSES.CROSSFILTER_ENABLE`) + **Drill dimensions** multiselect
    (`ANALYSES.DRILL_DIMENSIONS`). ← cross-filter + drill requirements.
- **Rename a visual** (optional): edit `.visual-box` title.

**Chart-role contract (from `CHART_ROLES` — which slots each type needs):**
most cartesian charts require `xAxis`+`yAxis`; multi-series add optional
`valueColumns`; pies require `xAxis`(category)+`yAxis`(value); `number-card`/
`kpi-delta` require only `yAxis`; scatter/bubble need `xAxis`+`yAxis`(+`zAxis`
for bubble size); `world-map`/`choropleth` need `xAxis`=region-name +
`yAxis`=value; `point-map`/`bubble-map` need `lng`+`lat`; `table` has no slots
(click fields to toggle columns).

#### Tab-by-tab, visual-by-visual build sequence (18–22 visuals)

> Add all six tabs first, then build each. Fields available: dataset columns
> (`region`, `facility_state`, `specialty`, `department`, `encounter_type`,
> `encounter_date`, `total_charge`, `amount_paid`, `length_of_stay_days`,
> `facility_lat`, `facility_lon`, `primary_icd10`, `is_chronic`, `sex`, `mrn`,
> `provider_name`, `facility_name`) + calc fields (`Collection Rate`,
> `Charge Per Day`, `Patient Age`, `Provider @ Facility`, `Severity Bucket`,
> `Total Charge (Big $)`).

**Tab 1 — Overview**
1. **KPI — number-card**: yAxis=`Total Charge (Big $)`, aggregate **Sum** →
   big-number in the **millions** (proves the big-number requirement + calc field).
2. **KPI — kpi-delta** (or number-card): yAxis=`amount_paid` Sum.
3. **KPI — number-card**: yAxis=`Collection Rate` Average (proves ratio calc field).
4. **Bar (vertical)**: xAxis=`encounter_type`, yAxis=`total_charge` Sum.
5. **Donut**: xAxis(category)=`department`, yAxis=`total_charge` Sum.

**Tab 2 — Time Trends**
6. **Line**: xAxis=`encounter_date`, yAxis=`total_charge` Sum; **Compare** =
   `same_period_last_year` (YoY), compare date col=`encounter_date`.
7. **Line (2nd)**: xAxis=`encounter_date`, yAxis=`amount_paid` Sum; **Quick calc**
   = `running_total` (table-calc: cumulative collections).
8. **Area**: xAxis=`encounter_date`, yAxis=`length_of_stay_days` Average;
   **Compare** = `previous_period` (MoM-style).

**Tab 3 — Geography**
9. **Geo map — choropleth** (or `world-map`): region role (xAxis)=`facility_state`,
   value (yAxis)=`total_charge` Sum. ← proves the geo/region pipeline.
10. **Point map / bubble-map** (if lat/lon map available): `lng`=`facility_lon`,
    `lat`=`facility_lat`, size/value=`total_charge` Sum. ← proves lat/lon geo.
    *(If the lat/lon map type isn't in the grid post-wave, fall back to a second
    choropleth on `region`.)*
11. **Bar (horizontal)**: xAxis=`region`, yAxis=`total_charge` Sum + **reference
    line** = mean. ← reference-line requirement.

**Tab 4 — Providers**
12. **Bar (horizontal) — Top-N**: xAxis=`provider_name`, yAxis=`total_charge`
    Sum; **Top-N** limit=Top 10. ← Top-N requirement.
13. **Bar — Top-N facilities**: xAxis=`facility_name`, yAxis=`amount_paid` Sum;
    Top 10.
14. **Scatter**: xAxis=`length_of_stay_days`, yAxis=`Charge Per Day` (calc
    field), colour by `specialty`. ← proves a chart on a calc field + scatter.
15. **Table (pivot/crosstab)**: click fields to show `specialty`, `department`,
    `total_charge`, `Collection Rate` (a tabular crosstab). ← pivot/table
    requirement.

**Tab 5 — Diagnoses**
16. **Bar (vertical)**: xAxis=`primary_diagnosis`, yAxis=count of encounters
    (aggregate Count); Top-N 12.
17. **Pie**: xAxis(category)=`is_chronic`, yAxis=count.
18. **Treemap** (or bar): xAxis=`primary_icd10`, yAxis=`total_charge` Sum.

**Tab 6 — Financials**
19. **Combo / dual-axis**: xAxis=`department`, yAxis=`total_charge` Sum,
    valueColumns=`Collection Rate` (Average) on the secondary axis (enable
    **Dual-axis** in Analytics). ← dual-axis + calc field.
20. **Bar (vertical)**: xAxis=`Severity Bucket` (calc field dimension),
    yAxis=`total_charge` Sum. ← proves categorical calc field.
21. **Line**: xAxis=`encounter_date`, yAxis=`Collection Rate` Average;
    **Quick calc** = `percent_of_total` (table-calc variant).

**Cross-filter + drill wiring (do this on 2 visuals):**
- On visual #4 (Overview bar by `encounter_type`): enable **Cross-filter**.
- On visual #5 (Overview donut by `department`): enable **Cross-filter** and set
  **Drill dimensions** = [`department`, `specialty`, `provider_name`] (an ordered
  drill stack). After Save+reopen, clicking a slice cross-filters siblings and
  descends the drill (a live interaction we screenshot but assert only that the
  config persisted).

**As you build, assert each visual renders:** the `.visual-box` for a
configured chart contains an `app-echart-visual` → `.echart-canvas[_echarts_instance_]`
with a child `<canvas>` (ECharts) — assert the canvas exists and has non-zero
size, and that the visual is **not** showing the empty/"no data" state
(`.canvas-widget` empty placeholders absent for that box). For the table visual,
assert `<td>` cells with numeric content.

#### Save (draft-until-Save) + reload-verify — CRITICAL

The whole analysis is built **in memory**; nothing persists until Save.
`canSave` = at least one visual has a chart type.

- Click the toolbar **Save** button (`.a-btn.a-btn--primary`, disabled until
  `canSave`). This opens `app-save-analyses-dialog` (`.save-analysis-popup`).
  - `name` (prefilled) + description; on **create's first save** there's no
    justification field.
  - Click **Save Analysis** (`.btn-save`).
- **What the Save does (verified in `handleSaveDialogClose`):** one atomic
  `updateAnalyses` PUT sends **all** visuals + tabs + `tabDeletes`. The BE uses
  a **versioning model — it spawns a NEW `Analyses` row every save** and returns
  `data.id` = the **new** id (plus `tabIdMap`, `previousVersionId`, `lineageId`,
  `versionNumber`). The component re-pins `analysisId` to the new id and then
  **navigates to `/app/analyses` (the list)**.
- **Assert save:** success toast + URL is `/app/analyses`.

> **RELOAD-VERIFY — do NOT reload the old edit URL.** Because Save creates a new
> version and the old `<analysisId>` is now historical, the executor must
> **re-open the analysis from the list** (find the row by name → View or Edit),
> which resolves to the latest version. Then assert persistence:
> - **All 6 tabs** present in the tab strip (Overview, Time Trends, Geography,
>   Providers, Diagnoses, Financials).
> - Visual **count per tab** matches what was built (18–22 total across tabs).
> - Spot-check specific visuals rendered with real data: the Overview KPI shows
>   the **millions** big number; the Geography choropleth **draws a map**; a
>   Top-N provider bar shows 10 bars; the crosstab table has rows.
> - The cross-filter/drill config survived (open visual #5's config → cross-filter
>   toggle ON, drill dimensions listed).

- **Evidence:** one screenshot **per tab rendering** (`10-tab-overview.png` …
  `15-tab-financials.png`), a dedicated `16-geo-map.png` (map drawing),
  `17-kpi-bignumber.png` (millions KPI), `18-reload-verify-tabs.png` (post-reload
  tab strip + visuals intact).

---

## 4. Evidence plan (screenshots + what each proves)

Save all artifacts under the session **scratchpad** dir (NOT the repo):
`<scratchpad>/e2e-evidence/` (Playwright also writes trace + video there).

| File | Proves |
|---|---|
| `01-login.png` | Auth works; landed on the app shell (not `/login`). |
| `02-datasource-created.png` | Datasource saved after a **successful test-connection**; list row present. |
| `03a-db-role-created.png` | Live Postgres role created via db-access. |
| `03b-connection-created.png` | Query-runner connection created. |
| `04-dataset-preview.png` | The join **ran against real data** — ~5000 rows in the grid (not empty/error). |
| `05-dataset-saved.png` | Dataset persisted with typed fields. |
| `06-calc-field-collection-rate.png` | **SQL [bracket]** engine validated. |
| `07-calc-field-severity-js.png` | **JS {brace}** engine validated. |
| `08-dataset-fields-with-calc.png` | All 6 calc fields persisted on the dataset. |
| `10..15-tab-*.png` | Each analysis tab **renders real charts** (canvas present, not empty states). |
| `16-geo-map.png` | Geo pipeline: a **map actually draws** (region choropleth / lat-lon points). |
| `17-kpi-bignumber.png` | KPI shows the **big number** (total charges in the millions). |
| `18-reload-verify-tabs.png` | **Persistence**: after re-opening from the list, all tabs + visuals survived. |

Assertions that back the screenshots (so evidence isn't just pixels):
- After dataset Run: `.results-sheet .p-table tbody tr` count > 0 **and** a
  known column header (e.g. `total_charge`) present.
- Per chart: `app-echart-visual .echart-canvas canvas` exists with
  `boundingBox().width > 0`.
- KPI: the number-card text matches `/\$?\s?[\d,]{7,}/` (≥ 7 digits → millions).
- Post-reload: `.analysis-tab` count === 6; total `.visual-box` across tabs
  within the built range.

Optional **DB-row cross-check** (belt-and-suspenders; via the browser session's
token or a direct `curl` with `x-auth-token`): `GET /api/v1/analyses` lists the
new analysis; `GET /api/v1/analyses/<id>` returns its tabs + visuals count. And
in the warehouse: `psql … -c "select count(*) from clinical.encounters"` = 5000.

---

## 5. Playwright harness sketch

```
DBExec-UI/e2e/                         (or a sibling e2e workspace)
├── playwright.config.ts               # chromium, baseURL 4200, 1920x1080, trace/video on
├── fixtures/
│   ├── config.ts                      # BASE_URL, API_URL, creds, warehouse DSN, run-suffix
│   └── evidence.ts                    # screenshot(name) helper -> <scratchpad>/e2e-evidence
├── helpers/
│   ├── angular.ts                     # waitForAngular()
│   ├── controls.ts                    # app-custom-* drivers (input/dropdown/multiselect/toggle)
│   ├── monaco.ts                      # setMonacoValue()
│   ├── auth.ts                        # login()
│   └── analysis.ts                    # addTab(), addVisual(), pickChart(), mapField(), configAgg()...
└── specs/
    └── clinical-e2e.spec.ts           # the single ordered flow (steps 2..6 + verify)
```

### 5.1 Config (`fixtures/config.ts`)
```ts
export const CFG = {
  baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
  apiURL:  process.env.E2E_API_URL  ?? 'http://localhost:3000/api/v1',
  org: 'GauravOrg', user: 'administrator', pass: 'Pass@1234',
  suffix: process.env.E2E_SUFFIX ?? new Date().toISOString().slice(0,16).replace(/[:T]/g,''),
  warehouse: { host:'localhost', port:5432, db:'DbExec', user:'postgres', pass:'<DB_PASSWORD>', schema:'clinical' },
  evidenceDir: process.env.E2E_EVIDENCE ?? '/tmp/e2e-evidence', // executor sets to scratchpad
};
```

### 5.2 Login helper (`helpers/auth.ts`)
```ts
export async function login(page) {
  await page.goto('/login');
  await page.locator('#auth-account').fill(CFG.org);
  await page.locator('#auth-username').fill(CFG.user);
  await page.locator('#auth-password').fill(CFG.pass);
  await page.locator('button.auth-form__submit').click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30000 }); // relay -> app home
  await expect(page.locator('.auth-form__error')).toHaveCount(0);
  await waitForAngular(page);
}
```

### 5.3 Angular readiness (`helpers/angular.ts`)
```ts
export async function waitForAngular(page) {
  await page.waitForFunction(() => {
    const w = window as any;
    if (!w.getAllAngularTestabilities) return true; // zone.js exposes this in dev
    return w.getAllAngularTestabilities().every((t:any) => t.isStable());
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}
```

### 5.4 `app-custom-*` drivers (`helpers/controls.ts`)
```ts
// Text: app-custom-input wraps a real <input pInputText> inside .form-field
export async function fillCustomInput(scope, formControlName, value) {
  const input = scope.locator(`app-custom-input[formcontrolname="${formControlName}"] input, ` +
                              `app-custom-input[formcontrolname="${formControlName}"] textarea`);
  await input.fill(value);
  await input.blur(); // trip zod/blur validators
}

// Dropdown: p-dropdown trigger opens a panel APPENDED TO BODY.
export async function pickDropdown(page, triggerScope, optionText, { filter = true } = {}) {
  await triggerScope.locator('.p-dropdown').click();
  const panel = page.locator('.p-dropdown-panel');
  await panel.waitFor();
  if (filter) {
    const f = panel.locator('input.p-dropdown-filter');
    if (await f.count()) { await f.fill(optionText); await page.waitForTimeout(400); } // server debounce
  }
  await panel.locator('.p-dropdown-item', { hasText: optionText }).first().click();
  await panel.waitFor({ state: 'detached' }).catch(()=>{});
}

// Multiselect: .p-multiselect-panel / .p-multiselect-item
export async function pickMulti(page, triggerScope, optionTexts: string[]) {
  await triggerScope.locator('.p-multiselect').click();
  const panel = page.locator('.p-multiselect-panel'); await panel.waitFor();
  for (const t of optionTexts)
    await panel.locator('.p-multiselect-item', { hasText: t }).first().click();
  await page.keyboard.press('Escape');
}

// Toggle: click the switch inside the host
export async function setToggle(hostScope, on = true) {
  const sw = hostScope.locator('.p-inputswitch, [role="switch"]').first();
  const checked = (await sw.getAttribute('aria-checked')) === 'true'
               || (await sw.getAttribute('class'))?.includes('p-inputswitch-checked');
  if (!!checked !== on) await sw.click();
}
```

### 5.5 Monaco driver (`helpers/monaco.ts`)
```ts
// Set the editor value directly — reliable vs. char typing for big SQL/formulas.
export async function setMonacoValue(page, containerSelector, value) {
  await page.locator(`${containerSelector} .monaco-editor`).waitFor();
  await page.evaluate(({ sel, val }) => {
    const w = window as any;
    const node = document.querySelector(sel);
    // Preferred: monaco global getModels(); fallback: focus + clipboard paste.
    const monaco = w.monaco;
    if (monaco?.editor?.getModels?.().length) {
      const editors = monaco.editor.getEditors?.() ?? [];
      const ed = editors.find((e:any) => node?.contains(e.getDomNode?.()));
      if (ed) { ed.setValue(val); return; }
      monaco.editor.getModels()[0].setValue(val); return;
    }
    // Fallback path handled in Node side below if this throws.
  }, { sel: containerSelector, val: value });
  // Fallback if the above no-op'd: click + select-all + type.
  const box = page.locator(`${containerSelector} .monaco-editor textarea.inputarea`);
  if (await box.count()) {
    const current = await page.locator(`${containerSelector} .view-lines`).innerText().catch(()=> '');
    if (!current.includes(value.slice(0, 20))) {
      await box.click(); await page.keyboard.press('Control+A'); await box.fill(value);
    }
  }
}
```

### 5.6 Analysis helpers (`helpers/analysis.ts`) — thin wrappers over §3 Step 6
`addTab(page, name)`, `selectTab(page, name)`, `addVisual(page)`,
`pickChart(page, chartName)`, `mapField(page, slotLabel, fieldName)`
(click `.axis-slot` by label → click `.field-card` by name),
`setAggregate(page, dim, measure, agg)`, `setTopN(page, n)`,
`setQuickCalc(page, value)`, `setCompare(page, mode, dateCol)`,
`addReferenceLine(page, type)`, `enableCrossFilter(page)`,
`setDrill(page, dims)`, `saveAnalysis(page, name)`.

### 5.7 Spec shape (`specs/clinical-e2e.spec.ts`)
One `test.describe.serial` (order matters; state accumulates):
`test('login')`, `test('datasource')`, `test('db role + connection')`,
`test('dataset + calc fields')`, `test('build + save analysis')`,
`test('reload verify')`. Share ids via module-scope vars. Each test ends with an
`evidence.screenshot(...)`. Global timeout generous (the analysis build is long).

---

## 6. What runs where (quick reference for the executor)

- **SQL** runs via `psql` against `localhost:5432/DbExec` (the header one-liner).
- **Playwright** drives Chromium against `http://localhost:4200`, which talks to
  the BE at `http://localhost:3000/api/v1`.
- **Screenshots/trace/video** land in the session scratchpad, never the repo.

---

## 7. Risks & destructive-operation callout

> **This test mutates REAL infrastructure on the user's machine. The executor
> MUST obtain the user's explicit, direct go-ahead before running any of it —
> a coordinator/relayed "approval" is not sufficient.**

**What gets created / modified, and where:**

| Where | What | Cleanup |
|---|---|---|
| Warehouse Postgres `DbExec` | **`clinical` schema** (6 tables + `encounter_analytics` view + indexes + ~20k rows) | `DROP SCHEMA clinical CASCADE;` (idempotent re-run also drops+recreates) |
| Warehouse Postgres (cluster roles) | **Live PG role** `e2e_clinical_reader` (LOGIN) created by db-access Step 4a | `DROP ROLE IF EXISTS e2e_clinical_reader;` (revoke grants first if any) |
| GauravOrg app DB (`dbexec` schema) | **1 datasource**, **1 query-runner connection**, **1 dataset** (+ 6 calc fields), **N analyses rows** (one per Save — versioning creates a new row each save) | Delete via the UI (each module's row Delete → `.confirmation-popup`) or leave as demo data. Analyses are soft-deleted (`deletedOn`). |

**Isolation guarantees:**
- The clinical data is confined to the **`clinical`** schema — it never touches
  the app's master tables (`public`) or GauravOrg's org tables (`dbexec`).
- The datasource stores warehouse creds encrypted app-side; the connection is
  **owner-private** to `administrator`.

**Idempotency / re-run safety:**
- SQL: safe to re-run (drops `clinical` first).
- UI: names carry a run-suffix so re-runs don't trip unique-name validation. A
  re-run leaves prior datasource/dataset/analysis rows behind unless the executor
  deletes them — note this and offer cleanup.

**Operational risks & mitigations:**
- **Monaco loads from CDN in some builds** (the dataset editor's loading state
  warns about ad-blockers / offline). If Monaco fails to load
  (`monacoLoadFailed`), the SQL editor falls back to a plain textarea and the
  calc-field dialog falls back to an `app-custom-input` textarea — the harness's
  `setMonacoValue` fallback (§5.5) handles both. If the machine is offline and
  no fallback path is hit, dataset/calc-field steps can't run — confirm network
  before starting.
- **echarts-gl** (3D/globe charts) has a render gate; **stick to 2D chart types**
  in the build sequence (the plan does) to avoid GL/WebGL flakiness in headless.
- **appendTo="body" overlays**: always locate options under
  `.p-dropdown-panel` / `.p-multiselect-panel` / `.p-datepicker` at the page
  root, never nested under the field, or clicks miss.
- **Versioning on Save** means the edit URL id goes stale after every save —
  reload-verify **must** re-enter from the list (§3), not reload the old URL.
- **Long build**: 18–22 visuals × per-visual config is a long spec. Use generous
  timeouts, take screenshots incrementally, and consider check-pointing Save
  after every 2 tabs (each Save is atomic and creates a version — acceptable).
- **DB privileges**: creating a PG role requires the `postgres` superuser (we
  use it) — fine locally; would fail against a locked-down DB.

---

## 8. Generalisation note (why healthcare proves domain-neutrality)

Healthcare is only the **concrete demonstration domain**. Nothing in the app is
hardcoded to it — verified while reading the code:

- **Datasource / dataset / query-runner** are engine-agnostic (Postgres, MySQL,
  MariaDB, MSSQL, Oracle, Snowflake) and schema-agnostic (introspection walks
  whatever schemas/tables exist; the dataset is just saved SQL + typed fields).
- **Calculated-field engines** are generic compilers — SQL `[bracket]`
  expression + a 137-function JS `{brace}` FormulaCompiler — with no
  domain-specific functions.
- **Chart catalog** (`CHART_TYPES` / `CHART_ROLES` / `CHART_CAPABILITIES`),
  aggregation, Top-N, quick-calc (table-calc), period-over-period
  (time-intelligence), reference lines, cross-filter, drill, and the geo
  registry are all driven by **field roles and capability flags**, not by any
  clinical concept.
- **Enums** (aggregates, field types, operators) come from the per-org
  DB-driven `reference_data` catalog, not hardcoded lists.

The same script would work verbatim on a retail, finance, IoT, or logistics
schema by swapping the SQL and the field-to-slot mapping. The test therefore
proves the **generic analytics engine** using healthcare data as the payload —
which was the whole point of the domain-neutrality feature program.

---

## Appendix A — File / route quick-map (as verified in the repos)

| Concern | FE route | FE component | Key selectors |
|---|---|---|---|
| Login | `/login` | `app-login` | `#auth-account/#auth-username/#auth-password`, `button.auth-form__submit`, `.auth-form__error` |
| Datasource add | `/app/datasources/new` | `app-add-datasource` | inputs by `formcontrolname`, type dropdown `.p-dropdown`, `.test-connection-btn`, `.connection-status.success`, `.btn-save` |
| DB role add | `/app/db-roles/new` | `app-add-db-role` | `app-datasource-picker`, `name` input, `canLogin` toggle, `password`, `.btn-save` (label Create) |
| QR connection add | `/app/query-runner/connections/new` | `app-add-connection` | `name`, `datasourceId` dropdown, `username`, `password`, `.btn-save` |
| Dataset new | list `/app/datasets` → `app-dataset-picker-dialog` → `/app/datasets/new?datasourceId=&schema=` | `app-add-dataset` | `#sql-editor-container`, `.btn-run`, `.btn-dataset`, `.results-sheet`, `app-save-dataset-dialog .btn-confirm` |
| Calc field | dataset detail `/app/datasets/<id>` | `app-view-dataset` → `add-custom-field-dialog` | `#formula-editor-container`, display-name input, Data type `.p-dropdown`, Validate button, Add Field button, `.acf-validation.is-valid` |
| Analysis create | dataset list/detail → create-analysis dialog → `/app/analyses` | `app-list-dataset` / `app-view-dataset` | "Use as Analysis" → name/description dialog |
| Analysis edit | `/app/analyses/<id>/edit` | `app-edit-analyses` | toolbar Save `.a-btn--primary`, `.a-status__dot--loaded`, tabs `.analysis-tab` + `.analysis-tab-add` (`#addTabOp .add-tab-name` + `.add-tab-btn.primary`), Fields `.field-card .field-name`, `.add-visual-button`, `.chart-type-card`, `.axis-slot`, config `.config-section`, canvas `.visual-box` → `app-echart-visual .echart-canvas canvas` |
| Analysis save dialog | — | `app-save-analyses-dialog` | `.save-analysis-popup`, name input, `.btn-save` |

## Appendix B — Backend endpoints touched (for optional API-level asserts)

`POST /api/v1/auth/login` → `GET /api/v1/auth/session` (relay); datasource
`/api/v1/datasources` (+ `validate`); db-access `/api/v1/db-access`;
connections `/api/v1/query-runner`; dataset `/api/v1/datasets` (+ `fields`,
`calculated-fields`); analysis `/api/v1/analyses` (+ `analysis-tabs`,
`analysis-widgets`, `visuals`). All require the `x-auth-token` header (set by
`http-request.interceptor`). Org identity is derived server-side from the JWT —
no `orgId` in any path or body.
