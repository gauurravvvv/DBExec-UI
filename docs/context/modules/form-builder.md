# form-builder
> Update the Progress log on every change.
> Code path: `src/app/modules/form-builder` · Status: 🟢 · Last updated: 2026-08-17 (Phase 8 — portability UI)

## 1. Context
- Responsibility: the FE of the **Prompt Builder** — a form *family* owning versioned Tab → Section → Field (placement) trees. An admin **designs** a draft version (drag prompts onto sections, set presentation/RBAC/rules), publishes it (freezes the runtime schema, retires the prior published sibling), and a business user **composes** a condition tree over the published version and runs it as a Query Builder. The client never builds SQL — it sends a validated JSON tree of metadata IDs; the server compiles it. Mounted lazily at `/app/form-builder`, gated on `formBuilderScreen`.
- Key files:
  - **Screen quartet:** `components/list-form` (app-custom-table + server adapter), `components/add-form` (create family), `components/view-form` (read-only detail + Design / Run links + the **Phase 8 portability header**: Export / Save-as-template / Import / Templates).
  - **Designer shell (admin)** at route `:id/design` — `components/fb-design` (3-pane shell) hosts `fb-version-bar` (draft/published state + Publish/Fork), `fb-prompt-palette` (CDK drag source of the org's prompts), `fb-canvas` → `fb-tab-strip` → `fb-section` → `fb-field-card` (the design tree), and `fb-inspector` (Design / Rules / Access / Preview tabs) → `fb-properties-panel` (`fb-prop-tab`/`fb-prop-section`/`fb-prop-field` forms + Allowed-operators multiselect), `fb-rule-builder` (+ `fb-rule-editor` — trigger AST + action), `fb-rbac-editor` (field picker → role×access grid), `fb-preview` (view-as-role read-only render).
  - **Runtime composer (business user)** at route `:id/compose` — `components/fb-compose` reuses the Query Builder runtime components via `QbRuntimeSharedModule` (`qb-filter-tree`/`qb-condition-row`/`qb-value-control`/`qb-sql-preview`/`qb-summary`); `fb-preview` renders the same composer read-only for the designer.
  - **Portability (Phase 8)** — `components/import-form-dialog` (file → JSON.parse → mirrored Zod → POST /forms/import → navigate to the new family), `components/save-as-template-dialog` (name + description → save-as-template), `components/list-form-templates` (route `templates` — the org's template gallery with a Clone-to-new-family action).
  - **Services:** `services/fb-admin.service.ts` (design-time HTTP: family CRUD, resolved version tree, tab/section/field CRUD + reorder, publish/retire/fork, rules CRUD/validate, field-RBAC CRUD, prompt-palette read), `services/fb-runtime.service.ts` (compose: schema / preview / validate / execute / count), `services/form-portability.service.ts` (Phase 8: blob export, import, save-as-template, list + clone templates), `services/form-builder-store.ts` (normalized signal store for the designer — toggle-to-deselect, reorder), `services/form-runtime-store.ts` (composer state, aliased from QueryBuilderStore).
  - **Rule logic:** `logic/ruleEngine.ts` + `logic/exprEngine.ts` (byte-identical PARITY-fenced copies of the BE engines, asserted by `logic/rule-parity.spec.ts`), `logic/ruleAst.adapter.ts` (persisted trigger AST ↔ engine Condition).
  - `models/rbac.types.ts`, `helpers/fb-operator-catalog.ts`, `helpers/fb-prompt-type-icons.ts`.
- Depends on: **datasource** (family datasource), **prompt** (the placed pieces), **query-builder** (`QbRuntimeSharedModule` — the reused tree→SQL runtime), the shared UI kit + `@ngx-translate` + `@angular/cdk/drag-drop`. Mirrored validators `formBuilder.ts` / `formStructure.ts` / `formRules.ts` / `formFieldPermission.ts` / `formCompose.ts` / **`formPortability.ts`** (byte-identical FE↔BE). `FORM_BUILDER` api/routes constants.
- Depended on by: the DBExec Studio sidebar group.
- How it works: List → Add family → **Design** (`:id/design`) edits a draft tree (structure writes are draft-only; a published version is read-only until forked) → Publish freezes the runtime schema → **Compose** (`:id/compose`) hydrates `GET /:id/schema`, the user builds a tree, `POST /preview` returns server SQL, `POST /count` then `POST /execute` return rows. **Portability**: Export streams the published (else latest) version as a `.form.json` document; Import/Clone create a NEW family + draft; Save-as-template stores a reusable org template whose payload IS an export document.
- Decisions: SQL is ALWAYS server-generated. Presentation lives on the placement as discrete typed columns (no appearance blob). Sharing is view/RBAC via field permissions. Portability documents are secretless (no org ids / host / password); import stub-resolves missing datasource/prompt bindings and reports gaps as warnings. See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints:
  - **Standalone-import gotcha:** `app-button` / `app-chip` / `app-custom-table` are standalone and imported DIRECTLY in the module (NOT re-exported by SharedModule). CDK `DragDropModule` is aliased (PrimeNG's shares the name).
  - **CVA gotcha:** `app-custom-input` / `app-custom-textarea` / `app-custom-file` fire only `(ngModelChange)` / `(fileSelected)`; only `-dropdown`/`-calendar`/`-number`/`-daterange` expose `(onChangeEvent)`.
  - **Blob-download gotcha (Phase 8):** export is requested as `{ responseType:'blob', observe:'response' }`; a FAILED export returns the JSON envelope as a Blob, so the service checks `content-type: application/json` + `status:false` and surfaces `message`. The request interceptor only unwraps envelope codes 440/501/503, so a genuine bundle Blob passes through untouched — do NOT widen the interceptor.
  - **Route order:** `templates` is registered BEFORE `:id` (and `:id/compose` / `:id/design` before `:id`) so Express-style matching doesn't treat a literal segment as a form id.
  - i18n: `FORM_BUILDER.*` (incl. `FORM_BUILDER.PORTABILITY.*`, `FORM_BUILDER.RBAC.*`, `FORM_BUILDER.VS.*`) + `validation.formBuilder.*` across all 10 locales.

## 2. Goals
- Objective: author a versioned, publishable, portable form-design layer whose published version runs as a Query Builder for non-SQL users.
- Current focus: none active — Phase 8 (portability + polish) shipped; feature complete in unit/build gates.
- Next up: a live end-to-end smoke test against a seeded org (drag-drop persistence, 3 value sources at runtime, publish→real rows) — needs a running datasource, not available in the build environment.
- Out of scope: hand-written SQL (dataset/query-runner), chart authoring (analyses).

## 3. Progress (newest first)
### 2026-08-17 — F2 fix (designer↔runtime contract drift): no FE source change needed
- **Finding:** `getFormVersion` (the design read) returned the runtime `ResolvedFieldNode` shape, so on reload the properties panel's Allowed-operators multiselect (`[ngModel]="field.allowedOperators || []"`) was empty, the field header (`field.prompt?.name`) fell back to raw `type`, and per-locale label/help overrides didn't round-trip.
- **Root cause was BE-only:** the FE `ResolvedField` type + `FormBuilderStore` (`toFieldBody`, `fieldKeys`, `createPlacement`) + `fb-prop-field` template were ALREADY authored to read `allowedOperators`/`prompt`/`localeLabels`/`localeHelps` — the BE just never sent them. The fix is a BE designer serializer (`serializers/serializeDesignFields.ts`) that enriches `getFormVersion`'s fields with the authored placement values; `store.hydrate` passes them through verbatim. **Zero FE source changes** — `form-runtime-store.ts` (the runtime path) + `fb-types.ts` untouched.
- **Test added:** `services/form-builder-store.hydrate.spec.ts` (4 jest cases) — hydrating a wire field preserves `allowedOperators` (the multiselect binds the saved set), null stays null, `prompt?.name` present, locale maps round-trip.
- **Gates: `tsc` 0 · `ngc` 0 · `jest src/app/modules/form-builder` 38/38 · `build-prod` success.** Committed on `feature/prompt-builder` (not pushed).

### 2026-08-17 — Phase 8 (FE): portability UI — export, import, templates + clone
- Added `FormPortabilityService` (signal busy state) with blob export (Content-Disposition filename + JSON-error-envelope detection, interceptor-safe), import, save-as-template, list + clone templates — copying `MigrationService`'s blob discipline verbatim.
- Three small components: `import-form-dialog` (file picker → JSON.parse → mirrored `importFormSchema` → POST /forms/import → navigate to the new family), `save-as-template-dialog` (name + description → save-as-template, validated by `saveTemplateSchema`), `list-form-templates` (template gallery + Clone-to-new-family, per-row spinner). Wired Export / Save-as-template / Import / Templates buttons into the `view-form` header + a `templates` route (before `:id`).
- Byte-identical `formPortability.ts` validator mirror created; `FORM_BUILDER.PORTABILITY.*` + `validation.formBuilder.{name,code,description}` keys added across all 10 locales.
- Gates: `tsc` 0 · `ngc -p tsconfig.app.json` 0 · `jest src/app/modules/form-builder` 27/27 · `ng build --configuration production` success (no warnings). Commit `606fbbc0` on `feature/prompt-builder` (not pushed).

### 2026-08-15 — Phase 7 (FE): runtime composer reuses the QB runtime
- `fb-compose` runtime composer + `fb-preview` designer preview, reusing the extracted `QbRuntimeSharedModule` (same tree→SQL runtime components QueryBuilderModule imports — no duplication). `FbRuntimeService` + `FormRuntimeStore` (aliased QueryBuilderStore). Gates green (tsc → ngc → jest → prod build). Commits `509f21ce`…`7295c306`.

### 2026-08-15 — Phase 6 (FE): rbac-editor + view-as-role
- `fb-rbac-editor` (field picker → role×access grid, permissive-default) + `fb-preview` view-as-role replacing the inspector stubs; `formFieldPermission.ts` FE validator byte-identical to BE; jest 27/27; prod-build green. Commits `b772fea8`…`015e6817`.

### 2026-08-15 — Phase 5 (FE): rule-builder + byte-identical engines
- `fb-rule-builder` (+ `fb-rule-editor`) inspector with live preview; byte-identical `logic/ruleEngine.ts` + `exprEngine.ts` engine copies under PARITY fences + `rule-parity.spec.ts`; `expr-eval` FE dep added; `formRules.ts` FE validator mirror. jest 27/27; parity byte-equal; prod-build green. Commits `5190f422`…`35eabc71`.

### 2026-08-15 — Phase 4 (FE): the 3-pane designer
- Full designer: shell, palette (drag source), canvas (tab-strip + sections + field-cards + layout blocks), inspector (Design live; Rules/Access/Preview later phases), properties-panel (tab/section/field forms + Allowed-operators multiselect), signal store, version bar. `formBuilder.ts` FE validator mirror confirmed byte-identical. Gates: tsc 0 · ngc 0 · jest 7/7 · prod build success. The `form-builder-store.select.spec` proves the toggle-to-deselect fix (acceptance #2), 4/4 cases. Commits `451178fb`…`ee215992`.
