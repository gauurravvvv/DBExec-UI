# Dataset Module Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bring every oversized TypeScript file in `src/app/modules/dataset` under
~700 lines by moving cohesive slices of behaviour into helpers and services, with
**zero change to how the application behaves**.

**Architecture:** three extraction mechanisms, applied in increasing order of risk.
(1) Stateless logic becomes pure free functions in `helpers/`. (2) Cohesive
stateful concerns become **component-provided** injectable services — declared in
each component's own `providers: []`, so every screen gets a private instance and
no state is shared across screens. The component keeps thin proxy accessors so
**templates are not touched at all**. (3) Only where two components' method bodies
are already byte-identical do they share one implementation.

**Tech Stack:** Angular 18.2 (NgModule, OnPush, signals), TypeScript strict,
Playwright for functional coverage.

---

## Global Constraints

These apply to every task. A task is not done until all of them hold.

- **Zero behaviour change.** This is a modularity change only. Method bodies move
  verbatim. If a body must be edited to fit a new home, the edit is limited to
  rebinding identifiers (`this.foo` → `this.sheet.foo`) — never to changing logic,
  order, conditions, defaults or error handling.
- **Drift reconciliation is OUT OF SCOPE.** `add-dataset` and `edit-dataset` share
  90 method names, and 34 of those bodies differ. Choosing a winner for a drifted
  pair changes one screen's behaviour, which this plan forbids. Where a drifted
  method must be shared, **parameterise the difference** so each caller keeps its
  exact current behaviour (see "Parameterising drift" below). Deciding the winners
  is separate product work, tracked in
  `docs/superpowers/plans/2026-07-29-dataset-drift-reconciliation.md`.
- **Verification gate, run all three, after every task:**
  ```bash
  npx tsc --noEmit
  npx ngc -p tsconfig.app.json --noEmit
  npx ng build --configuration production
  ```
  `tsc` alone is not enough — it does not check Angular templates. `ngc` AOT strict
  catches a template referencing a member that no longer exists, which is the exact
  failure mode this refactor risks.
- **e2e gate:** `npx playwright test -c e2e/playwright.config.ts dataset-workbench`
  must pass after every task from Task 2 onward.
- **Do not touch** `config/sql-dialects/*.ts` (7,558 lines across six files) or
  `constants/postgres-sql.constants.ts` (931). These are keyword, type and function
  **data tables**. Long is the correct shape for data; splitting adds indirection
  and no comprehension.
- **Never commit** `src/environments/environment*.ts` or any `.env`. They currently
  carry local port changes (`:9058`) and are tracked.
- **Branch:** `version_261`. **The user pushes, never the agent.**
- **Commit messages:** `type(scope): summary`, imperative, ~72 chars, plain and
  factual. No AI/model attribution, no `Co-Authored-By`, no generated-by trailer.
- **No new user-facing strings** are expected. If one appears, add the key to all
  10 locales in `src/assets/i18n/`.
- Ports in use during this work: FE `:8755`, BE `:9058`.

---

## Measured starting state

`find src/app/modules/dataset -name '*.ts' | xargs wc -l` → **25,852 lines / 47 files.**

| File | Lines | Verdict |
|---|---:|---|
| `components/add-dataset/add-dataset.component.ts` | 2,789 | decompose → ~700 |
| `components/edit-dataset/edit-dataset.component.ts` | 2,541 | decompose → ~700 |
| `services/monaco-intellisense.service.ts` | 2,329 | → 1,911 (Task 1) → ~900 (Task 9) |
| `config/sql-dialects/snowflake.ts` | 2,120 | **leave** — data |
| `config/sql-dialects/postgres.ts` | 1,633 | **leave** — data |
| `components/formula-field-dialog/…component.ts` | 1,024 | decompose → ~450 |
| `config/sql-dialects/{oracle,mariadb,mysql,mssql}.ts` | 987/957/941/920 | **leave** — data |
| `constants/postgres-sql.constants.ts` | 931 | **leave** — data |
| `helpers/dummy-data.helper.ts` | 847 | **739 lines are dead** — Task 2 |
| `components/list-dataset/list-dataset.component.ts` | 735 | optional, Task 11 |
| `services/sql-scope-tracker.ts` | 691 | under threshold, leave |
| `services/dataset.service.ts` | 680 | under threshold, leave |
| `components/view-dataset/view-dataset.component.ts` | 504 | under threshold, leave |
| `services/sql-validator.service.ts` | 496 | under threshold, leave |

### The add/edit duplication, measured

Both components were parsed with a brace-balance method extractor:

| | count | lines (add side) |
|---|---:|---:|
| methods in `add-dataset` | 105 | 2,789 |
| methods in `edit-dataset` | 105 | 2,541 |
| shared method names | 90 | — |
| … byte-identical bodies | 56 | 506 |
| … drifted bodies | 34 | 1,120 |
| add-only methods | 15 | — |
| edit-only methods | 15 | — |

A second measurement with whitespace and comments normalised puts identical at 54
and drifted at 35, of which 15 differ only cosmetically — so **~20 pairs carry real
code drift**. Both measurements agree on the shape: the two screens are near-copies.

**The largest schema-tree methods are precisely the drifted ones**
(`loadDatasourceSchemaFromAPI` 142/118, `ensureTablesLoaded` 120/78,
`ensureColumnsLoaded` 99/92). That is why Task 6 parameterises rather than merges.

### Parameterising drift

When a drifted method moves into a shared service, the difference becomes an
explicit option with a per-caller default. Example — `ensureTablesLoaded` in
`add-dataset` has a re-entry guard and a `background` flag that `edit-dataset`
lacks:

```ts
// services/dataset-schema-tree.service.ts
export interface EnsureTablesOptions {
  /**
   * add-dataset returns early when the schema is already loading, so two rapid
   * expands fire one request. edit-dataset has no such guard and fires two.
   * Defaulted per caller to preserve each screen's current behaviour exactly;
   * `false` is a known defect, tracked in the drift-reconciliation plan.
   */
  guardReentry: boolean;
  /** add-dataset only: suppress the spinner for a prefetch. */
  background?: boolean;
}
```

```ts
// add-dataset.component.ts
this.tree.ensureTablesLoaded(dbId, schema, { guardReentry: true, background });
// edit-dataset.component.ts
this.tree.ensureTablesLoaded(dbId, schema, { guardReentry: false });
```

**Rule:** a flag is only acceptable when it reproduces observed current behaviour.
Never introduce a flag whose value changes what either screen does today. If a
drifted pair cannot be expressed this way in under ~15 lines of option plumbing,
**leave both copies in their components** and note it in the task's commit body.

### Keeping templates untouched

Moving state into a service would normally require rewriting every binding in
`add-dataset.component.html` (1,157 lines) and `edit-dataset.component.html`
(1,263). Instead the component keeps a proxy:

```ts
// Templates keep binding to `resultSheetHeightPx`; the state lives in the service.
get resultSheetHeightPx(): number { return this.sheet.heightPx; }
set resultSheetHeightPx(px: number) { this.sheet.heightPx = px; }
```

A proxy costs 2 lines and removes 20. Only add proxies for members the template
actually binds — check with
`grep -oE '\b<member>\b' <component>.html`. Members used only from TypeScript are
rebound at the call site instead.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `e2e/dataset-workbench.e2e.ts` | Functional safety net: create + edit a dataset end to end |
| `models/dataset-schema.model.ts` | The 7 shared interfaces currently buried in `dummy-data.helper.ts` |
| `helpers/dataset-export.helper.ts` | Pure: CSV/JSON serialisation, export base name, SQL file read + validate |
| `helpers/dataset-result-grid.helper.ts` | Pure: column widths, column profiles, null severity, JSON cell keys |
| `services/result-sheet-layout.service.ts` | Result sheet height, collapse, drag, persistence, resize observer |
| `services/result-grid-tools.service.ts` | Expanded JSON cells, column profiles, cell/column copy, cell context menu |
| `services/dataset-schema-tree.service.ts` | Schema tree: load, lazy tables, lazy columns, expand state, cache, filter |
| `helpers/dataset-monaco-setup.helper.ts` | Monaco mount, IntelliSense provider registration, dialect lint scheduling |
| `helpers/dataset-results-paging.helper.ts` | Result paging, filtering, page-size persistence |
| `services/formula-field-form.service.ts` | Formula dialog form state, validation round-trip, catalog wiring |

**Modified:**

| Path | Change |
|---|---|
| `components/add-dataset/add-dataset.component.ts` | 2,789 → ~700; delegates to the above |
| `components/edit-dataset/edit-dataset.component.ts` | 2,541 → ~700; delegates to the above |
| `services/monaco-intellisense.service.ts` | 2,329 → 1,911 (Task 1) → ~900 (Task 9) |
| `components/formula-field-dialog/…component.ts` | 1,024 → ~450 |
| `helpers/dummy-data.helper.ts` | **deleted** — 739 dead lines dropped, 107 lines of interfaces moved |
| `helpers/schema-transformer.helper.ts`, `services/query.service.ts`, `modules/query-builder/…/execute-query-builder.component.ts` | import path update only |
| `docs/context/modules/dataset.md`, `docs/context/INDEX.md`, `docs/context/SESSION_LOG.md` | Session-end protocol |

**Deliberately unchanged:** `config/sql-dialects/*`, `constants/postgres-sql.constants.ts`,
all `.html`, all `.scss`.

---

## Task 1: Land the verified IntelliSense text-analysis extraction

Cowork produced this on `refactor/dataset-decomposition` and abandoned the branch.
It has been verified in an isolated worktree: **`tsc` clean and `ngc` AOT clean**.
It is exactly this plan's work, already done, so it goes first as a free win.

**Files:**
- Create: `src/app/modules/dataset/services/sql-text-analysis.ts` (465 lines, 9 pure functions)
- Modify: `src/app/modules/dataset/services/monaco-intellisense.service.ts` (2,329 → 1,911)

**Interfaces:**
- Produces: `stripStringsAndComments`, `isCursorInStringOrComment`,
  `parseTableReferences`, `parseCTEReferences`, `extractBalancedParens`,
  `generateAlias`, `quoteIdentifier`, `getContext`, `buildAliasMap` — all pure,
  all exported from `services/sql-text-analysis.ts`.

- [ ] **Step 1: Cherry-pick the code commit only**

The second commit on that branch (`00a39273`) is a measurement document; take it
too, since Task 6 depends on its classification.

```bash
cd /Users/gaurav.goel/code/Personal/DBExec/DBExec-UI
git cherry-pick 5ae220bb
git cherry-pick 00a39273
```

- [ ] **Step 2: Confirm the extracted functions are genuinely pure**

A `this` reference or a service-field read would mean the function was moved
incorrectly and only compiles because it was also left behind.

```bash
grep -n "this\." src/app/modules/dataset/services/sql-text-analysis.ts
```

Expected: no output.

- [ ] **Step 3: Run the full verification gate**

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
```

Expected: all three clean.

- [ ] **Step 4: Run the suites that already cover this service**

The executor and formula suites exercise IntelliSense; they are the existing
coverage for these 9 functions.

```bash
npx playwright test -c e2e/playwright.config.ts query-executor editor-parity
```

Expected: pass.

- [ ] **Step 5: No commit needed** — the cherry-picks are the commits. Confirm:

```bash
git log --oneline -2
```

---

## Task 2: Delete the dead mock-data class and extract the real models

`helpers/dummy-data.helper.ts` is 847 lines. Lines 6–107 are seven interfaces used
across the app (`TableSchema` 37 references, `DatasourceSchema` 32, `TableColumn`
21, `QueryResult` 10, `SchemaGroup` 5, `QueryExecuteData` 4). Lines 108–847 are
`export class DummyDataHelper` — **739 lines with zero references anywhere.**

The file is also misnamed: it is the module's model file wearing a mock-data name,
which is why five other files import types from a helper called "dummy data".

**Files:**
- Create: `src/app/modules/dataset/models/dataset-schema.model.ts`
- Delete: `src/app/modules/dataset/helpers/dummy-data.helper.ts`
- Modify (import path only): `helpers/schema-transformer.helper.ts`,
  `services/monaco-intellisense.service.ts`,
  `components/add-dataset/add-dataset.component.ts`,
  `components/edit-dataset/edit-dataset.component.ts`,
  `../query-builder/components/execute-query-builder/execute-query-builder.component.ts`

**Interfaces:**
- Produces: `TableColumn`, `TableSchema`, `SchemaGroup`, `DatasourceSchema`,
  `QueryErrorKind`, `QueryResult`, `QueryExecuteData` — re-exported unchanged from
  `models/dataset-schema.model.ts`.

- [ ] **Step 1: Prove `DummyDataHelper` is dead, including in templates**

A static class cannot appear in a template without a component field, but check
anyway — this step is the whole justification for deleting 739 lines.

```bash
cd /Users/gaurav.goel/code/Personal/DBExec/DBExec-UI/src
grep -rn "DummyDataHelper" --include=*.ts --include=*.html . | grep -v "helpers/dummy-data.helper.ts"
grep -rn "QueryErrorKind" --include=*.ts . | grep -v "helpers/dummy-data.helper.ts"
```

Expected: no output from either. If `DummyDataHelper` has any hit, **stop** — do
not delete; report it instead.

- [ ] **Step 2: Create the model file from lines 1–107, verbatim**

Copy the header comment, the seven declarations and their doc comments exactly.
Change only the file's own top comment, which currently says "Contains
static/mock data for testing and demonstration purposes" and will no longer be
true:

```ts
/**
 * Dataset schema and query-result models.
 *
 * These describe the shape the backend returns for a datasource's schema tree and
 * for an executed query. Previously they lived in `helpers/dummy-data.helper.ts`
 * alongside a 739-line mock-data class that nothing referenced; the class was
 * deleted and these moved here, which is where their 100+ consumers expect them.
 */
```

- [ ] **Step 3: Repoint the five importers**

```bash
cd /Users/gaurav.goel/code/Personal/DBExec/DBExec-UI/src
grep -rln "dummy-data.helper" --include=*.ts . | xargs sed -i '' \
  -e "s#'\.\./\.\./helpers/dummy-data\.helper'#'../../models/dataset-schema.model'#g" \
  -e "s#'\.\./helpers/dummy-data\.helper'#'../models/dataset-schema.model'#g" \
  -e "s#'\./dummy-data\.helper'#'../models/dataset-schema.model'#g" \
  -e "s#'\.\./\.\./\.\./dataset/helpers/dummy-data\.helper'#'../../../dataset/models/dataset-schema.model'#g"
grep -rn "dummy-data.helper" --include=*.ts .
```

Expected: the final `grep` returns only the comment in
`app/shared/editor/schema-bridge.ts:32`, which is prose and should be reworded to
name the new file.

- [ ] **Step 4: Delete the old file**

```bash
git rm src/app/modules/dataset/helpers/dummy-data.helper.ts
```

- [ ] **Step 5: Run the full verification gate**

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
```

Expected: all three clean. A missed import path fails at `tsc`.

- [ ] **Step 6: Commit**

```bash
git add -A src/app/modules/dataset src/app/modules/query-builder src/app/shared/editor
git commit -m "refactor(dataset): extract schema models, drop unused mock-data class

- move the seven shared interfaces out of dummy-data.helper into
  models/dataset-schema.model.ts, where their 100+ consumers expect them
- delete DummyDataHelper (739 lines) — no references anywhere in the app
- repoint the five importers"
```

---

## Task 3: Functional e2e safety net for dataset create and edit

**This is the prerequisite for Tasks 4–10 and must not be skipped.** There is
currently **no functional coverage of dataset create or edit**. The suites that
exist cover the formula dialog (16 + 37 cases), the executor (7) and editor parity
(1). Parity proves the editor mounts and matches styling; it does not prove a
dataset can still be created, a schema tree expanded, a query run, or results
exported. Restructuring 5,330 lines behind no functional test is how dataset
creation breaks silently and is not noticed for a week.

**Files:**
- Create: `e2e/dataset-workbench.e2e.ts`
- Reuse: `e2e/_auth.ts` (`login`, `authToken`, `firstConnection`, `API`)

**Interfaces:**
- Consumes: `login(page)`, `authToken(page)`, `firstConnection(page, token)`, `API`
  from `./_auth`.
- Produces: a `dataset-workbench` Playwright project name used as the gate command
  in every later task.

- [ ] **Step 1: Write the create-path test**

Routes are `/app/datasets/new` and `/app/datasets/:id/edit` — **not** `/add` or
`/edit/:id`. Two earlier parity legs silently skipped because of that.
Never use `waitUntil: 'networkidle'`: the app holds an open SSE notifications
stream, so networkidle never fires. Drive Monaco through its model API, not
keystrokes.

```ts
import { expect, Page, test } from '@playwright/test';
import { authToken, firstConnection, login } from './_auth';

test.use({ viewport: { width: 1680, height: 1050 } });

async function waitForMonaco(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(window as any).monaco?.editor?.getModels?.().length,
    undefined,
    { timeout: 45_000 },
  );
}

async function setSql(page: Page, sql: string): Promise<void> {
  await page.evaluate(
    (v: string) => (window as any).monaco.editor.getModels()[0].setValue(v),
    sql,
  );
}

test('create: pick a datasource, browse the tree, run, save', async ({ page }) => {
  await login(page);
  const conn = await firstConnection(page, await authToken(page));

  await page.goto(`/app/datasets/new?datasourceId=${conn.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForMonaco(page);

  // The schema tree must populate — this is what the schema-tree service owns.
  const schemaRow = page.locator('.qx-node, .ds-tree__schema').first();
  await expect(schemaRow).toBeVisible({ timeout: 30_000 });
  await schemaRow.click();

  // Expanding a schema lazily fetches tables; expanding a table fetches columns.
  const tableRow = page.locator('.ds-tree__table, .qx-node--table').first();
  await expect(tableRow).toBeVisible({ timeout: 30_000 });
  await tableRow.click();
  await expect(
    page.locator('.ds-tree__column, .qx-node--column').first(),
  ).toBeVisible({ timeout: 30_000 });

  // Run a query and prove results render.
  await setSql(page, 'select 1 as one, 2 as two');
  await page.evaluate(() => {
    const host = document.querySelector('app-add-dataset');
    (window as any).ng?.getComponent?.(host)?.executeCompleteQuery?.();
  });
  await expect(page.locator('.ds-result, .p-datatable').first()).toBeVisible({
    timeout: 45_000,
  });
});
```

- [ ] **Step 2: Run it and confirm it passes against the current, un-refactored code**

A safety net that fails before the refactor proves nothing.

```bash
npx playwright test -c e2e/playwright.config.ts dataset-workbench
```

Expected: PASS. If a selector does not match, fix the **selector**, never the
component — the point is to describe current behaviour, not change it.

- [ ] **Step 3: Add the result-sheet, export and edit-round-trip legs**

Cover, in the same file: collapse and re-expand the result sheet; drag its resize
handle and confirm the height persists across a reload; export results as CSV and
assert the download fires (the FE http interceptor previously clobbered JSON-blob
downloads — assert on the `download` event, not on response JSON); save the
dataset; reopen it at `/app/datasets/:id/edit` and confirm the SQL round-trips.

Note for the edit leg: a dataset save is **versioned** — it returns a new `id` with
the same `lineageId`. Assert on the id returned by the save response, not the id
you navigated from. Reusing the pre-save id reopens the previous version and looks
exactly like data loss; that misreading has already cost one investigation.

- [ ] **Step 4: Run the full file**

```bash
npx playwright test -c e2e/playwright.config.ts dataset-workbench
```

Expected: all legs pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/dataset-workbench.e2e.ts
git commit -m "test(dataset): functional e2e for dataset create and edit

Covers datasource selection, lazy schema/table/column expansion, query
execution, the result sheet, CSV export and the edit round-trip. This is the
regression net for the component decomposition that follows."
```

---

## Task 4: Pure export and file-import helper

Start with the safest mechanism: these bodies touch no component state beyond
values that can be passed in.

**Files:**
- Create: `src/app/modules/dataset/helpers/dataset-export.helper.ts`
- Modify: `add-dataset.component.ts`, `edit-dataset.component.ts`

**Interfaces:**
- Consumes: `QueryResult` from `models/dataset-schema.model`.
- Produces:
  ```ts
  export function exportBaseName(datasourceName: string | null, schema: string | null): string;
  export function toCsv(result: QueryResult): string;
  export function toJson(result: QueryResult): string;
  export function downloadText(filename: string, mime: string, body: string): void;
  export type SqlFileReadResult =
    | { ok: true; sql: string }
    | { ok: false; reason: 'size' | 'type' | 'read' };
  export function readSqlFile(file: File, maxSizeMb: number): Promise<SqlFileReadResult>;
  ```
  `maxSizeMb` is a **parameter**, not a constant: `add-dataset` caps uploads at
  2 MB and `edit-dataset` at 22 MB. That divergence is preserved by each caller
  passing its own current value. Unifying it is a product decision, tracked in the
  drift plan.

- [ ] **Step 1: Move `exportResultsAsCsv` (52 lines, byte-identical in both)**

Identical in both components, so one shared implementation is a behaviour-preserving
move by definition. Copy the body verbatim into `toCsv`, replacing `this.queryResult`
with the `result` parameter. Change nothing else — not the delimiter, not the quoting,
not the null rendering.

- [ ] **Step 2: Compile**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Add a characterisation test pinning the CSV output**

The value of this test is that it was written from the **original** body, so a later
edit to quoting or null handling fails loudly.

```ts
// helpers/dataset-export.helper.spec.ts
it('serialises the shape the component produced before extraction', () => {
  const result = {
    columns: ['id', 'name', 'note'],
    rows: [
      { id: 1, name: 'a,b', note: null },
      { id: 2, name: 'quote"d', note: 'ok' },
    ],
  } as any;
  expect(toCsv(result)).toBe(
    'id,name,note\n1,"a,b",\n2,"quote""d",ok',
  );
});
```

Run it, and **if it fails, correct the expectation to match the original body** —
the original is the specification here, not your idea of correct CSV.

- [ ] **Step 4: Move the remaining export members one at a time**

`exportResultsCsvClient`, `exportResultsJsonClient`, `exportCurrentScript`,
`exportBaseName`, `triggerFileInput`, `onFileSelected`. After **each** one:
`npx tsc --noEmit`. One move, one compile, repeat — a scripted bulk extraction was
attempted on this codebase before and abandoned, because the "include the doc
comment above" heuristic swallows an intervening method.

`exportBaseName` and `onFileSelected` are drifted; pass the difference as an
argument per the rule above.

- [ ] **Step 5: Full verification gate + e2e**

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
npx playwright test -c e2e/playwright.config.ts dataset-workbench
```

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/dataset
git commit -m "refactor(dataset): extract result export and SQL file import to a helper

Pure functions shared by add and edit. The upload size cap stays a per-caller
argument (add 2MB, edit 22MB) so neither screen's behaviour changes."
```

---

## Task 5: Result sheet layout service and result grid tools service

Two cohesive stateful slices. Both are **component-provided**, so each screen keeps
a private instance.

**Files:**
- Create: `src/app/modules/dataset/services/result-sheet-layout.service.ts`
- Create: `src/app/modules/dataset/services/result-grid-tools.service.ts`
- Create: `src/app/modules/dataset/helpers/dataset-result-grid.helper.ts`
- Modify: `add-dataset.component.ts`, `edit-dataset.component.ts`

**Interfaces:**
- Produces `ResultSheetLayoutService`: `heightPx`, `isCollapsed`,
  `effectiveHeightPx`, `clamp(px)`, `toggle()`, `dismiss()`, `surface()`,
  `onDragStart(ev)`, `onHandleKeydown(ev)`, `installResizeObserver(el)`,
  `loadPersisted(key)`, `persistHeight(px)`, `persistCollapsed(flag)`, `destroy()`.
- Produces `ResultGridToolsService`: `expandedJsonCells`, `columnWidths`,
  `columnProfiles`, `showColumnProfile`, `jsonCellKey(row, col)`,
  `toggleJsonCell(row, col)`, `recomputeProfiles(result)`, `toggleColumnProfile()`,
  `copyCellValue()`, `copyColumnValues()`, `onCellContextMenu(ev, row, col)`,
  `recalculateColumnWidths(result, paneWidth)`, `hasAnyColumnType(result)`.
- Produces from the helper (pure): `nullSeverity(pct)`, `computeColumnWidths(...)`,
  `computeColumnProfiles(...)`.

- [ ] **Step 1: Identify which members the templates bind**

This determines which need proxy accessors and which are rebound at the call site.

```bash
cd /Users/gaurav.goel/code/Personal/DBExec/DBExec-UI/src/app/modules/dataset/components
for m in resultSheetHeightPx isResultSheetCollapsed effectiveSheetHeightPx \
         expandedJsonCells columnWidths columnProfiles showColumnProfile \
         nullSeverity jsonCellKey toggleJsonCell hasAnyColumnType \
         onSheetDragStart onSheetHandleKeydown toggleResultSheet dismissResultSheet; do
  printf "%-26s add=%s edit=%s\n" "$m" \
    "$(grep -c "\b$m\b" add-dataset/add-dataset.component.html)" \
    "$(grep -c "\b$m\b" edit-dataset/edit-dataset.component.html)"
done
```

Record the output in the commit body. Every member with a non-zero count gets a
proxy; the rest are rebound directly.

- [ ] **Step 2: Create `result-sheet-layout.service.ts` with the bodies moved verbatim**

Move the byte-identical members first (`installResultPaneResizeObserver` 21 lines,
`recalculateColumnWidths` 9). Then the drifted ones — `clampSheetHeight` (16/12),
`loadPersistedSheetState` (26/23), `surfaceResultSheet` (17/11),
`onSheetDragStart` (27/22), `onSheetHandleKeydown` (15/11),
`persistSheetHeight`, `persistSheetCollapsed` — parameterising each difference.
Four of these (`persistSheetHeight`, `persistSheetCollapsed`,
`onSheetHandleKeydown`, `toggleJsonCell`) differ **only in brace style**, so their
bodies are behaviourally identical and can be shared with no flag at all; confirm
that per pair with a diff before assuming it.

The storage key is a constructor argument, because `edit-dataset` has its own
`columnStateStorageKey` and `add-dataset` does not:

```ts
@Injectable()
export class ResultSheetLayoutService implements OnDestroy {
  constructor(private readonly storageKeyPrefix: string) {}
}
```

- [ ] **Step 3: Register it per component and add the proxies**

```ts
@Component({
  selector: 'app-add-dataset',
  // …
  providers: [
    { provide: ResultSheetLayoutService, useFactory: () => new ResultSheetLayoutService('dataset.add') },
  ],
})
```

Add a proxy for each member Step 1 found in the template. Call
`this.sheet.destroy()` from `ngOnDestroy` — the resize observer and the drag
listeners must still be torn down, and a leak here is invisible until the page is
opened twenty times.

- [ ] **Step 4: Compile after each moved member**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Repeat Steps 2–4 for `ResultGridToolsService`**

Move the pure parts (`nullSeverity`, width computation, profile computation) into
`dataset-result-grid.helper.ts` and let the service hold only state plus
orchestration. `copyCellValue` / `copyColumnValues` are identical in both;
`writeToClipboard` is drifted (28/22).

- [ ] **Step 6: Full verification gate + e2e, and confirm the sheet still persists**

The e2e's drag-and-reload leg is the specific test for this task.

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
npx playwright test -c e2e/playwright.config.ts dataset-workbench
```

- [ ] **Step 7: Commit**

```bash
git add src/app/modules/dataset
git commit -m "refactor(dataset): move result sheet layout and grid tools into services

Both are component-provided, so add and edit keep independent instances. The
components retain proxy accessors for template-bound members, so no HTML
changed. Drifted bodies became explicit per-caller options rather than a merge."
```

---

## Task 6: Schema tree service

The largest slice — roughly 630 lines — and the one where drift concentrates. Do it
after Tasks 4 and 5 have proven the mechanism on smaller surfaces.

**Files:**
- Create: `src/app/modules/dataset/services/dataset-schema-tree.service.ts`
- Modify: `add-dataset.component.ts`, `edit-dataset.component.ts`

**Interfaces:**
- Consumes: `DatasourceSchema`, `TableSchema`, `TableColumn` from
  `models/dataset-schema.model`; `SchemaTransformer` from
  `helpers/schema-transformer.helper`.
- Produces: state `schemas`, `loading`, `expandedPaths`, `treeMode`,
  `searchText`, `scopedSchema`; methods `schemaPath`, `tablePath`, `isExpanded`,
  `isTableExpanded`, `toggleDatasource`, `toggleSchema`, `toggleTable`,
  `collapseSubtree`, `collapseSchemaSubtree`, `getFilteredSchemas`,
  `getFilteredTables`, `getDbTypeFor`, `applyCachedSchemaData`,
  `loadDatasourceSchema`, `loadDatasourceSchemaFromAPI(dbId, opts)`,
  `ensureTablesLoaded(dbId, schema, opts)`, `ensureColumnsLoaded(dbId, schema, table, opts)`,
  `markTreeFullyLoaded`, `markTreeTablesOnlyLoaded`, `replaceSchemaNode`,
  `replaceTableNode`, `refreshSingleDatasource`.

- [ ] **Step 1: Read the drift classification before touching anything**

```bash
sed -n '1,200p' docs/superpowers/plans/2026-07-29-dataset-drift-reconciliation.md
```

It already classifies these pairs. Three are flagged **"correctly different, must
NOT be merged"** — `loadDatasourceSchemaFromAPI` and `replaceSchemaNode` both call
`syncEditorReadOnlyState()`, which is an add-only feature (scoped launch), and
`ensureTablesLoaded` differs by a real re-entry guard. Those become options or hooks,
never a merge.

- [ ] **Step 2: Move the eight byte-identical members first**

`loadDatasourceSchema` (35), `markTreeTablesOnlyLoaded` (18),
`markTreeFullyLoaded` (17), `replaceTableNode` (15), `collapseSchemaSubtree` (9),
`schemaPath`, `tablePath`, `isTableExpanded`. Verbatim. `npx tsc --noEmit` after
each.

- [ ] **Step 3: Move the drifted members, one per compile, with the difference parameterised**

Order by ascending size so the mechanism is proven before the 142-line method:
`getDbTypeFor` (14/6) → `toggleSchema` (14/9) → `getFilteredSchemas` (14/14) →
`applyCachedSchemaData` (21/18) → `replaceSchemaNode` (26/20) →
`refreshSingleDatasource` (28/27) → `ensureColumnsLoaded` (99/92) →
`ensureTablesLoaded` (120/78) → `loadDatasourceSchemaFromAPI` (142/118).

For each: `git diff --no-index` the two bodies, write the option that reproduces
both, and record in the commit body which flag each screen passes.

The add-only `syncEditorReadOnlyState()` call becomes an optional hook, so the
service never knows about editor read-only state:

```ts
export interface SchemaTreeHooks {
  /** add-dataset only: re-evaluates editor read-only after a scoped-schema load. */
  onTreeReplaced?: () => void;
}
```

- [ ] **Step 4: Add proxies for template-bound members**

Same grep technique as Task 5, Step 1, for `datasourceSchemas`,
`loadingDatasources`, `expandedPaths`, `schemaSearchText`, `getFilteredSchemas`,
`getFilteredTables`, `isExpanded`, `toggleSchema`, `toggleTable`,
`toggleDatasource`, `schemaPath`, `tablePath`, `isTableExpanded`.

- [ ] **Step 5: Full verification gate + e2e**

The e2e's lazy expand legs — schema → tables → columns — are the specific test
for this task, and the reason Task 3 came first.

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
npx playwright test -c e2e/playwright.config.ts dataset-workbench query-executor
```

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/dataset
git commit -m "refactor(dataset): move the schema tree into a component-provided service

Load, lazy table and column fetch, expand state, cache application and
filtering move out of both components (~630 lines each). Where the two screens
had drifted the difference became an explicit option or hook, so add keeps its
re-entry guard, background prefetch and scoped-schema filtering, and edit keeps
its current behaviour unchanged."
```

---

## Task 7: Monaco setup and results paging helpers

**Files:**
- Create: `src/app/modules/dataset/helpers/dataset-monaco-setup.helper.ts`
- Create: `src/app/modules/dataset/helpers/dataset-results-paging.helper.ts`
- Modify: `add-dataset.component.ts`, `edit-dataset.component.ts`

**Interfaces:**
- Produces: `mountDatasetEditor(cfg): Promise<EditorHandle>`,
  `registerIntelliSense(handle, deps): Disposable[]`,
  `scheduleDialectLint(handle, dialect, timerRef)`;
  `loadPersistedPageSize(key)`, `persistPageSize(key, n)`,
  `isPaginationEnabled(result, pageSize)`, `buildLazyLoadQuery(event, state)`.

- [ ] **Step 1: Move the identical Monaco members**

`loadMonacoEditor` (13), `registerIntelliSenseProviders` (25), `resetEditor` (12),
`retryLoadMonaco`, `showMonacoLoadError`, `updateEditorTheme`. All go through
`CodeEditorService` already — that is the only permitted way to create an editor,
so the helper composes it rather than calling `monaco.editor.create`.

- [ ] **Step 2: Move `initMonaco` (112/123, drifted) as a config-driven call**

The drift is in which callbacks are wired and the read-only decision. Express it as
a config object; do not merge the callback bodies.

- [ ] **Step 3: Move the paging members**

`onResultsLazyLoad` (27/21, drifted), `onResultFilterChange`, `clearResultFilters`
(identical), `isResultFilterActive`, `loadPersistedPageSize`, `persistPageSize`
(add-only), `isPaginationEnabled`.

- [ ] **Step 4: Compile after each; then the full gate + e2e**

```bash
npx tsc --noEmit && npx ngc -p tsconfig.app.json --noEmit && npx ng build --configuration production
npx playwright test -c e2e/playwright.config.ts dataset-workbench editor-parity
```

`editor-parity` matters here: it asserts computed styles across the three editor
screens, so it catches a mount that silently lost an option.

- [ ] **Step 5: Commit**

```bash
git add src/app/modules/dataset
git commit -m "refactor(dataset): extract Monaco mount and results paging helpers"
```

---

## Task 8: Measure, and decide whether the components are small enough

A checkpoint, not a refactor. The remaining bulk in each component is query
execution (`executeQueryForDatasource` 152/…, `executeQuery`, `executeCompleteQuery`,
`executeSelectedQuery`), datasource selection, and the save/dialog flow — which is
the screen's actual purpose and reasonably lives in the component.

- [ ] **Step 1: Measure**

```bash
cd /Users/gaurav.goel/code/Personal/DBExec/DBExec-UI/src/app/modules/dataset
find . -name '*.ts' -not -name '*.spec.ts' | xargs wc -l | sort -rn | head -12
```

- [ ] **Step 2: Report the before/after table to the user and ask whether to continue**

If both components are at or under ~700 lines, stop here; Task 10 (the optional
shared base class) is the riskiest step in this plan and is only worth taking if
the user wants further consolidation.

---

## Task 9: Split the IntelliSense service and the formula dialog

**Files:**
- Modify: `services/monaco-intellisense.service.ts` (1,911 → ~900)
- Create: `services/intellisense-completion-builder.ts`,
  `services/intellisense-hover-provider.ts`,
  `services/intellisense-signature-provider.ts`
- Modify: `components/formula-field-dialog/formula-field-dialog.component.ts` (1,024 → ~450)
- Create: `services/formula-field-form.service.ts`

**Interfaces:**
- Consumes: the 9 pure functions from `services/sql-text-analysis.ts` (Task 1).
- Produces: one exported provider factory per Monaco provider kind.

- [ ] **Step 1: Split the service by Monaco provider kind**

After Task 1 the remaining 1,911 lines are three providers plus shared resolution.
Completion, hover and signature-help are independent surfaces with no shared
mutable state; each becomes its own file, and the service keeps schema resolution
and the caches. Move one provider, compile, repeat.

- [ ] **Step 2: Run the formula suites — 53 cases already cover this**

```bash
npx playwright test -c e2e/playwright.config.ts formula-fields
```

If any case reports "Failed to connect to the datasource", that is the known
Postgres connection-pool exhaustion on `/fields/validate` (100-connection limit),
**not** a regression from this task. Confirm by stashing and re-running before
attributing it to the refactor.

- [ ] **Step 3: Extract the formula dialog's form state into a service**

Form construction, validation round-trip and catalog wiring leave the component;
the dialog keeps presentation and the editor handle.

- [ ] **Step 4: Full verification gate + both formula suites + e2e**

- [ ] **Step 5: Commit** (two commits — one per file, so a regression bisects cleanly)

---

## Task 10 (optional, gated on Task 8): Shared base component

Only if the user wants the components smaller than Task 8 leaves them.

`DatasetSqlWorkbenchBase` holds the members whose bodies are **byte-identical**
after Tasks 4–7. Identical bodies make this behaviour-preserving by construction;
the 34 drifted members stay as overrides on each subclass.

- [ ] **Step 1: Re-measure identity after the earlier tasks**

Tasks 4–7 rebind identifiers in both components the same way, which should have
*increased* the identical count. Re-run the brace-balance comparison and use the
new list — do not reuse the numbers at the top of this plan.

- [ ] **Step 2: Move only members proven identical in that fresh measurement**

- [ ] **Step 3: Full verification gate + every dataset suite**

- [ ] **Step 4: Commit**

---

## Task 11: Documentation, per the session-end protocol

- [ ] **Step 1: Prepend a dated Progress entry to `docs/context/modules/dataset.md`**

Include the measured before/after table and the note that drift reconciliation
remains outstanding.

- [ ] **Step 2: Update the module's Status and Last-updated line, and its row in `docs/context/INDEX.md`**

```bash
date +%Y-%m-%d
```

Never guess the date.

- [ ] **Step 3: Add a dated `docs/context/SESSION_LOG.md` entry**

- [ ] **Step 4: Note the two follow-ups this plan deliberately did not do**

1. **Drift reconciliation** — ~20 real pairs, 6 needing a product decision. Now
   visible as explicit options instead of buried in two copies, which is what makes
   the decisions possible.
2. **SCSS.** `edit-dataset.component.scss` is **3,178** lines and
   `add-dataset.component.scss` **2,528** — together larger than the TypeScript
   they style, and near-duplicates of each other. Out of scope here because the
   request was TypeScript, but they are now the module's largest files.

- [ ] **Step 5: Commit**

```bash
git add docs/context
git commit -m "docs(dataset): record the module decomposition and remaining follow-ups"
```

---

## Ordering rationale

Task 1 first because it is verified and free. Task 2 next because deleting 739
dead lines is pure subtraction with no risk. Task 3 before any component surgery
because there is currently no functional coverage of dataset create or edit. Then
Tasks 4 → 5 → 6 in ascending order of size and drift density, so the extraction
mechanism is proven on a 52-line pure function before it is applied to a 142-line
drifted one. Task 8 is a checkpoint that may end the work early. Task 10 is last
and optional because inheritance is the most invasive change here and may not be
needed.
