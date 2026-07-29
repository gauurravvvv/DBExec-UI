# add-dataset ↔ edit-dataset drift — measured, classified, decisions needed

> Status: **measured. Six decisions needed before the base class can be extracted.**
> Supersedes the drift numbers in `2026-07-28-dataset-component-decomposition.md`,
> which counted byte-identical bodies and therefore over-counted.

## The numbers, corrected

The earlier plan reported 84 shared methods / 35 identical / **49 drifted**. That
compared bodies byte-for-byte, so a reformatted comment counted as drift. Measured
again with whitespace normalised, and then a second time with comments and the
`AddDatasetComponent` / `EditDatasetComponent` static prefix neutralised:

| | count |
|---|---|
| methods in add-dataset | 104 |
| methods in edit-dataset | 104 |
| shared method names | 89 |
| identical (whitespace-normalised) | 54 |
| drifted | 35 |
| … of which **cosmetic only** (comments + `SELF.` prefix) | **15** |
| … of which **real code drift** | **20** |
| add-only methods | 15 |
| edit-only methods | 15 |

So the reconciliation is **20 pairs**, not 49 — and 4 of those 20 differ only in
brace style. The real decision count is **16**, of which 10 have an obvious winner
and **6 need a product call**.

Reproduce with the two scripts used here (`/tmp/methods.js`, `/tmp/drift.js` in the
session — re-derivable from the method-boundary regex `^  (private|public|…)? name(`
plus a `^  }$` terminator).

## Group 1 — brace style only, no behavioural difference (4)

`toggleJsonCell`, `persistSheetHeight`, `persistSheetCollapsed`,
`onSheetHandleKeydown`. add-dataset uses block braces, edit-dataset single-line.
Pick add-dataset's (the codebase's prevailing style) and move on. No decision.

## Group 2 — correctly different, must NOT be merged (5)

These share a name and genuinely should not share a body. They stay overridden on
each subclass, and the base class must not assume either shape.

| Method | Why the difference is right |
|---|---|
| `ngOnInit` | add reads `datasourceId` / `schema` query params and bootstraps a preselected datasource; edit subscribes to `route.params` and fetches the dataset by id. Different entry contracts. |
| `onDatasetDialogClose` | add POSTs a new dataset and navigates to the list; edit commits an update and honours `pendingSaveAndRun`. |
| `executeQueryForDatasource` | add resets `expandedJsonCells`; edit calls `restoreColumnState()`. Each screen's result grid has a different memory. |
| `loadDatasourceSchemaFromAPI` | add filters the tree to `scopedSchema` and calls `syncEditorReadOnlyState()` — scoped launch is an add-only feature. edit hoists `getDbTypeFor` into a local, which is a free win worth copying to add. |
| `replaceSchemaNode` | same reason: the `syncEditorReadOnlyState()` call is add-only. |

`ngOnDestroy` is a sixth case but is downstream of decision **D3** below — see there.

## Group 3 — obvious winner, no product call needed (5)

| Method | Winner | Reason |
|---|---|---|
| `getFilteredSchemas` | **edit** | Signature is `any[] \| undefined` instead of `any[]`. Strictly safer; the body already handles undefined in both. |
| `applyCachedSchemaData` | **add** | add resolves dbType via `getDbTypeFor(dbId)`; edit hard-codes `selectedDatasourceObj?.config?.dbType`, which is wrong the moment more than one datasource is in the IntelliSense cache — it tags every cached schema with the *currently selected* dialect. |
| `getDbTypeFor` | **add** | add searches `availableDatasources` then `preloadedDatasources` before falling back to the selected record. edit keeps only the fallback, so it returns null for any datasource that isn't the selected one. Same root cause as the row above. |
| `hasUnsavedChanges` | **edit's shape, add's semantics** | edit returns `hasQueryChanged` (diff against the loaded original). add has no original, so `!isQueryEmpty && !_saved` is the only thing it can compute. Keep both, but rename so the base class doesn't imply one definition. |
| `ensureTablesLoaded` | **add** | add carries a `background` flag and an `if (tablesStatus === 'loading') return;` re-entry guard, and marks the node loading before firing. edit has neither, so two rapid expands of the same schema fire two identical requests. See D4 — this is a real defect, not a style difference. |

## The six decisions

### D1 — SQL file upload size limit: 2 MB or 22 MB?
`onFileSelected` — add-dataset caps at `maxSizeInMB = 2`, edit-dataset at `22`.
The comment directly above edit-dataset's constant reads
`// Validate file size (e.g., max 2MB)`, so **22 is almost certainly a typo for 2**
and the user-facing message interpolates the wrong number today.
**Recommendation: 2 in both.** Flagging rather than assuming, because raising the
cap may have been deliberate and unlabelled.

### D2 — `insertColumnName`: does the `public` schema get a prefix?
Clicking the same column in the explorer inserts different text:

- add-dataset: `chart_demo.sales` (drops the prefix when schema is `public`)
- edit-dataset: `public.chart_demo.sales` (always qualifies)

**Recommendation: add-dataset's.** `public` is on the default `search_path`, so the
prefix is noise in the overwhelmingly common case, and the dataset SQL is
hand-written and read often. Against that: always-qualified is unambiguous if the
`search_path` is non-default. Either is defensible; they should not both ship.

### D3 — edit-dataset has no SQL validator and no formatter. Intended?
`initMonaco` in add-dataset registers `sqlFormatterService.registerFormattingProvider()`,
`registerContextMenuActions(editor)`, and `sqlValidatorService.validate` /
`validateDebounced`. edit-dataset registers **none** of them, and correspondingly
`ngOnDestroy` disposes them in add-dataset only. So when editing an existing
dataset there are no validation markers and no Format SQL action — on the screen
where the SQL is most likely to be long and inherited.

This is the largest functional gap the diff turned up. **Recommendation: register
them in edit-dataset too**, which makes both `initMonaco` and `ngOnDestroy`
mergeable. It is a behaviour *addition* to edit-dataset, which is why it needs your
call rather than mine.

Related, and separable: edit-dataset's `initMonaco` binds Ctrl+Enter via
`this.editor.addCommand(...)`. `docs/context/HANDOFF.md` records that Monaco's
`addCommand` **and** `addAction` measurably do not bind in this app, and that
shortcuts must go through `CodeEditorService.addShortcut`. So that binding is dead
code today; Ctrl+Enter in edit-dataset does nothing. Worth confirming in a browser
before deleting it, since the measurement was taken on a different screen.

### D4 — the missing in-flight guard in `ensureTablesLoaded`
Covered in group 3 as an obvious winner, raised here because it is a live defect
rather than debt: expanding a schema twice quickly in edit-dataset fires two
identical `listSchemaTables` calls. Given the open datasource-connection-pool
blocker, duplicate requests are not harmless. **Recommendation: take add-dataset's
guard.** Confirming there is no reason edit deliberately re-fetches.

### D5 — page-size preference: remembered on create, forgotten on edit
`onResultsLazyLoad` — add-dataset calls `persistPageSize(limit)` when the page size
changes; edit-dataset just assigns `resultRows`. So choosing 100 rows sticks on the
create screen and silently resets on the edit screen.
**Recommendation: persist in both** (add-dataset's behaviour), sharing one storage
key so the choice carries across the two screens.

### D6 — exported filename
`exportBaseName` — add-dataset names the file after the datasource; edit-dataset
prefers `datasetName`, then `selectedDatasourceName`, then the datasource.
**Recommendation: edit-dataset's chain**, which degrades to add-dataset's answer
when there is no dataset name, so one implementation serves both.

## Order of work once D1–D6 are answered

1. Group 1 + group 3 (9 methods) — mechanical, compile-gate is sufficient.
2. D1, D4, D5, D6 — small, self-contained, one commit each.
3. D2, D3 — user-visible; land separately so either can be reverted alone.
4. Extract `DatasetSqlWorkbenchBase` with the 54 identical + the reconciled
   methods. Group 2's five stay overridden.
5. Then the responsibility split (schema tree service, result sheet, export,
   result grid) per the 2026-07-28 plan.

## What the compile gate cannot tell us

`tsc` and `ngc` both pass on either side of every pair above — both bodies are
type-correct. The production build adds only AOT and lazy-import checks. So for
steps 2–4 there is no automated signal at all until
`e2e/dataset-workbench.e2e.ts` exists. That suite is listed as step 1 of the
2026-07-28 plan and remains the honest prerequisite: it is what makes a wrong
winner fail loudly instead of silently.
