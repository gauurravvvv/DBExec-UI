# Dataset module — power-author editing pass

> Continuation of the m03 hardening + result-pane redesign. This
> slice is about turning the editor from "minimum viable" into
> something a senior data engineer would choose to live in: bind
> parameters, save-and-run inline, diff-before-update, cancel
> long-running queries, EXPLAIN plans, richer field metadata, and
> the AG Grid result pane the user already prototyped on the
> `ag-grid` branch.

## 0. ROI ranking of candidate features

Sorted by (impact ÷ effort), highest first:

| #   | Feature                                                                                                   | Impact                 | Effort                                                | Notes                                                         |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| 1   | AG Grid result pane (drag-reorder, resize, column chooser, CSV/XLSX, density, saved views, quick filters) | Very high              | Low (component already built on the `ag-grid` branch) | Cherry-pick + wire into result sheet                          |
| 2   | Bind parameters (`:as_of_date`, `:region`)                                                                | Very high              | Medium                                                | One dataset → many dashboards instead of N duplicates         |
| 3   | Save + run inline (no navigate-away)                                                                      | High                   | Low                                                   | Stop forcing the redirect after save                          |
| 4   | Diff preview before destructive update                                                                    | High                   | Medium                                                | Removed/retyped columns warning + justification gate          |
| 5   | Cancel running query                                                                                      | High                   | Low                                                   | `pg_cancel_backend(pid)` + per-engine equivalent              |
| 6   | EXPLAIN plan toggle                                                                                       | High (for power users) | Low                                                   | Engine-aware EXPLAIN endpoint + collapsible JSON tree         |
| 7   | Per-column display name + description + format hint on DatasetField                                       | Medium                 | Low                                                   | Already partly in the schema, just expose in the field editor |

Out of scope for THIS slice (deferred):

- Schema-drift detection — needs scheduler (m15)
- Cache TTL per dataset — needs cache module (m05)
- Templates / starting points — half-day, not enough value alone
- Owner / tags / folder — search module (m17)
- Sample preview cache — runs alongside cache work

## 1. Implementation order (smallest-shippable-slices first)

Each slice gets its own commit, ships green to `version_261`,
tested via Playwright before moving on.

### Slice A — AG Grid in the result sheet

1. Cherry-pick the `us-data-grid` files from `f30b0136`.
2. Install `ag-grid-community` dep (community is enough for what we
   use; enterprise features are off).
3. Register the module in `SharedModule` so the dataset module sees
   it.
4. Replace the `<p-table>` block in add-dataset + edit-dataset
   result sheet with `<app-us-data-grid>`.
5. Map our `columnTypes` vocabulary → AG Grid `ColDef.filter` /
   `valueFormatter`:
   - `integer` / `numeric` → `agNumberColumnFilter`
   - `timestamp` / `date` → `agDateColumnFilter`
   - `boolean` → `agSetColumnFilter`
   - `text` / `json` / fallback → `agTextColumnFilter`
6. Drop the per-column input filter row we hand-rolled (AG Grid's
   floating filters do this natively, better).
7. Preserve the chevron dismiss, drag handle, sheet header.
8. Test in Chrome: header drag-reorder, column resize, density
   toggle, CSV export, XLSX export, sort, filter, scroll, copy.

### Slice B — Cancel running query (cheap, big UX win)

1. Track PG `pg_backend_pid()` per executeQuery request — capture it
   right after opening the connection, expose via in-memory map
   keyed by request id (UUID generated server-side).
2. New `POST /queries/cancel` endpoint accepting `{ requestId }`:
   - PG: `SELECT pg_cancel_backend(<pid>)`
   - MySQL: `KILL QUERY <connectionId>`
   - MSSQL: `KILL <session_id>`
   - Oracle: `ALTER SYSTEM CANCEL SQL '<sid>,<serial>'` (best-effort)
   - Snowflake: `SELECT SYSTEM$CANCEL_QUERY('<queryId>')`
3. FE: while `isExecutingQuery` is true, swap the Run button into a
   red Cancel button. Click → POST cancel with the stored
   requestId. UX matches DBeaver / DataGrip.
4. Test: paste `SELECT pg_sleep(60)` → Cancel after 2s → engine
   error surfaces with `errorKind = timeout` (or `canceled` if we
   want to add that).

### Slice C — EXPLAIN plan

1. New `POST /queries/explain` endpoint. Same payload as execute
   (datasourceId + query + safety check). Dialect-aware EXPLAIN:
   - PG: `EXPLAIN (FORMAT JSON, ANALYZE FALSE, VERBOSE TRUE) <sql>`
   - MySQL ≥ 8: `EXPLAIN FORMAT=JSON <sql>`
   - MSSQL: `SET SHOWPLAN_XML ON; <sql>` (needs separate request
     because it's a connection-mode toggle, fallback to
     `SET SHOWPLAN_TEXT ON` for older MSSQL)
   - Snowflake: `EXPLAIN USING JSON <sql>`
   - Oracle: `EXPLAIN PLAN FOR <sql>; SELECT * FROM
TABLE(DBMS_XPLAN.DISPLAY)`
2. Response: `{ engine, plan: any, raw: string }`.
3. FE: "Explain" button next to Run. Click → fires explain endpoint
   → opens a side panel with a collapsible tree of the plan.
4. Test: PG, see node list + estimated cost.

### Slice D — Bind parameters

1. New entity `DatasetParameter` per docs/implementation/DATASET.md
   §1 (id, datasetId, name, displayName, dataType, defaultValue,
   isRequired, sequence). Auto-syncs via TypeORM.
2. Tokenize `:name` references in the SQL at save time using a
   single regex that strips comments + literals first (reuse
   `blankLiteralsAndComments` from sqlSafety). Pre-extract → list of
   referenced param names → validate every reference has a matching
   DatasetParameter row.
3. `isSafeSelect` already allows `:` — add a positive whitelist
   pattern so `:name` is recognized as a bind-param token (not a
   keyword).
4. At runtime, substitute via driver bind parameters (PG `$1, $2`,
   MySQL `?, ?`, MSSQL `@p1`, Oracle `:1, :2`, Snowflake `?`).
   Never string-interpolate the values.
5. FE: New "Parameters" sub-panel on the dataset editor. List
   defined params with inline edit. "Add parameter" button shows a
   modal: name, display label, type, default value, required toggle.
6. Run button collects current param values into the request
   payload as `params: { name: value }`.
7. Test: paste `SELECT * FROM chart_demo WHERE region = :region`,
   define `region` param defaulting to 'North', run → returns only
   North rows. Re-run with 'East' → returns East rows.

### Slice E — Save + run inline

1. Currently `onDatasetDialogClose` on add-dataset navigates to
   `DATASET.LIST` after a successful save. Replace with: stay on
   page, swap to "edit" mode (or just push the new dataset id into
   the URL), show a "Saved" success toast.
2. The Run button continues to work — now firing against the saved
   SQL. No flow break.
3. Test: write SQL, click Save, dialog closes, success toast appears,
   editor still focused with the same SQL, can immediately Run.

### Slice F — Diff preview before update

1. Add `GET /datasets/:id/diff-preview` (or extend update endpoint
   to take a `dryRun: true` param). Returns:
   ```json
   {
     "added":   [{name, dataType}],
     "removed": [{name, dataType, downstreamConsumers: { analyses: n, dashboards: n }}],
     "retyped": [{name, oldType, newType}],
     "destructive": bool
   }
   ```
   `destructive = true` when any removed column has downstream
   analyses or dashboards.
2. FE: edit-dataset Save flow now opens a modal first showing the
   diff. If destructive, justification is required. Then commits.
3. Test: save dataset with same SQL → no diff modal, direct save.
   Drop a column → diff modal shows it as removed with downstream
   count.

### Slice G — Field metadata (display name + description + format)

1. Extend `DatasetField` entity with `description: text nullable`
   and `formatHint: varchar nullable`.
2. Extend `edit-dataset-fields-dialog` to expose both fields.
3. `getDataset` already returns datasetFields — no API change.
4. Test: edit a field, set description "Revenue in USD", format
   "currency:USD", reload, see persisted values.

## 2. AG Grid integration spec

### 2.1 Dep + module wire-up

```bash
npm i ag-grid-community
```

Add `AgGridModule.withComponents([])` to `SharedModule.imports`. Register
the modern community modules via `ModuleRegistry.registerModules`.

### 2.2 ColDef mapping from BE columnTypes

Helper in `add-dataset.component.ts`:

```ts
function colDefsFromResult(result: QueryResult): ColDef[] {
  return result.columns.map(name => {
    const t = result.columnTypes?.[name] ?? 'text';
    return {
      colId: name,
      field: name,
      headerName: name,
      filter: filterFor(t),
      valueFormatter: formatterFor(t),
      cellDataType: cellDataTypeFor(t),
      sortable: true,
      resizable: true,
    };
  });
}

function filterFor(t: string) {
  if (t === 'integer' || t === 'numeric') return 'agNumberColumnFilter';
  if (t === 'date' || t === 'timestamp') return 'agDateColumnFilter';
  if (t === 'boolean') return 'agSetColumnFilter';
  return 'agTextColumnFilter';
}
```

### 2.3 What we keep from the existing result pane

- Sheet header (title, row count, execution time, export, dismiss)
- Drag handle for resize
- Persisted sheet height + collapsed state
- Truncation banner + warnings strip
- Typed error card

What we delete:

- Hand-rolled per-column input filter row (AG Grid floating filters
  replace it)
- `measureColumnWidths` helper (AG Grid auto-sizes natively)
- PrimeNG `<p-table>` + `<p-paginator>` markup inside the sheet

### 2.4 Visual parity

AG Grid theme: `ag-theme-quartz` (modern) — overridden via CSS
variables to match the rest of the app:

```scss
.ag-theme-quartz {
  --ag-background-color: var(--card-background);
  --ag-foreground-color: var(--text-color);
  --ag-border-color: var(--border-color);
  --ag-header-background-color: var(--hover-background);
  --ag-row-hover-color: var(--hover-background);
  --ag-selected-row-background-color: var(--primary-color-transparent);
  --ag-font-family: inherit;
  --ag-font-size: var(--fs-control);
}
```

## 3. Live testing protocol (Playwright + Chrome DevTools)

For every slice, the cycle:

1. `npm run build -- --configuration=production` clean.
2. Drive the browser at `http://localhost:4200` with TestOrg /
   administrator / Pass@1234.
3. Run the canonical query `select * from public.chart_demo;`.
4. Exercise the new feature.
5. Inspect via `browser_evaluate` + `browser_network_request` to
   confirm DOM state + BE response shape.
6. Bug found → fix → re-test until green.
7. Commit + merge into `version_261`.

## 4. Out-of-scope reminders (don't drift)

- No new modules. m02 / m05 / m12 / m15 / m17 / m18 are owned by
  their respective slices in the build plan.
- No federation. Cross-datasource joins live in semantic layer.
- No real-time push for query results. Polling is fine.
- No WYSIWYG SQL builder duplication (type=2 already exists).
- No new authentication paths.

## 5. Branch + merge strategy

Single working branch `feature/m03-dataset-power-edit`. Each slice
A-G is a commit on this branch. Merge once everything passes.

Tag the eventual merge commit so we can revert the whole slice if a
production issue surfaces.
