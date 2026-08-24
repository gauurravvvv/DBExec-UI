# Prompt Config Rebuild — Progress

Spec: `2026-08-21-prompt-config-rebuild-design.md`. Branch: version_261. User pushes.

## Checkpoints (newest first)

### CP1 — BE complete (2026-08-21)
- **promptConfig.entity.ts**: +`filter_operator varchar null`, +`input_constraints jsonb null` (additive, synchronize).
- **validators/prompts.ts** (mirrored FE+BE): `dataType` free-form string (NOT an enum gate — "data in any form"); `PROMPT_DATA_TYPES` exported as the canonical 7 mapping set only.
- **addPrompt / updatePrompt**: already persisted `dataType` — no change needed.
- **configPrompt.ts**: accepts `filterOperator` / `inputConstraints` / `dataType`; persists them (update + create branches); re-persists `prompt.dataType` when changed (same txn). Operator-applicability guard reuses `assertOperatorsApplicable` + `loadOperatorRows` (org-scoped filter_operator rows) → 422 `ALLOWED_OPERATORS_NOT_APPLICABLE`; unknown dataType degrades to `text` (never rejects a legit save).
- **configurePrompt.validation.ts**: light shape check — inputConstraints must be a plain object if present.
- **getPromptConfiguration**: already returns whole `{ prompt, configuration, values }` → new columns + prompt.dataType surface automatically.
- **Gate**: BE `tsc --noEmit` = 0.
- **Found (pre-existing latent bug)**: FE `prompt-config.service.load()` reads `d.prompt_schema` off `res.data` (FLAT), but BE returns NESTED `{ prompt, configuration, values }` → source/filter never re-hydrated on reopen. Will fix in FE rebuild (read `configuration.*` + `prompt.dataType`).

### CP2 — FE Add + edit (2026-08-21)
- prompt.constant.ts: PROMPT_TYPE_OPTIONS (grouped choice/input/date + icon + defaultDataType), PROMPT_DATA_TYPE_OPTIONS, DEFAULT_DATATYPE_BY_TYPE, isChoiceType, inferDataTypeFromDbType.
- add-prompt: flat ordered "Group · Widget" type list + dataType field; onTypeChange auto-seeds dataType from widget. Service add() sends dataType.
- edit-prompt: read-only Type display + editable dataType dropdown; service update() sends dataType.
- i18n: 62 new PROMPT_MODULE keys × 10 locales (TYPE_GROUP/TYPE_OPT/TYPE_HINT/DATATYPE/CFG/CONSTRAINT).
- NOTE: PrimeNG group mode didn't render through app-custom-dropdown wrapper → flattened with group-prefixed labels (grouping is cosmetic; substance intact). Added group/optionGroupLabel/optionGroupChildren passthrough + group pTemplate to the shared dropdown (harmless, kept).

### CP3 — FE single-page config builder (2026-08-21)
- PromptConfigService rewritten: dropped step machinery; added promptType/dataType/dataTypeMode/inputConstraints signals, isChoice, previewSql computed, load() reads NESTED {prompt,configuration} (fixed the latent flat-read bug), buildConfigPayload sends filterOperator/dataType/inputConstraints.
- Shell: two-column layout (accordion sections left via app-custom-accordion + sticky cp-preview-rail right). Accordion body max-height 420 + scroll; editor column + parent card bounded/scroll (per user "accordion + min/max + scroll").
- New: cp-constraints-step (family-driven min/max/step | length/pattern | date bounds), cp-preview-rail (live SQL + Run-preview sample via getPromptValuesBySQL). cp-source-step gained a dataType override dropdown.
- Operator fix (the #3 root cause chain, all fixed live):
  1. firstValueFrom(getOptions) grabbed empty initial emission → switched to persistent getFamily().subscribe().
  2. ReferenceDataService.load() built load$ but never subscribed → cold HTTP never fired → added `this.load$.subscribe()` inside load() (fixes refdata app-wide).
  3. empty-string dataType (not null) skipped the text default → coerce ''→null at the call site.
  4. operators as effect + operators.set() → NG0600 (signal write in effect) → converted to a `computed`.
- config-prompt no longer uses app-tabs (removed from module).

### CP4 — Gates + LIVE verify (2026-08-21)
- Gates: BE tsc 0 · FE tsc 0 · ngc 0 · prod build 0.
- LIVE (TestingOrg): Add "Input · Text" auto-set dataType=text; created prompt; config shows Input-constraints (not Values) for text; live SQL preview `SELECT DISTINCT pat.* FROM clinical.patients pat`; operators load 10 for text, switch to 12 numeric for number; save round-trip persisted filter_operator=eq + prompt.dataType=text (verified in dbexec_003 DB); reopen re-hydrated operator+dataType+source.
- DB: both org schemas (dbexec_003, schema_001) auto-synced filter_operator + input_constraints — NO manual DB work.

### CP5 — Height + scroll parity (2026-08-21)
- Config card now uses the canonical form-screen height contract (`:host` + `.cp` `height:100%` + `overflow:hidden`, header `flex:0 0 auto`, `.cp__builder` `flex:1; min-height:0`) instead of `max-height: calc(100vh - 96px)` magic math — matches page-form/db-access-form.
- Fixed containment: builder grid `align-items: stretch` + `overflow:hidden` so the editor cell is capped to the builder height and its `overflow-y:auto` engages (was `align-items:start` → editor grew to content 1179px > card 834px, never scrolled). Live: editor clientH 733 / scrollH 1179 → canScroll true; rail bottom within card.
- **New shared mixin `thin-scrollbar`** in `_page-skeleton.scss` (matches the modern listing table wrapper: `scrollbar-width:thin` + `scrollbar-color: var(--border-strong) transparent` + slim rounded webkit thumb, hover → `--text-subtle`). Applied to editor column, accordion body, preview rail + values list + SQL block. Reusable app-wide.
- Gate: prod build 0. Live-verified height fills viewport, thin scrollbar renders in app style.

### CP6 — Value-source repatch + styling + all-types E2E (2026-08-21)
- **Issue #1 (existing data not patched) — ROOT CAUSE:** value-source GET returned only the KIND (+ valuesSql/cardinality). static/upload option ROWS and distinct_column schema/table/column were never returned → reopen showed empty Fixed-list / Distinct pickers.
  - BE: added `promptConfig.value_source_meta jsonb` (synced both org schemas). PUT stores distinct_column `{schema,table,column,displayColumn}` (null for other kinds). GET now returns `options[]` (parsed from promptValue `value|display` rows when static) + `meta`.
  - FE `prompt-value-source.ngOnInit`: repatches `staticRows` from `data.options`, `dc*` from `data.meta`, mounts Monaco when kind=lookup on load.
- **Issue #2 (styling) fixed:** Review `<ul>` used nonexistent `--text-color-secondary` → invisible on dark → `--text-muted`. Value-source chips used `--surface-card,#fff` / `rgba(0,0,0)` fallbacks → glaring white on dark → theme tokens (`--card-background`, `--hover-background`, `--text-muted`, `rgba(--primary-color-rgb,.12)`).
- **All-types E2E (TestingOrg, datasource edcec5d6, clinical schema):** created + fully configured 5 typed prompts with complex conditions and saved via the real endpoints, then re-fetched + reopened in the UI — every field repatched:
  - multiselect/enum · diagnoses.diagnosis_code · op `in` · **distinct_column meta {clinical,diagnoses,diagnosis_code}** ✓ (was lost)
  - number/number · patients.age · op `between` · constraints {min0,max120,step1} ✓
  - daterange/datetime · encounters.encounter_date · op `between` · {earliest,latest} ✓
  - radio/enum · patients.gender · op `eq` · **static list [M/F/O]** ✓ (was lost)
  - text/text · encounters.notes · op `contains` · {minLen2,maxLen200,pattern} ✓
  - Country (dropdown) · **lookup_query** SQL ✓. Operator-applicability guard passed all (in/between/contains/eq).
- Gates: BE tsc 0 · FE tsc 0 · ngc 0 · prod build 0.

### CP7 — Fix: Table dropdown empty on reopen (source not fully patched)
- **Symptom:** reopening a configured prompt showed the Table dropdown BLANK even though `source().table` was patched — the selected value couldn't render because the dropdown's OPTIONS list was empty.
- **Root cause (init-order race):** `cp-source-step` loaded tables only at the tail of `loadSchemas()`, which ran from an effect keyed on `datasourceId` only. On reopen the shell does `datasourceId.set()` THEN `await svc.load()` (sets source.schema) — the effect fired first with schema still empty, so tables never loaded, and it never re-ran when the schema later landed.
- **Fix:** added a SECOND effect in cp-source-step reacting to `svc.source().schema` (guarded per `${dsId}::${schema}`) that loads tables regardless of ordering; removed the table load from `loadSchemas`. `onSchema` stamps the guard key to avoid a duplicate fetch. `loadTables()` writes `loadingTables` before its await → would throw NG0600 inside the effect → deferred via `queueMicrotask`.
- **Verified LIVE across all 6 prompts** (multiselect/number/daterange/radio/text/dropdown): each now `tablesCount=7`, `tableInOptions=true`, operator repatched; radio screenshot shows Table="patients" visible.
- Gates: tsc 0 · ngc 0 · prod build (backgrounded — machine load ~9; tsc+ngc AOT already green).

### DONE — awaiting user push (both repos, version_261).
