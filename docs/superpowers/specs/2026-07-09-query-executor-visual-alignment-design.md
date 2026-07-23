# Query Executor — Visual Alignment to `dataset/new`

## Context

The standalone Query Executor (`/query-runner/exec`, component
`query-runner/executor/query-executor.component.*`) will eventually replace the
dataset SQL screen (`/app/datasets/new`, `dataset/components/add-dataset`). The
user wants the executor's UI/styling to match the dataset screen as the visual
gold standard. Three surfaces are in scope (confirmed):

1. **Toolbar buttons** — currently over-boxed (every icon/label control sits in
   its own outlined pill); reads busy/"too appealing". Target: the reference's
   flat/ghost model — transparent borderless icon buttons, one gradient primary
   Run, thin group dividers.
2. **Find/replace panel** — the executor uses CodeMirror 6's default
   `search({ top: true })` panel: a flat full-width strip of plain
   `next/previous/all/match case/regexp/by word/replace/replace all` buttons.
   Target: a compact **floating card** top-right of the editor (Monaco-like):
   search field, icon-only prev/next/close, compact toggle chips, and a
   `n/total` match count. Replace row below.
3. **Object-detail modal** (`object-detail.component.scss`) — off-palette
   fallbacks (`--od-accent: …, #2f6f6a` teal; `--od-text: …, #1c2430`) and a
   heavy `0 20px 60px rgba(0,0,0,.3)` shadow. Target: app tokens + canonical
   modal chrome.

**Out of scope:** the result-grid toolbar (tabs/quick-filter/export) — user
excluded it. No editor-engine swap (executor stays CodeMirror; dataset uses
Monaco — that engine difference is _why_ the find UIs differ, and swapping is a
non-goal). No behavior/logic changes — presentation only.

Branch: `version_261` (FE only).

## Reference styling facts (from `add-dataset` + global partials)

- Tokens: `--primary-color #2196f3`, `--primary-hover #1976d2`,
  `--primary-color-transparent rgba(33,150,243,.15)`, `--hover-background #f5f5f5`,
  `--border-color #e0e0e0`, `--text-color #333`, `--text-muted #6b7280`,
  `--radius-sm 6px`, `--radius-md 8px`, `--fs-control 13px`, `--fw-semibold 600`,
  `--shadow-md 0 4px 12px rgba(0,0,0,.1)`, `--error-color #f44336`,
  `--warning-color #ff9800`, `--motion-base 200ms`.
- Reference button model (`add-dataset.component.scss`):
  - **Primary Run** (`.btn-run`): 135° gradient `#2196f3→#1976d2`, `--radius-sm`,
    `color #fff`, soft `0 4px 10px rgba(33,150,243,.15)` shadow, `translateY(-1px)`
    hover → `--shadow-md`.
  - **Ghost icon/text buttons** (`.btn-export`, `.btn-dataset`, `.btn-danger`):
    `background: transparent; border: none; color: <semantic>`; hover keeps
    transparent bg, `opacity .8`. Colored by role (primary blue / warning amber /
    error red).
  - **Bordered secondary** (`.btn-explain`): white bg + `1px --border-color`,
    hover → `--hover-background` bg + primary border/text.
- Global CM theme already exists at `src/assets/sass/_codemirror-theme.scss`
  (tokenised `.cm-editor`, `.cm-panel.cm-search`, autocomplete). The executor
  inherits it; the default-panel _layout_ is what still reads generic.

## Design

### Approach (toolbar) — retone in place

Chosen: rewrite the `.qx-*` button SCSS to the reference ghost model. No HTML
change (buttons already carry `qx-icon-btn` / `qx-labeled-btn` / `qx-run-btn`
classes; PrimeNG variant classes stay for behavior). Rejected: (B) swap to
`p-button-text` + reference class names — needs touching every button in HTML +
re-testing all actions, same visual result; (C) extract a shared toolbar-button
mixin — invents an abstraction neither screen has (YAGNI).

### Section 1 — Toolbar buttons (`query-executor.component.scss`)

- `.qx-icon-btn` (wrap, explain, minimap, palette, shortcuts, overflow, Run-all,
  Stop): **transparent background, no border**, `color: --text-muted`. Hover:
  `--hover-background` tint + `--primary-color` icon (no border). Active/toggle
  (`.qx-active`): `--primary-color` icon + faint `--primary-color-transparent`
  tint, still borderless. Stop danger hover: `--error-color` icon + `--error-bg`.
  Disabled: `opacity .45`.
- `.qx-run-btn`: keep gradient primary (already matches reference `.btn-run`);
  align shadow to `0 4px 10px --primary-color-transparent`, keep hover lift.
- `.qx-labeled-btn` (Format): flat text button — transparent, `--text-color`,
  hover → `--primary-color` (drop the white bg + border pill).
- `.qx-limit` (row-limit) & `.qx-mode-toggle` (Read-only/Write): keep as the
  only subtle bordered controls (they wrap an input / carry a state color).
  These mirror how the reference keeps its datasource pill/badge subtle. Mode
  toggle keeps amber write-state.
- `.qx-sep`: keep the thin `1px` group dividers — they carry structure once the
  per-button borders are gone.

Result: toolbar goes from ~8 outlined boxes → flat icon row + one gradient Run

- subtle dividers.

### Section 2 — Find/replace floating widget

The executor keeps CM6's `@codemirror/search@6.7.0`, but swaps the default
panel for a **custom panel** via `search({ top: true, createPanel })`. A new
small builder module (`executor/search-panel.ts`) returns a CM `Panel` whose
DOM is a compact card:

```
row 1: [ 🔍 Find…            ]  [Aa] [.*] [\bw]   n/total   ‹  ›  ✕
row 2: [ Replace…            ]  ↵ replace   ⇊ all
```

- Wires to `@codemirror/search` commands: `findNext`, `findPrevious`,
  `replaceNext`, `replaceAll`, `closeSearchPanel`, and `getSearchQuery` /
  `setSearchQuery` (+ `SearchQuery`) to read/update search + toggles.
- Match count derived by counting `SearchQuery.getCursor(state)` matches
  (capped, e.g. 999+) and current index from the selection.
- Toggle chips = case / regexp / whole-word, backed by `SearchQuery` flags.
- Panel positioned as a floating card via SCSS: `.cm-panels.cm-panels-top`
  becomes `position: absolute` (top-right, `--radius-md`, `--shadow-md`,
  `--border-color`), inside the editor host which is `position: relative`.
- All existing shortcuts keep working (`searchKeymap` unchanged): Mod-F opens,
  Esc closes, Enter = next.
- i18n: reuse existing `QUERY_RUNNER.*` keys where present (REPLACE, etc.); add
  keys for Find/Replace placeholders + toggle titles + match-count as needed,
  filled across all 10 locales.

### Section 3 — Object-detail modal retone (`object-detail.component.scss`)

- `--od-accent` fallback teal `#2f6f6a` → `#2196f3`; `--od-text` fallback
  `#1c2430` → `var(--text-color)`; keep primary chain first
  (`var(--primary-color, …)`), just fix the fallbacks so no teal/darker text can
  ever surface.
- Modal shadow `0 20px 60px rgba(0,0,0,.3)` → `var(--shadow-xl)` (+ `1px` ring),
  overlay `rgba(0,0,0,.45)` → `var(--overlay-background)`, `border-radius: 10px`
  → `--radius-lg`. Aligns to the canonical app modal chrome.

## Files

- `query-runner/executor/query-executor.component.scss` — Section 1 button
  retone + Section 2 floating-panel positioning.
- `query-runner/executor/query-executor.component.ts` — swap `search({ top:true })`
  → `search({ top:true, createPanel })`.
- `query-runner/executor/search-panel.ts` — **new**: custom CM search panel
  builder (icon nav, toggle chips, match count, replace row).
- `query-runner/executor/object-detail.component.scss` — Section 3 retone.
- `assets/i18n/*.json` (×10) — any new find/replace panel keys.

No BE change. No HTML restructure of the toolbar.

## Verification

- `npx tsc --noEmit -p tsconfig.app.json` clean; `ng build --configuration
production` green.
- Live on :4210 (BE :3010), executor at `/query-runner/exec?conn=<id>`:
  - Toolbar reads flat: borderless icon buttons, one gradient Run, dividers
    between groups; hover/active/disabled states correct; Read-only↔Write still
    toggles (amber in write). Compare side-by-side to `/app/datasets/new`.
  - Mod-F opens the floating find card top-right; type → highlights + match
    count; ‹ › nav; toggles (case/regex/word) work; Replace + Replace-all work;
    Esc / ✕ close. No full-width strip.
  - Object-detail modal (open from an object in the tree): blue accent, app
    text color, canonical shadow/overlay/radius — no teal, no heavy shadow.
- Commit as one FE slice on `version_261`, not pushed. Standard trailer.
  Exclude `environment.ts` / `environment.dev.ts`.

## Constraints (standing)

- FE :4210 ↔ BE :3010; never commit `environment.ts` / `environment.dev.ts`.
- Never push; user pushes. Don't touch sidebar styling. App tokens only; no new
  dependency (CM6 search API already present).
