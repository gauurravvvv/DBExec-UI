# DBExec-UI — UI Conventions & Design System

> The visual and structural contract every screen follows. Goal: the app
> reads as **one consistent product**, not a bag of screens. A new module
> should be indistinguishable in look and behavior from the existing ones.
> Token definitions live in `src/assets/sass/variables/_theme-variables.scss`
> (light) + `_theme_dark.scss` (dark overrides); wired in `src/styles.scss`.

---

## 1. Design tokens (the ONLY styling source)

Never hard-code a color, size, spacing, radius, or shadow. Use the CSS custom
properties. They switch light/dark automatically via `theme.service.ts`.

### Color

| Token                         | Light value            | Use                           |
| ----------------------------- | ---------------------- | ----------------------------- |
| `--primary-color`             | `#2196f3`              | primary actions, links, focus |
| `--primary-hover`             | `#1976d2`              | hover on primary              |
| `--primary-light`             | `#42a5f5`              | light accent                  |
| `--primary-color-transparent` | `rgba(33,150,243,.15)` | selected-row / chip tint      |
| `--primary-text`              | `#fff`                 | text on primary fill          |
| `--text-color`                | `#333`                 | body text                     |
| `--text-muted`                | `#6b7280`              | secondary text                |
| `--text-subtle`               | `#9ca3af`              | placeholders, hints           |
| `--secondary-color`           | `#757575`              | muted labels/icons            |
| `--secondary-background`      | `#f8fafc`              | subtle surface                |
| `--border-color`              | `#e0e0e0`              | default borders               |
| `--border-strong`             | `#c7c7c7`              | emphasized borders            |

Semantic (state) — **separate from the accent**, don't reuse as decoration:

| Token                              | Value          | Meaning             |
| ---------------------------------- | -------------- | ------------------- |
| `--success-color` / `--success-bg` | `#4caf50` / 8% | good / healthy      |
| `--warning-color` / `--warning-bg` | `#ff9800` / 8% | caution             |
| `--error-color` / `--error-bg`     | `#f44336` / 8% | error / destructive |
| `--info-color` / `--info-bg`       | `#2196f3` / 8% | informational       |

There are `-rgb` and `-transparent` variants for tints; `--primary-color-rgb`
= `33, 150, 243` for `rgba(var(--primary-color-rgb), …)`.

### Type scale (`--fs-*`)

| Token                      | Size | Use                                           |
| -------------------------- | ---- | --------------------------------------------- |
| `--fs-h1`                  | 20px | page title (one per page)                     |
| `--fs-h2`                  | 17px | section / dialog title                        |
| `--fs-h3`                  | 15px | sub-section title                             |
| `--fs-card-title`          | 14px | card / panel title                            |
| `--fs-body` / `--fs-table` | 14px | body, inputs, table cells                     |
| `--fs-control`             | 13px | sidebar rows, buttons, chips, header controls |
| `--fs-label`               | 12px | form labels, captions                         |
| `--fs-micro`               | 11px | uppercase section headers, footer             |

Weights: `--fw-regular` 400, `--fw-medium` 500, `--fw-semibold` 600,
`--fw-bold` 700. Line-heights: `--lh-tight` 1.25 (headings), `--lh-snug` 1.4
(UI rows/buttons), `--lh-normal` 1.55 (body).

### Spacing (`--space-*`, 4px- based)

`--space-0` 0 · `1` 2px · `2` 4px · `3` 6px · `4` 8px · `5` 12px ·
`6` 16px (default page padding step) · `7` 20px · `8` 24px · `9` 32px ·
`10` 40px · `11` 48px · `12` 64px. Lay out sibling groups with flex/grid +
`gap`, not per-element margins.

### Radius & shadow

Radius: `--radius-xs` 4 · `sm` 6 · `md` 8 · `lg` 12 · `xl` 16 · `2xl` 20 ·
`pill` 999px. Shadow: `--shadow-sm/md/lg/xl/overlay` (ascending elevation).

### Fonts

`--font-ui` = **Inter** (all UI), `--font-mono` = **JetBrains Mono**
(code, IDs, value chips), `--font-brand` = **Poppins** (wordmark only). Inter
runs with `font-feature-settings: 'cv11','ss03'` (cleaner small text). Apply
`tabular-nums` (class `.tabular-nums` / `[data-tabular]`) to any column of
numbers so digits align.

---

## 2. Shared component kit (`src/app/shared/components/`)

Use these instead of raw HTML or bare PrimeNG so styling stays centralized.
Declared/exported by `shared.module.ts`.

### Lists — `app-custom-table`

The single list table for the whole app.

- **Infinite scroll** (plain, not virtual), default batch **50**,
  **no page-number paginator**, **no bulk-select**.
- Server paging via `UsServerListAdapter` (`shared/components` / adapter):
  `limit 50`, sort `createdOn DESC`, search (ILIKE), filter.
- One-row toolbar slot (search + a "New <x>" button on the right).
- Hides its own header when empty; single empty-state (no double).
- Frozen first column typically a link to the view screen; last column
  Actions (View / Edit / Delete).
- Legacy `us-data-grid` (AG Grid) is **retired for lists**. AG Grid survives
  only inside the Query Executor result grid. `us-server-list-adapter` and
  `us-grid-cell.directive` are kept.

### Form controls (all support `[label]`, error display, `autocomplete`)

| Component                                                                                       | Notes                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-custom-input`                                                                              | text; `effectiveAutocomplete` getter → `'off'`, or `'new-password'` for password fields (browsers ignore `'off'` on passwords)                                                |
| `app-custom-textarea`                                                                           | multiline; monospace variant for SQL                                                                                                                                          |
| `app-custom-number`                                                                             | numeric (PrimeNG inputNumber under the hood)                                                                                                                                  |
| `app-custom-dropdown`                                                                           | single-select. `serverMode` + `[fetcher]` for lazy options with search/paging; `optionLabel`/`optionValue`; **always `appendTo="body"`** on overlays; `[filter]` + `filterBy` |
| `app-custom-multiselect`                                                                        | multi-select, same overlay rules                                                                                                                                              |
| `app-custom-checkbox` / `app-custom-binary-checkbox` / `app-custom-radio` / `app-custom-toggle` | selections                                                                                                                                                                    |
| `app-custom-calendar` / `app-custom-daterange`                                                  | dates                                                                                                                                                                         |
| `app-custom-rangeslider`                                                                        | numeric range                                                                                                                                                                 |
| `app-chip`                                                                                      | tag/badge (variant + tone); the shared chip primitive                                                                                                                         |
| `email-chips-input`                                                                             | Gmail-style editable recipient chips (alerts, dashboard subscriptions)                                                                                                        |
| `app-button`                                                                                    | button variants (primary / secondary / ghost / danger)                                                                                                                        |

### Other shared pieces

`change-password-dialog`, `confirm-leave-dialog` (unsaved-changes guard UI),
`notification-modal`, `command-modal` (⌘K palette), `global-search`,
`content-loader` / `skeleton` (loading placeholders), `echart-visual` +
`configurable-card-chart` (ECharts), `branding-watermark`, `not-found`,
`us-paginator` (legacy, avoid — lists use infinite scroll).

---

## 3. Screen structure (the module quartet)

Every feature follows the same rhythm:

- **`list-<x>`** — `app-custom-table` + toolbar with a right-aligned
  "New <x>" button. Row actions: View / Edit / Delete.
- **`add-<x>` / `edit-<x>`** — a **vertical form**, one control per row,
  ~**50% width** for short fields (100% for wide ones like SQL/description).
  Chrome: `.add-admin-wrapper` → `.page-header` → `.admin-form` →
  `.form-grid` (flex column). Reactive form; `safeParse` (Zod) before submit;
  field errors via getter methods + `handleSuccessService` for server errors.
  Implements `HasUnsavedChanges` + guarded by `unsaved-changes.guard`.
- **`view-<x>`** — read-only detail + Edit / Open buttons. On per-org screens,
  a read-only "Organisation: <name>" badge may show (informational only).

### Dialogs / popups

Confirmations (delete, etc.) use the shared **`.confirmation-popup`** overlay
pattern (backdrop + card + header + body + actions), **NOT `p-dialog`**. The
db-access styles expose a `db-access-dialog` mixin that produces the canonical
popup chrome; reuse it (`@include db.db-access-dialog;`).

### Forms & inputs

- `autocomplete="off"` on **every** `<form>` and text control.
- `appendTo="body"` on every dropdown/overlay so it isn't clipped.
- Live validation from `Validators` + `regex.constant.ts`; final validation
  from the mirrored Zod schema. The two must agree.

---

## 4. i18n (10 locales, no raw strings)

- Locale JSONs in `src/assets/i18n/`: `en, de, es, fr, it, ja, ko, nl,
pt-BR, zh-CN`. `en.json` is the source of truth.
- Every user-facing string is a `| translate` key. Never a raw literal in a
  template.
- When adding a key: add to **all 10** locales. First check if an equivalent
  wording already exists (e.g. reuse `QUERY_RUNNER.NEW_CONNECTION` /
  `MANAGE_CONNECTIONS` rather than minting `CREATE_CONNECTION`).
- Validation messages are keys too: `validation.<domain>.<field>.<rule>`,
  resolved by the locale layer on the BE and by the translate pipe on the FE.

---

## 5. State, loading, and API discipline

- New services: `@Injectable({ providedIn:'root' })` + signals. Expose
  `readonly` views (`.asReadonly()`). `loading` (reads) / `saving` (writes) /
  per-id record maps (`_deleting`, `_unlocking`) for independent row spinners.
- Signal-based calls pass `{ skipLoader: true }` so the legacy global blocker
  stays off — templates show skeletons + button spinners instead.
- Reads pipe through a cancel `Subject` cleared in `ngOnDestroy`.
- All HTTP goes through `HttpClientService`; endpoints from `api.constant.ts`;
  navigation via `routes.constant.ts` builders.
- Permissions gate routes (`role.guard` + `data.permission`) and the sidebar.

---

## 6. Accessibility & polish baseline

- Visible keyboard focus state on interactive elements.
- Respect `prefers-reduced-motion` for animations.
- `text-wrap: balance` on headings; keep running text readable width.
- Wide content (tables, code, plans) scrolls inside its own
  `overflow-x:auto` container — the page body never scrolls sideways.
- Match the surrounding code's density and idiom when editing an existing
  screen; don't introduce a second visual language.

---

## 7. The Query Executor theme (special case)

CodeMirror 6 has its own token-driven theme in
`src/assets/sass/codemirror-theme.scss`, imported globally (un-scoped, because
CM appends autocomplete/search layers to `document.body`). It reads the same
design tokens so light/dark stays consistent. The executor is the one place
allowed a denser, IDE-like treatment — but still on the token system.
