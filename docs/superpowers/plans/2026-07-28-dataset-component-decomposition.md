# Dataset/Executor Component Decomposition — analysis and plan

> Status: **analysed and mapped, not executed.** Read the "Why not yet" section
> before starting — the obvious order of work is the wrong one here.

**Goal:** bring `add-dataset` (2,789), `edit-dataset` (2,541),
`monaco-intellisense.service.ts` (2,329) and `query-executor` (1,882) down to
files that fit in a reader's head.

## What is actually wrong

The files are long, but length is the symptom. Measured across
`add-dataset.component.ts` and `edit-dataset.component.ts`:

| | count | lines |
|---|---|---|
| methods in add-dataset | 96 | 2,789 |
| methods in edit-dataset | 98 | 2,541 |
| **method names present in BOTH** | **84** | — |
| … byte-identical bodies | 35 | 357 in each ⇒ ~714 duplicated |
| … same name, **drifted** bodies | 49 | 1,843 |

So the two screens are near-copies. Splitting each into helpers without
addressing that would produce twice as many files and the same duplication.

**The drift is a defect, not just debt.** 49 methods share a name and differ in
body, which means the same feature behaves differently depending on whether the
user is creating or editing a dataset. Confirmed examples:
`clampSheetHeight`, `persistSheetCollapsed`, `loadPersistedSheetState`,
`jsonCellKey`, `nullSeverity`, `exportBaseName`. Each needs a decision about
which behaviour is correct — that is product work, not mechanical extraction.

Of the 35 identical methods, only 4 (`schemaPath`, `tablePath`, `trackByName`,
`showMonacoLoadError` — 10 lines) are pure. The other 31 (357 lines) touch
component state, so they cannot become free functions; they belong on a shared
abstract base component.

## Why not yet

1. **There is no functional e2e coverage for dataset create/edit.** The suites
   that exist cover the formula dialog (16 + 37), the executor (7) and editor
   parity (1). Parity proves the editor *mounts and matches*; it does not prove a
   dataset can still be created, a schema tree expanded, a query run, or results
   exported. Refactoring 2,200 duplicated lines behind no functional tests is how
   dataset creation breaks silently.
2. **The reconciliation is a series of behavioural decisions.** Merging a drifted
   pair means picking a winner, 49 times.

Correct order: tests → reconcile drift → extract base → split the remainder.

## Plan

### Step 1 — functional e2e for dataset create and edit (prerequisite)
`e2e/dataset-workbench.e2e.ts`: pick a datasource; the schema tree loads; expand
a schema and a table; insert a column name into the editor; run the query;
results render; export CSV; save the dataset; reopen it in edit and confirm the
SQL round-trips. This is the safety net everything below depends on.

### Step 2 — reconcile the 49 drifted methods
Diff each pair, choose the correct behaviour, make both identical. Land in small
commits grouped by feature (result sheet, export, schema tree, context menu) so a
regression is bisectable to one group.

### Step 3 — extract the pure string analysis from the IntelliSense service
`services/sql-text-analysis.ts` — 9 functions, ~385 lines, verified pure or
sibling-only: `stripStringsAndComments`, `isCursorInStringOrComment`,
`parseTableReferences`, `parseCTEReferences`, `extractBalancedParens`,
`generateAlias`, `quoteIdentifier`, `getContext`, `buildAliasMap`.

Independent of steps 1–2 and covered by the existing executor + formula suites,
so this one can go first if a quick win is wanted. Do it method by method with a
`tsc` check after each: a scripted bulk extraction was attempted and abandoned
because the "include the doc comment above" heuristic can swallow an intervening
method. Move one method, compile, repeat.

### Step 4 — shared base component
`DatasetSqlWorkbenchBase` holding the 31 stateful identical methods, extended by
both screens. Expect ~700 lines to leave the two components.

### Step 5 — split what remains, by responsibility
- `DatasetSchemaTreeService` — `loadDatasourceSchemaFromAPI` (148),
  `ensureTablesLoaded` (131), `ensureColumnsLoaded` (100), `applyCachedSchemaData`,
  `markTree*`, `replaceSchemaNode`, expand/collapse state.
- `dataset-result-sheet.helper.ts` — height clamp, persistence, drag, resize
  observer.
- `dataset-export.helper.ts` — CSV/JSON client export, script export, base name.
- `dataset-result-grid.helper.ts` — column widths, profiles, JSON cell toggle,
  cell/column copy, null severity. (`dataset-result-tools.helper.ts` already
  exists and is the natural home.)

### Step 6 — Query Executor
Smaller and now single-purpose after the Monaco migration. Extract the command
palette + go-to-line overlays and the saved-query/draft persistence; leave the run
pipeline in the component.

## Explicitly NOT to split

`config/sql-dialects/*.ts` (snowflake 2,120, postgres 1,633, oracle 987, mariadb
957, mysql 941, mssql 920) and `constants/postgres-sql.constants.ts` (931) are
keyword, type and function **data**. Long is the correct shape for a data table;
splitting it adds indirection and no comprehension. Leave them.
