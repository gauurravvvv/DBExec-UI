# Prompt Configuration — Rebuild (single-page builder, type-driven, dataType-filtered operators)

> Design spec. Status: approved (brainstorm 2026-08-21). Full-stack, additive, legacy-safe.
> Repos: `dbexec-ui` (Angular 18) + `dbexec-api` (Express/TypeORM). Branch: `version_261`.

## 1. Problem

Three user-reported issues, all tracing to one root cause.

1. **UX dissatisfaction.** Config today is a 4-step linear wizard (Source → Joins →
   Column & Filter → Values) that reads like assembling a SQL query piece by piece.
2. **Types feel incomplete at Add.** The Add screen offers a flat 9-item English-label
   dropdown; the config screen then treats every type identically (a Text prompt still
   shows a value-options picker it can't use).
3. **Operators don't load** in the Column & Filter step.

### Root cause (verified in code)

A prompt has **two** dimensions, and only one is wired:

- **`type`** — the runtime widget (dropdown/text/calendar…). Add collects this (9 options).
- **`dataType`** — the logical data type (`text|number|date|datetime|bool|enum|uuid`). The
  `prompt.entity.ts` column comment says it *"drives operator applicability"* — but **Add
  never collects it and the config screen never uses it.**

That gap causes #2 and #3:

- **#3 has two stacked bugs.** (a) `cp-column-filter-step` uses
  `firstValueFrom(refData.getOptions('filter_operator'))`, which subscribes to a
  `BehaviorSubject`-backed stream, grabs its **empty initial `{}` emission**, maps to `[]`,
  and resolves before the real data arrives. Every other consumer in the app
  (`alerts`, `analyses/filter-dialog`, `rls-rules`, `form-builder`) uses
  `.getFamily(...).subscribe()` — a persistent subscription — and works. (b) Even if it
  loaded, the prompt path's fallback uses **stale UPPERCASE codes** (`EQUALS`,
  `meta.filterType`) while the authoritative seed + Form Builder + BE compiler all use
  **lowercase codes** (`eq`, `meta.dataTypes`) filtered by `dataType`.
- **#2** — the config can't adapt to type because `dataType` (the thing operators key on)
  is never captured, and Values-vs-input is not type-gated.

### Ground truth (confirmed while brainstorming)

- `filter_operator` seed rows (BE `seedReferenceData.ts`) carry lowercase `code`
  (`eq`, `neq`, `contains`, …) and `meta = { feValue, filterTypes, arity, sqlTemplate,
  valueTransform, dataTypes }`. `dataTypes` gates applicability (`*` = all). **The seed is
  already correct — no seed change needed.**
- The Form Builder already filters operators by `dataType` with
  `operatorOptionsFromCatalog(rows, dataType)` (`fb-operator-catalog.ts`), mirroring the BE
  `applicableOperatorCodes` / `assertOperatorsApplicable`
  (`operatorApplicability.helper.ts`). The prompt config path does **not** reuse this.
- `POST /prompts/:promptId/values/preview` **already returns sample value rows** (limit
  param). No new sample endpoint is needed.
- `configPrompt` persists to `promptConfig` (schema/tables/columns/filterExpr/selectExpr/
  operator/joinEdges/…). It does **not** touch `dataType` (lives on `prompt`) or any
  input-constraints (no such column yet).

## 2. Goals / Non-goals

**Goals**
- One-page config builder with a persistent live preview — no wizard/steps.
- Type drives the layout: choice types show Values; input types show Input constraints;
  the two are mutually exclusive.
- Collect `dataType` (auto-infer from column DB type, manual override); operators filter
  by `dataType` via the Form Builder's proven catalog rule.
- Fix operator loading (persistent subscribe; delete stale uppercase fallback).
- Persist input constraints; enforce operator applicability server-side.

**Deferred (v1 limitation)**
- True auto-inference of `dataType` from the *selected source column's* DB type
  is deferred — it needs column-type metadata keyed to the specific column, which
  the source section doesn't fetch today. v1 defaults `dataType` from the widget
  at Add and exposes an **editable dataType dropdown in config** (override). This
  still fully fixes #2/#3 (operators filter by dataType; dataType is editable).
  `inferDataTypeFromDbType()` is implemented and ready for when column metadata is
  wired.

**Non-goals (YAGNI for v1)**
- No auto-run value sample (Run button only).
- No server-authored SQL-preview string (client builds the preview; server compiler
  remains authoritative at run time).
- No new prompt widget types beyond the existing 9 (they are regrouped, not extended).
- No change to the query-builder compiler.
- Type is chosen at Add; **read-only in config** (editable only via edit-prompt).

## 3. Decisions (locked in brainstorm)

| # | Decision |
|---|---|
| D1 | Config model = **single-page builder + sticky live-preview rail** (not tabs/steps). |
| D2 | **Type drives everything** — choice→Values, input→Input-constraints, mutually exclusive. |
| D3 | Collect **both** `type` + `dataType`; **dataType drives operators**; dataType auto-infers from the column, override allowed. `dataType` is **free-form** (accept data in any form) — the 7 logical types are a canonical mapping set, not a whitelist; unknown types degrade to `text` for operator applicability, never rejected. |
| D4 | **SQL preview live** (client-side), **value sample on-demand** (Run button, reuse `values/preview`). |
| D5 | **Full-stack**: reconcile operator vocab end-to-end, add dataType + input_constraints, align consume contract. Additive/legacy-safe. |
| D6 | Reuse the Form Builder catalog contract (`operatorOptionsFromCatalog` FE, `operatorApplicability.helper` BE). **No seed change.** |
| D7 | Reuse `POST /:promptId/values/preview` for the sample; **no new endpoints.** |

## 4. Add screen (FE)

Same page skeleton (card, `.back-button`, top-right Cancel/Save) and same first three
fields (Datasource, Name, Description). Two changes to type capture:

**Control type** — grouped/iconized `app-custom-dropdown` (`group=true`), i18n labels +
PrimeIcon + one-line hint, organised into three groups (the existing 9, regrouped):
- **CHOICE**: Dropdown · Multi-select · Radio · Checkbox
- **INPUT**: Text · Number · Range slider
- **DATE**: Calendar · Date range

**Data type** (new) — `app-custom-dropdown` over `text|number|date|datetime|bool|enum|uuid`,
auto-infer-with-override:
- On Add (no column yet) default from control type:
  dropdown/radio/multiselect→`enum`, checkbox→`bool`, text→`text`,
  number/rangeslider→`number`, calendar→`date`, daterange→`datetime`. Labeled
  "Auto — refine in config."
- Required in the mirrored `prompts` Zod validator (default keeps the form valid).

`PROMPT_TYPES` moves from a flat constant to a grouped model (`PROMPT_TYPE_GROUPS`) with
`{ value, labelKey, icon, group, defaultDataType }`. Labels become i18n keys ×10 locales.

## 5. Type → section matrix

Fixed spine (**Source**, **Filter**) + **one** type-dependent section
(**Values** *or* **Input constraints**). Source gated by `isSelectable`; Filter by
`isFilterable`.

| Control type | dataType (default) | Source | Filter (operators by dataType) | Values (options) | Input constraints |
|---|---|---|---|---|---|
| Dropdown | enum | ✅ | ✅ | ✅ manual/SQL/upload | — |
| Multi-select | enum | ✅ | ✅ (`in`/`not_in`) | ✅ manual/SQL/upload | — |
| Radio | enum | ✅ | ✅ | ✅ manual/SQL/upload | — |
| Checkbox | bool | ✅ | ✅ (`eq`/`is_null`) | ✅ fixed toggles | — |
| Text | text | ✅ | ✅ (`contains`/`starts_with`) | — | ✅ `{minLen,maxLen,pattern}` |
| Number | number | ✅ | ✅ (`gt`/`between`) | — | ✅ `{min,max,step}` |
| Range slider | number | ✅ | ✅ (`between`) | — | ✅ `{min,max,step}` |
| Calendar | date | ✅ | ✅ (`before`/`after`) | — | ✅ `{earliest,latest}` |
| Date range | datetime | ✅ | ✅ (`between`) | — | ✅ `{earliest,latest}` |

Rules:
- Values and Input-constraints are **mutually exclusive**, chosen by type family.
- Filter operators come from `ReferenceDataService` **filtered by `dataType`** via
  `operatorOptionsFromCatalog` → lowercase codes matching the seed + BE enforcement, so a
  saved config can never trip `ALLOWED_OPERATORS_NOT_APPLICABLE`.
- Source always present (every prompt binds a column); Filter optional.

## 6. Single-page layout & live preview (FE)

Two-column builder replacing the stepper shell:

- Left = editor (scrolls); right = **sticky preview rail** (~40%).
- Header: back button + title + **Save** (no Back/Next stepper buttons). Identity strip:
  name · control type · dataType (Auto/Override).
- Sections are collapsible groups (all open by default, no forced order, remember collapse):
  **Source** (schema/table/column/alias + "+ Add related table" = existing
  `prompt-join-builder`), **Filter** (column · operator · value), and the one
  type-dependent section.
- **SQL preview** = client-side `composePreviewSql()` mirroring the compiler's
  SELECT/FROM/JOIN/WHERE from the structured state + existing `buildFilterExpr`. Live,
  no network, labeled "generated at run time" (server compiler stays authoritative).
- **Value sample** = **Run ▷** button → `POST /:promptId/values/preview` (limit 200);
  shows rows + count + a "stale" hint when config changed since last run. Choice types only.
- **Operators** load via persistent `.getFamily('filter_operator').subscribe()` (fixes the
  `firstValueFrom` race), filtered by `dataType`.

**Component decomposition** (each ≤ ~300 lines, reads/writes per-instance
`PromptConfigService` signals):
`config-prompt` shell · `cp-source-section` · `cp-filter-section` ·
`cp-values-section` · `cp-constraints-section` · `cp-preview-rail`.
Remove `currentStep`/`stepValid`/`goto`/`next`/`back` from `PromptConfigService`; add
`dataType`, `dataTypeMode` ('auto'|'override'), `inputConstraints`, and a
`composePreviewSql()` computed.

The `<app-tabs>` tab-view added earlier is superseded by the single-page layout and is
removed from config-prompt (the shared `TabsComponent` itself stays for settings/etc.).

## 7. Backend changes (dbexec-api)

Additive, legacy-safe (per-org `synchronize`; no migration files).

1. **Persist `dataType`.** Extend mirrored `prompts` Zod validator to accept/require
   `dataType`; set it in `addPrompt` + `updatePrompt`. `configPrompt` re-infers/persists
   `dataType` to `prompt.dataType` (same txn) when the source column changes.
2. **Input constraints + persisted operator.** Add `input_constraints jsonb null` to
   `promptConfig`. `configPrompt` reads `inputConstraints` from the body + saves;
   `getPromptConfiguration` returns it. A mirrored validator addition validates shape **by
   dataType family** and rejects a value-picker payload on an input type (and vice-versa).
   Also add `filter_operator varchar null` to `promptConfig`: today the operator is baked
   into the compiled `prompt_where` and NOT persisted, so on reopen the operator dropdown
   can't pre-select (config-service seeds `operator: ''`). Persist the operator code so a
   saved config re-hydrates (Section 10 test #5). `prompt_where` is still built from it at
   Save for the compiler; the new column is the source-of-truth for the UI dropdown.
3. **Operator-vocab reconcile.** Reuse `operatorApplicability.helper.ts`
   (`applicableOperatorCodes`/`assertOperatorsApplicable`) inside `configPrompt` to validate
   the chosen operator is applicable to `dataType`, returning the same
   `ALLOWED_OPERATORS_NOT_APPLICABLE` 422 as form-builder. **No seed change.** On the FE,
   delete the stale UPPERCASE fallback in the prompt path and read operators via
   `operatorOptionsFromCatalog` + the existing lowercase fallback.
4. **Preview / sample.** Reuse `POST /:promptId/values/preview` (sample rows). SQL preview
   stays client-side. **No new endpoints.**
5. **Consume-contract alignment.** `getPromptConfiguration` returns `dataType` +
   `inputConstraints` + structured filter (`filter_expr`, `operator`, `join_edges`) in the
   shape `ResolvedField.prompt` and the QB runtime read. Read-shape/DTO addition only; no
   compiler change.

**Net BE footprint:** 2 new nullable columns on `promptConfig` (`input_constraints jsonb`,
`filter_operator varchar`); `dataType` wired through add/update/config; operator-applicability
guard in `configPrompt` (reusing the helper); mirrored validator extensions. No new endpoints,
no migrations, no seed changes.

## 8. Data flow

```
Add: user picks control type → default dataType inferred → POST /prompts
     { datasource, name, description, type, dataType }

Config (single page):
  Source: schema/table/column (+joins) → on column change, re-infer dataType
          (unless override) → PATCH persisted at Save
  Filter: column + operator(list filtered by dataType) + value
  Values | Constraints (by type family)
  SQL preview: composePreviewSql() live, client-side
  Sample:   Run ▷ → POST /prompts/:id/values/preview { limit:200 }
  Save:     POST /prompts/:id/config
            { schema, tables, columns, selectExpr, filterExpr, operator,
              joinEdges, requiredJoins, dataType, inputConstraints }
            → BE: assertOperatorsApplicable(operator, dataType) or 422
                  persist promptConfig + prompt.dataType
```

## 9. Error handling

- Operators empty → persistent subscribe + lowercase fallback map (never empty).
- Operator not applicable to dataType at Save → BE 422 `ALLOWED_OPERATORS_NOT_APPLICABLE`;
  FE surfaces the toast; the FE list is pre-filtered so this should be unreachable in
  normal flow (defense-in-depth).
- Sample query fails (bad column mid-edit) → preview rail shows the error inline; editor
  unaffected.
- Input constraints wrong shape for family → BE validator 400 (mirrored FE safeParse first).
- Join builder → keep the 2026-08-21 infinite-loop fix (seed is inbound-only).

## 10. Testing / verification

- **BE gate:** `tsc --noEmit`. New/changed: operator-applicability guard in configPrompt;
  input_constraints round-trip (config → getConfig); dataType persisted on add/config.
- **FE gate (all three):** `tsc --noEmit` → `ngc -p tsconfig.app.json --noEmit` →
  `ng build --configuration production`.
- **Mirrored validators** byte-identical FE↔BE (prompts.ts, promptConfig/configurePrompt).
- **Live (TestingOrg / gaurav.goel / Pass@1234, :4200):**
  1. Add each family (choice/input/date) → dataType default correct.
  2. Config a Dropdown on `sales.orders`: operators populate (fix #3), SQL preview live,
     Run shows samples, Save persists.
  3. Config a Text prompt → Values hidden, Input-constraints shown (fix #2).
  4. Config a Number prompt → number operators (`gt`/`between`), min/max/step persist.
  5. Reopen a saved config → dataType, operator, constraints re-hydrate.

## 11. i18n

New keys ×10 locales: control-type group headers + labels + hints, dataType labels,
Input-constraints field labels (min/max/step/length/pattern/earliest/latest), preview-rail
labels (SQL / Sample values / Run / stale), "Auto/Override". Reuse existing operator labels
(DB catalog) and `COMMON.*`.

## 12. Rollout / migration

- New `promptConfig.input_constraints`, `promptConfig.filter_operator`, and use of
  `prompt.dataType` are nullable/additive; existing rows load with `null` → treated as
  "no constraints" / operator re-derived-or-blank / dataType inferred at next config. No
  data migration.
- The old stepper steps + `<app-tabs>` config usage are removed; no route change
  (`/app/prompts/:id/configure` stays).
