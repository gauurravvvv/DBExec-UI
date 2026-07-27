# Formula Field UI — E2E Test Cases

> Target: the merged formula-field authoring surface after the calculated-field
> engine unification. Playwright 1.61, `e2e/formula-fields.e2e.ts`.
>
> Environment: FE `:4200`, BE `:3000`, warehouse pg `:5432`.
> Login `AIOrg / admin_gaurav / Pass@1234`. Dataset `dataset1` (21 base columns
> from `public.chart_demo`, plus five seeded formula fields).

## Why these cases and not others

Compilation, unit tests and the authenticated API sweep already cover the engine,
the endpoints and the payload shapes. What none of them can reach is the
**browser-only behaviour**, and today three real defects lived exactly there:

| Defect found | Why nothing caught it |
|---|---|
| `<app-field-sidebar>` appeared in **no template** | It compiled, was declared and exported — just never rendered |
| Monaco suggestions were snapshotted at dialog-open | The closure compiled fine; only observable by typing |
| `FormulaCatalogService.load()` returned an empty array to a concurrent caller | Needs two dialogs opening together |

So the cases below deliberately concentrate on **render, type, click and observe**,
not on values the API already proved.

## Selector contract

Established by reading the templates; a change here breaks the suite loudly
rather than silently.

| Element | Selector |
|---|---|
| Login org / user / pass | `#auth-account`, `#auth-username`, `#auth-password` |
| Login submit | `button[type="submit"]` |
| Add-field trigger (view-dataset) | `button.btn-add-field` |
| Dialog root | `.acf-body` |
| Field-name input | `.acf-form app-custom-input input` |
| Monaco container | `#formula-editor-container` |
| Fallback textarea (Monaco failed) | `textarea` inside `.acf-editor` |
| Validate button | `.acf-footer__validate` |
| Validation banner | `.acf-validation` |
| Stage badge | `.acf-tier app-chip` |
| Server-compute note | `.acf-tier-note` |
| Function palette categories | `.acf-categories .acf-category` |
| Palette function rows | `.acf-fn-item` |
| Palette search | `input[placeholder]` in the functions rail |
| Function preview name / usage / desc | `.acf-preview__name`, `.acf-preview__code`, `.acf-preview__desc` |
| Field list (dialog left rail) | `.acf-list li` |
| Sidebar (edit-dataset) | `.field-sidebar`, `.field-sidebar__item`, `.field-sidebar__count` |

## Test cases

### Group A — Catalog rendering (the race and the API-driven palette)

**A1 — palette renders all 12 categories**
Open the dialog on `dataset1`. Expect ≥ 12 `.acf-category` rows.
*Fails if:* the catalog request failed or `load()` handed back an empty array.

**A2 — palette totals 137 functions**
Expand every category; count `.acf-fn-item`. Expect 137.
*Guards:* the FE no longer owns a function list, so a wrong count means the
catalog payload or the render loop regressed.

**A3 — every function shows a real description**
Click three functions across different categories (`concat`, `sum`, `runningSum`).
Expect `.acf-preview__desc` non-empty and > 40 chars, and `.acf-preview__code`
to hold a usage example starting with that function's own name.

**A4 — palette search filters**
Type `round` into the function search. Expect ≥ 1 `.acf-fn-item` and every
visible row's text to contain `round` case-insensitively.

**A5 — two dialogs in one session both get a populated palette**
Open the dialog, cancel, reopen. Expect ≥ 12 categories the second time.
*This is the `shareReplay` fix.* Before it, the second open could paint nothing.

### Group B — Live field suggestions (the headline fix)

**B1 — existing fields are suggestable**
In the formula editor type `{`. Expect the Monaco suggest widget to list at least
`sales` and `profit`.

**B2 — a just-created field is suggestable WITHOUT reopening**
The critical case. In one dialog session:
1. Create and save `e2e_alpha = round({sales} * 2, 2)`.
2. Immediately open a new field dialog.
3. Type `{` and expect `e2e_alpha` in the suggestions.

*Fails if:* the completion provider snapshots its list. This is the exact defect
fixed in `bfff4f61`.

**B3 — the field being edited is not offered to itself**
Edit `margin_pct`. Type `{`. Expect `margin_pct` absent from suggestions —
a self-reference is rejected server-side, so offering it only invites a 400.

**B4 — function names complete too**
Type `conc` outside braces. Expect `concat` among suggestions.

### Group C — Validation feedback

**C1 — valid ROW formula → Row calculation badge**
Enter `round({sales} - {profit}, 2)`, click Validate. Expect `.acf-validation`
to carry the valid state and `.acf-tier app-chip` to read the Row-calculation
label.

**C2 — AGG formula → Aggregate badge**
`sum({sales})` → badge reads Aggregate.

**C3 — WINDOW formula → Window calculation badge**
`runningSum({sales})` → badge reads Window calculation.

**C4 — the server-compute note is always present when validated**
`.acf-tier-note` visible and mentions the dataset SQL escape hatch. This is the
standing statement that replaced the old pushdown tier badge.

**C5 — unknown function → positioned error**
`nope({sales})` → Validate. Expect the banner in its invalid state and the text
to name `nope`.

**C6 — arity error carries the usage hint**
`abs()` → Validate. Expect the message to mention `abs` and include a usage
example, since that is what makes the error actionable.

**C7 — injection attempt is refused in the editor**
`1; DROP TABLE chart_demo` → Validate. Expect the invalid state; the message
should reference the offending character.

### Group D — Save, store and sidebar

**D1 — save closes the dialog and the field appears with no reload**
Save `e2e_beta = concat(upper({region}), '-', {product})`. Expect the dialog to
close and `e2e_beta` to be visible in the field list **without a navigation**.
Assert the URL is unchanged and no full page load occurred.

**D2 — sidebar renders in edit-dataset**
Navigate to `edit-dataset` for `dataset1`. Expect `.field-sidebar` visible and
`.field-sidebar__count` ≥ 21.

**D3 — sidebar shows all three badge kinds**
Across `.field-sidebar__item` rows expect a Row, an Aggregate and a Window badge
(the five seeded fields cover all three).

**D4 — New-field button in the sidebar opens the dialog**
Click the sidebar's New-field action; expect `.acf-body` to appear.
*This is the `384a4f84` fix* — the dialog previously had no trigger here.

**D5 — reserved function name is rejected**
Try to save a field named `concat`. Expect an inline name error and Save to stay
disabled or the request to be refused.

### Group E — Cleanup / idempotence

**E1 — the suite removes what it created**
`e2e_alpha` and `e2e_beta` are deleted at the end so a re-run starts clean and
the dev dataset is not polluted.

## Non-goals

- Values already asserted by the 264-case engine harness and the API sweep.
- Analyses screens: they patch the store but do not render the sidebar panel yet.
- `add-dataset`: cannot author fields before the dataset has an id.
- Visual regression / pixel diffing.

## Known risks in automating this

1. **Monaco.** The editor is not a `<textarea>`; typing needs focus on the
   container and `keyboard.type`, and the suggest widget renders in a portal
   (`.monaco-list-row`, `.suggest-widget`). The dialog has a documented textarea
   fallback when Monaco fails to load, so the helper tries Monaco first and falls
   back.
2. **`app-custom-input`.** Wraps a native input; target the inner `input`.
3. **Timing.** Save is signal-driven with no navigation, so waits must be on
   content, never on `networkidle` after the save.
4. **Seeded state.** The five demo fields must exist. The spec asserts their
   presence rather than creating them, so a missing seed fails loudly with a
   clear message instead of cascading.
