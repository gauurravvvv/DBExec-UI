# rls-rules
> Update the Progress log on every change.
> Code path: `src/app/modules/rls-rules` · Status: 🟡 · Last updated: 2026-07-24

## 1. Context
- Responsibility: Row-Level Security + column security authoring. A rule targets a dataset; **securityType** = `row` (condition filters) or `column` (masked columns). Rules are assigned to users/groups. Enforced server-side at query time via the BE `rlsResolver.service.ts`.
- Key files:
  - `components/{list,add,edit,view}-rls-rule` — the CRUD quartet. add/edit hold: securityType toggle (row→`conditions[]`, column→`maskedColumns[]`), operator dropdown (IN / NOT_IN / EQUALS / BETWEEN — DB-driven family `rls_operator`), column-value autocomplete (distinct-values cache), mask-strategy options for column security, and the `assignments[]` (users/groups) editor.
  - `components/manage-rls-assignments` — assignment panel; **there is no separate assignments endpoint** — it loads the rule, mutates `assignments[]`, and PUTs the whole rule back.
  - `services/rls-rules.service.ts` — signal-state HTTP. Uses `RLS_RULE` constants.
- Depends on: **dataset** (a rule binds to a datasetId; column-value autocomplete pulls distinct values), **groups** + **users** (assignment targets), **datasource** (list filter). Mirrored Zod `validators/rls.ts`.
- Depended on by: BE query engine (`rlsResolver` folds resolved filters into dataset/analysis queries + cache key). Analyses/dashboard inherit the enforcement transparently.
- How it works: List = `app-custom-table`, **ungated** across the whole org (was hard-gated on a datasource picker; now shows all rules with Datasource + Dataset columns + optional datasource filter — `GET /rls-rules` LIST_ALL, relation-joined, `datasetName`+`datasourceName` flattened onto each row). Add/edit → POST/PUT `/rls-rules`; the rule carries its `conditions`/`maskedColumns` + `assignments` inline. Enforcement is 100% BE: `resolveRlsFilters` turns a user's assigned rules into WHERE clauses at query time.
- Decisions: assignments-on-the-rule (no separate endpoint). List ungated with a Datasource/Dataset column + optional filter (list-pattern-alignment, c47aef13). Operators DB-driven. See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints — **three real BE defects the FE cannot fix (rls_known_defects), any RLS work must know these:**
  - **RLS-P0-1 allow-by-default:** a user with ZERO rules on a dataset sees EVERY row (`rlsResolver.service.ts:46` returns `[]`). This is data exposure, inverse of deny-by-default.
  - **RLS-P1-1 BETWEEN degrades to EQUALS:** the resolver hard-maps operators to EQUALS/DOES_NOT_EQUAL (`:82`), so a BETWEEN rule silently becomes EQUALS-against-first-value. Ranges are NOT enforced as authored — the FE offers BETWEEN but it doesn't work end-to-end.
  - **RLS-P2-1 ad-hoc endpoints bypass RLS:** `executeQuery.ts` (query-runner) + `runQuery.ts` (datasource preview) run raw SQL without `resolveRlsFilters` — anyone with query-execute can `SELECT *` past all rules.
  - FE-only: dropped a dead `excludeDefault` user-picker param (3d0f5626).

## 2. Goals
- Objective: Author row/column security rules, assign to principals, and have them enforced consistently on every read path.
- Current focus: — none active on the FE (the open items are BE resolver defects).
- Next up: BE fixes for the three defects (deny-by-default flag + per-dataset policy column; correct all 4 operators; route ad-hoc endpoints through the resolver). FE would then need to surface a per-dataset default-policy control.
- Out of scope: DB-native GRANT/REVOKE (that's db-access), app RBAC (role/users/groups).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full RLS authoring UI — row conditions + column masking, DB-driven operators, user/group assignments inline on the rule, distinct-value autocomplete. List ungated + org-wide with Datasource/Dataset columns + optional filter (c47aef13, new BE `GET /rls-rules` listAllRules). Visual-builder RLS column security wired (323060be). Reference-data DB-driven dropdowns (3d27b282). Enforcement is fully server-side via `rlsResolver`.
- In progress / Known issues: **Status 🟡** because three confirmed BE resolver defects (RLS-P0-1 allow-by-default, RLS-P1-1 BETWEEN→EQUALS, RLS-P2-1 ad-hoc bypass) mean the authored rules are not enforced as a user would expect. FE offers BETWEEN + implies deny-by-default but the BE doesn't honour either. Verify defects still present before recommending fixes.
- Next: BE resolver hardening (see Next up).
- Files touched: docs/context/modules/rls-rules.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/rls-rules`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/rls-rules.md
