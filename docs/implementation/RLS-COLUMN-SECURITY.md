# RLS & column security

> Implementation companion to research module 09. Pins the
> entity model, the resolver, the masking strategy, the FE
> author UI, and the integration hook points across modules 04
> (query processor), 06 (analysis), 08 (dashboard), 13 (export),
> 14 (share), and 25 (AI).

**Status:** 🔴 not in product. P0 — without it we cannot ship to
any customer with shared data sensitivity (most enterprises).
**Effort:** L (~3 weeks).

---

## 0. Problem statement

Three customers share a dataset of all sales transactions. Sales
rep A sees only her territory; sales rep B sees only his
region; sales VP sees everything; finance sees everything but
with PII columns masked. One dataset, four read shapes. The
shape **must** be enforced server-side, query-processor-deep —
not at the FE.

We ship two complementary mechanisms:

- **Row-level security (RLS):** rules that compile to `WHERE`
  predicates. Always **restrictive** (subtract rows; never
  add).
- **Column-level security:** rules that mask or drop columns
  from `SELECT`. Supports `null`, `hash`, `partial` (last 4
  digits), `redact` (literal `'***'`).

---

## 1. Data model

### 1.1 `rls_rule`

```sql
CREATE TABLE rls_rule (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id   UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  kind         TEXT NOT NULL                         -- 'group' | 'attribute' | 'sql'
                 CHECK (kind IN ('group', 'attribute', 'sql')),
  -- when kind='group': predicate applies when user is in this group
  scope_group_id  UUID REFERENCES "group"(id),
  -- when kind='attribute': predicate applies when user has this attribute
  scope_attr_key  TEXT,
  scope_attr_op   TEXT,                                 -- 'eq' | 'in' | 'ne'
  scope_attr_value JSONB,                               -- string / array
  -- predicate template; supports {{user.<attr>}} interpolation
  predicate    TEXT NOT NULL,
  -- if no rule's scope matches → "default policy"
  is_default   BOOLEAN NOT NULL DEFAULT false,
  default_policy TEXT NOT NULL DEFAULT 'deny'           -- 'deny' (no rows) | 'allow'
                 CHECK (default_policy IN ('deny', 'allow')),
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rls_dataset ON rls_rule(dataset_id);
CREATE INDEX idx_rls_group   ON rls_rule(scope_group_id);
```

### 1.2 `column_security`

```sql
CREATE TABLE column_security (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id   UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  column_name  TEXT NOT NULL,
  mode         TEXT NOT NULL                         -- 'hide' | 'null' | 'hash' | 'partial' | 'redact'
                 CHECK (mode IN ('hide', 'null', 'hash', 'partial', 'redact')),
  partial_keep INTEGER,                                 -- for partial: keep last N chars
  scope_kind   TEXT NOT NULL                         -- 'all_except_group' | 'all_except_attribute' | 'all'
                 CHECK (scope_kind IN ('all_except_group', 'all_except_attribute', 'all')),
  scope_group_id UUID REFERENCES "group"(id),
  scope_attr_key TEXT,
  scope_attr_value JSONB,
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_colsec_dataset ON column_security(dataset_id);
```

### 1.3 `user_attribute`

```sql
CREATE TABLE user_attribute (
  user_id   UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     JSONB NOT NULL,
  source    TEXT NOT NULL DEFAULT 'manual'             -- 'manual' | 'sso' | 'scim'
              CHECK (source IN ('manual', 'sso', 'scim')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX idx_user_attr_user ON user_attribute(user_id);
```

User attributes are how RLS rules say "filter to the user's
territory" without hardcoding territory mappings into rules.

### 1.4 `rls_test_case` (built-in QA)

```sql
CREATE TABLE rls_test_case (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id   UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES "user"(id),
  expected_row_count_min INTEGER,
  expected_row_count_max INTEGER,
  expected_sample_query TEXT,                           -- optional SQL whose row count should match
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  last_run_at  TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_actual_rows INTEGER
);
```

Used by the admin "Test RLS" panel and a nightly cron — catches
the "rule looked right at publish, now wrong" regression.

---

## 2. The resolver

`src/services/rls/resolver.ts`. The single trusted authority.
Every read path passes through it.

```typescript
import { Connection } from 'typeorm';
import { ExprNode, Plan } from '../query/ir';
import { AuthUser } from '../../types';

export interface RlsResolution {
  predicates: ExprNode[];        // ANDed into plan.where
  maskedColumns: Record<string, ColumnMaskDecision>;  // applied to plan.select
  ruleIds: string[];             // for audit log
  empty: boolean;                // true = "default deny, no rules matched" → 1 = 0
}

export interface ColumnMaskDecision {
  mode: 'hide' | 'null' | 'hash' | 'partial' | 'redact';
  partial_keep?: number;
}

export async function resolveRls(
  connection: Connection,
  datasetId: string,
  user: AuthUser,
): Promise<RlsResolution> {
  const rules = await connection.getRepository('RlsRule').find({
    where: { datasetId, isEnabled: true },
    order: { displayOrder: 'ASC' },
  });

  const matchedRules = [];
  let defaultRule: any = null;
  for (const rule of rules) {
    if (rule.isDefault) { defaultRule = rule; continue; }
    if (await matchesScope(rule, user, connection)) {
      matchedRules.push(rule);
    }
  }

  // If user matched no rules and there's a default-deny → empty
  if (matchedRules.length === 0) {
    const policy = defaultRule?.default_policy ?? 'deny';
    if (policy === 'deny') {
      return {
        predicates: [{ type: 'lit', value: false }],
        maskedColumns: {},
        ruleIds: defaultRule ? [defaultRule.id] : [],
        empty: true,
      };
    }
  }

  // Compile each matched rule's predicate (with user-attr interpolation)
  const predicates: ExprNode[] = [];
  for (const rule of matchedRules) {
    predicates.push(await compilePredicate(rule, user, connection));
  }

  // Column security
  const colRules = await connection.getRepository('ColumnSecurity').find({
    where: { datasetId, isEnabled: true },
  });
  const maskedColumns: Record<string, ColumnMaskDecision> = {};
  for (const cr of colRules) {
    if (await shouldMaskForUser(cr, user, connection)) {
      maskedColumns[cr.columnName] = {
        mode: cr.mode,
        partial_keep: cr.partialKeep,
      };
    }
  }

  return {
    predicates,
    maskedColumns,
    ruleIds: matchedRules.map((r: any) => r.id),
    empty: false,
  };
}
```

`matchesScope` for the three rule kinds:

```typescript
async function matchesScope(rule: any, user: AuthUser, connection: Connection): Promise<boolean> {
  if (rule.kind === 'group') {
    return user.groupIds.includes(rule.scope_group_id);
  }
  if (rule.kind === 'attribute') {
    const attrs = await loadUserAttributes(connection, user.id);
    const value = attrs[rule.scope_attr_key];
    return matchOp(rule.scope_attr_op, value, rule.scope_attr_value);
  }
  if (rule.kind === 'sql') {
    // 'sql' rules apply to everyone; the predicate template itself differentiates
    return true;
  }
  return false;
}
```

`compilePredicate` interpolates `{{user.<key>}}` against the
user's attributes and parses the result into the IR. **Never
string-templates into the SQL** — we always go through the
IR so SQL injection via attribute value is impossible.

---

## 3. Masking implementation

The renderer (module 04) takes `maskedColumns` from the resolver
and rewrites `SELECT` items in-place:

```typescript
function applyMasking(
  selectItems: SelectItem[],
  masked: Record<string, ColumnMaskDecision>,
): SelectItem[] {
  return selectItems
    .filter(s => !(s.origin?.kind === 'raw' && s.origin.column && masked[s.origin.column]?.mode === 'hide'))
    .map(s => {
      if (s.origin?.kind !== 'raw' || !s.origin.column) return s;
      const decision = masked[s.origin.column];
      if (!decision) return s;
      switch (decision.mode) {
        case 'null':
          return { ...s, expr: { type: 'lit', value: null } };
        case 'hash':
          return { ...s, expr: { type: 'fn', name: 'SHA256', args: [s.expr] } };
        case 'partial':
          return {
            ...s,
            expr: {
              type: 'fn', name: 'CONCAT',
              args: [
                { type: 'lit', value: '***' },
                { type: 'fn', name: 'RIGHT',
                  args: [s.expr, { type: 'lit', value: decision.partial_keep ?? 4 }] },
              ],
            },
          };
        case 'redact':
          return { ...s, expr: { type: 'lit', value: '***' } };
        default:
          return s;
      }
    });
}
```

`hide` actually drops the column from the result set. The dim
or metric editor (module 06) hides masked columns from authors
who lack the unmasking role.

---

## 4. API surface

```
POST   /rls/rule/add                            { datasetId, name, kind, ... }
PATCH  /rls/rule/update/:id
DELETE /rls/rule/delete/:id
GET    /rls/rule/list/:datasetId
POST   /rls/rule/reorder

POST   /column-security/add                     { datasetId, columnName, mode, scope... }
PATCH  /column-security/update/:id
DELETE /column-security/delete/:id
GET    /column-security/list/:datasetId

POST   /rls/test/run                            { datasetId, userId }
POST   /rls/test/case/add
POST   /rls/test/case/run-all/:datasetId         -- nightly cron also hits this

GET    /user-attribute/list/:userId
PATCH  /user-attribute/upsert                   { userId, key, value, source }
```

---

## 5. Controller stub (add RLS rule)

```typescript
// src/controllers/rls/addRlsRule.ts
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { RLS_MSG, GENERIC } from '../../constants/response.messages';
import { auditLogger } from '../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../constants/audit.constants';
import { validatePredicate } from '../../services/rls/predicateValidator';
import Logger from '../../utility/logger';

const addRlsRule = async (req: Request, res: Response) => {
  const { datasetId, name, kind, scopeGroupId, scopeAttrKey, scopeAttrOp,
          scopeAttrValue, predicate, isDefault, defaultPolicy, displayOrder } = req.body;
  const { orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    // Predicate must parse against an AST whitelist
    const v = await validatePredicate(predicate, datasetId, connection);
    if (!v.ok) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, RLS_MSG.BAD_PREDICATE,
                          { errors: v.errors });
    }

    // Only one default rule per dataset
    if (isDefault) {
      const existingDefault = await connection.getRepository('RlsRule')
        .findOne({ where: { datasetId, isDefault: true } });
      if (existingDefault) {
        await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, RLS_MSG.DUPLICATE_DEFAULT);
      }
    }

    const rule = await connection.getRepository('RlsRule').save({
      datasetId, name, kind, scopeGroupId, scopeAttrKey, scopeAttrOp,
      scopeAttrValue, predicate, isDefault: !!isDefault,
      defaultPolicy: defaultPolicy ?? 'deny',
      isEnabled: true, displayOrder: displayOrder ?? 0,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.RLS_RULE,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'RlsRule',
      entityId: rule.id,
      metadata: { datasetId, kind, name, isDefault, defaultPolicy },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, RLS_MSG.CREATED, rule);
  } catch (err: any) {
    Logger.error(`Add RLS rule failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default addRlsRule;
```

---

## 6. FE — author UI

A new tab inside the dataset edit screen: **Security**.

```
┌──────────────────────────────────────────────────────────────┐
│  Dataset: Sales 2026                           [Security]     │
│                                                                │
│  Row-level rules        Default policy: ◉ Deny ○ Allow         │
│  ─────────────────────────────────────────────────────────    │
│  1. Sales reps see own territory     [Group: sales_rep]   ✏︎ ⤓ │
│      territory = {{user.territory}}                            │
│  2. Regional managers see region    [Group: regional_mgr] ✏︎ ⤓ │
│      region = {{user.region}}                                  │
│  3. Executives see all              [Group: executive]    ✏︎ ⤓ │
│      TRUE                                                       │
│                                                                │
│  + Add row-level rule                                          │
│                                                                │
│  Column masks                                                   │
│  ─────────────────────────────────────────────────────────    │
│  ssn                  Mode: redact          [All except finance]│
│  customer_email       Mode: partial (4)     [All except sales]  │
│  + Add column mask                                              │
│                                                                │
│  Test as user [▼ Sales rep – Alice (APAC)        ]  [Run test] │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Predicates applied:  territory = 'APAC'                  │ │
│  │ Columns hidden:      ssn                                  │ │
│  │ Columns masked:      customer_email → ***@***@***1234     │ │
│  │ Sample rows visible: 1,247 of 18,394                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Components:

```
src/app/modules/datasets/components/
├── rls-rules-panel/
├── rls-rule-editor/           # modal
├── column-security-panel/
├── column-security-editor/    # modal
└── rls-test-runner/           # "Test as user" widget
```

---

## 7. Integration points

| Module | Where RLS is applied | How |
|---|---|---|
| 04 Query processor | every plan via `applyRls(plan, user)` before render | resolver is called once per dataset reference |
| 06 Analysis builder | author preview also runs through processor | author sees data **as themselves**, not as everyone — by design |
| 08 Dashboard live mode | every visual tile re-queries with viewer's RLS | resolver re-runs per request |
| 13 Export & 15 Scheduling | renderer runs as the *subscription owner* (documented in [PER-TAB-SCHEDULED-EXPORTS.md](PER-TAB-SCHEDULED-EXPORTS.md) §14) | RLS resolved with owner's auth context |
| 14 Share / Embed | for `internal` shares: viewer's RLS; for `embed`: the JWT-bound subject's RLS | per-link resolution |
| 25 AI Insights | sanitiser drops PII columns from semantic-model description; tool calls run with user's RLS | doubly defended |

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_rls_resolve_ms` | histogram | `dataset` | resolver latency |
| `dbexec_rls_predicates_per_query` | histogram | `dataset` | how many predicates layered |
| `dbexec_rls_empty_total` | counter | `dataset`, `user_kind` | how often default-deny fires — leading indicator of misconfigured rules |
| `dbexec_rls_test_run_total` | counter | `outcome` | nightly cron health |
| `dbexec_column_mask_applied_total` | counter | `column`, `mode` | masking usage |

Audit-log every RLS resolution? **No** — too noisy. Instead, the
`query.execute` audit row includes
`metadata.rls = { ruleIds, predicateCount, maskedColumns }` so a
single audit query reconstructs the security context of any read.

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| Author writes a predicate that drops nothing (`1=1`) | Linter warns at save; auditor flags "always-true predicate" on review |
| Author writes a predicate that references a table outside the dataset | Predicate AST whitelist rejects unknown identifiers |
| User-attribute injection via SSO | Attributes coerced to string/array primitives at write; never interpreted as SQL |
| Cache poisoning — user A's RLS-restricted result served to user B | Cache key includes a hash of resolved RLS rule IDs + predicate values (module 05) |
| Bypass via dataset SQL editor (CTE renaming) | RLS resolver works on parsed AST; CTE shadowing handled by name-resolution walk |
| Default-policy flip without audit | Toggle between deny/allow writes an audit row with both before/after values |
| Group membership lookup race | Group memberships read once per query, in the same connection / tx; subsequent membership changes affect the *next* query |
| Mask bypass via direct dataset SQL preview | Preview also passes through resolver; no escape hatch |
| Privilege escalation via predicate that references `user_attribute` directly | Predicate parser blocks references to `user_attribute` table — attributes are interpolated, not joined |
| Mask + aggregate leakage (`AVG(salary)` reveals one masked salary) | Documented limitation — k-anonymity tags on metrics (k=5 minimum count) is a future-work item; flag in 11 |

---

## 10. Operational runbook

**Symptom: user complains "I see no data".**
1. Run `/rls/test/run` as the user against the dataset.
2. Result shows `empty: true` → user matched no rule.
   Diagnosis: check group memberships and user_attribute values.
3. Result shows `predicates: ['(false)']` → default-deny fired.
   Diagnosis: rule scope conditions don't match this user.

**Symptom: user complains "I see *too much* data".**
1. Run `/rls/test/run` for the user.
2. Inspect predicates — usually a rule's predicate template
   interpolates an attribute the user doesn't have, defaulting
   to NULL, which makes `column = NULL` evaluate FALSE → no
   filter applied to that disjunct.
3. Fix: make user attribute mandatory; rule predicate must
   handle NULL with `COALESCE(...)` or an explicit "deny if
   attribute missing" rule.

**Symptom: nightly RLS test suite has 3 failures.**
1. Read `rls_test_case.last_run_actual_rows` — outside the
   expected range = the rule changed or the data changed.
2. If a rule changed legitimately, update the test case.
3. If not — the rule was inadvertently weakened. Roll back via
   module 18 (version history).

**Symptom: query times spike.**
1. Inspect `dbexec_rls_resolve_ms` — usually a slow
   `loadUserAttributes` because the user has thousands of
   attributes. Add a per-user attribute count limit (default
   200) at SCIM ingest.

---

## 11. Performance budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| resolveRls (cold) | 12 ms | 40 ms | 150 ms |
| resolveRls (cached attributes) | 3 ms | 10 ms | 30 ms |
| Group membership lookup | 2 ms | 8 ms | 25 ms |
| Test-as-user end-to-end | 200 ms | 800 ms | 3 s |
| Nightly suite (200 cases) | 5 min | 15 min | 1 h |

Attribute lookup is the hot path. Cache per-request in
`AsyncLocalStorage` so one query touches user_attribute at most
once.

---

## 12. Migration & rollout

1. **Migrations:** create `rls_rule`, `column_security`,
   `user_attribute`, `rls_test_case`. All idempotent.
2. **Backfill `user_attribute` from SSO claims** when SSO is
   reconfigured (module 10 hook).
3. **Feature flag:** `feature.rls_v2`. The resolver short-circuits
   to "no rules, allow all" when the flag is off, preserving
   today's behaviour.
4. **Per-dataset opt-in:** datasets default to "no rules". An
   org admin must add the first rule. Auto-enable rules on a
   dataset once the first rule is added.
5. **Soak:** apply rules to one dataset first; verify with the
   test runner; roll wider.
6. **Test-suite enforcement:** module 19 admin dashboard
   surfaces "datasets with RLS rules but no test cases" as a
   compliance gap.

---

## 13. Open questions

1. **K-anonymity on aggregates** — block `COUNT(...)` results
   below k. v2.
2. **Time-bounded RLS** — "Alice sees data through 2025-12-31".
   Add `valid_from` / `valid_to` columns.
3. **Cross-dataset attribute inheritance** — should attributes
   set on a parent group cascade? v2; keep it explicit for now.
4. **Predicate suggestion AI** — let the LLM propose RLS rules
   from a natural-language description. Defer; high-risk.

---

## 14. References

- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- [03-dataset.md](../research/modules/03-dataset.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- PostgreSQL RLS docs (comparison point — we don't use native PG RLS because we span dialects)
- Looker access_filter docs
