# 09 · RLS & Column Security

> Row + column security in one place. DBExec ships row-level rules
> today. Column masking, dynamic data masking, and impersonation
> are missing.

**Depends on:** Dataset (03), Query Compiler (04)
**Unblocks:** Embed multi-tenancy (14), Compliance (GDPR/HIPAA)
**Maturity:** 🟡 row-level only

---

## 1. Industry baseline

- **Looker** — `access_filter` per field; per-user-attribute injection.
- **Tableau** — User filters (row level) + permission roles.
- **Power BI** — RLS via DAX expressions; OLS (object-level security).
- **Metabase** — Sandboxes (table-level), connection impersonation.
- **Superset** — Native RLS via `RowLevelSecurityFilter`.
- **Snowflake** — Row access policies + dynamic data masking.

## 2. DBExec today

- `rls_rule` table with scope=user|group, operator IN/NOT_IN/EQUALS/BETWEEN,
  values array.
- Applied at SQL compile time as `WHERE` predicates.
- No column-level security.
- No DDM (dynamic data masking).

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| RLS-G01 | Column-level security (hide column) | P0 |
| RLS-G02 | Column masking (substring / hash / category) | P0 |
| RLS-G03 | User attributes (e.g. `region`, `client_id`) → injected into predicates | P0 |
| RLS-G04 | Connection impersonation (run as DB user X) | P1 |
| RLS-G05 | Test-as-user (admin previews what user X sees) | P0 |
| RLS-G06 | Group-level overrides | P1 |
| RLS-G07 | "Allow override for owner" | P1 |
| RLS-G08 | Audit row per RLS predicate fired | P1 |
| RLS-G09 | Composable rule expressions (AND/OR across rules) | P1 |

## 4. Target architecture

### 4.1 Column security schema

```sql
CREATE TABLE column_security (
  id            uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  dataset_id    uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  scope         varchar(16) NOT NULL,         -- user | group | role
  scope_id      uuid NOT NULL,
  column_name   varchar(255) NOT NULL,
  action        varchar(16) NOT NULL,         -- hide | mask
  mask_pattern  varchar(255),                  -- 'XXXX-XXXX-{last4}'
  is_enabled    boolean NOT NULL DEFAULT true,
  UNIQUE (dataset_id, scope, scope_id, column_name)
);

-- User attributes (Looker-style)
CREATE TABLE user_attribute (
  id            uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name          varchar(64) NOT NULL,         -- e.g. 'region'
  type          varchar(16) NOT NULL,         -- string|number|array
  default_value text,
  UNIQUE (organisation_id, name)
);
CREATE TABLE user_attribute_value (
  user_id       uuid NOT NULL,
  attribute_id  uuid NOT NULL REFERENCES user_attribute(id),
  value         text NOT NULL,
  PRIMARY KEY (user_id, attribute_id)
);
```

### 4.2 Compile-time injection

```ts
// shared/services/security.compiler.ts
export class SecurityCompiler {
  apply(
    sql: string,
    dataset: Dataset,
    caller: AuthCtx,
  ): { sql: string; bindings: unknown[]; projection: ProjectionRewrite } {
    const rules = await this.loadRowRules(dataset.id, caller);
    const cols  = await this.loadColumnRules(dataset.id, caller);
    const userAttrs = await this.loadUserAttributes(caller.userId);

    const predicates = rules.map(r => this.renderRow(r, userAttrs));
    const bindings: unknown[] = [];

    const projection = this.rewriteProjection(sql, cols);

    const wrapped = predicates.length > 0
      ? `SELECT * FROM (${sql}) base WHERE ${predicates.join(' AND ')}`
      : sql;
    return { sql: wrapped, bindings, projection };
  }

  private renderRow(rule: RlsRule, attrs: Record<string, unknown>): string {
    // Support `{{user.region}}` style substitution.
    let values = rule.values;
    if (Array.isArray(values) && values.some(v => typeof v === 'string' && v.startsWith('{{'))) {
      values = values.map(v => {
        const m = /^\{\{user\.(\w+)\}\}$/.exec(String(v));
        return m ? attrs[m[1]] : v;
      });
    }
    switch (rule.operator) {
      case 'in':      return `${q(rule.columnName)} IN (${list(values)})`;
      case 'not_in':  return `${q(rule.columnName)} NOT IN (${list(values)})`;
      case 'equals':  return `${q(rule.columnName)} = ${lit(values[0])}`;
      case 'between': return `${q(rule.columnName)} BETWEEN ${lit(values[0])} AND ${lit(values[1])}`;
    }
  }
}
```

Column rewriting:

```ts
private rewriteProjection(sql: string, rules: ColumnRule[]): ProjectionRewrite {
  // For SELECT *, expand to actual columns then mask/hide.
  // For an explicit projection, rewrite in place.
  return {
    hide: rules.filter(r => r.action === 'hide').map(r => r.columnName),
    mask: rules.filter(r => r.action === 'mask')
              .map(r => ({ col: r.columnName, pattern: r.maskPattern! })),
  };
}
```

Then the executing layer (after fetching rows) drops or masks:

```ts
function applyProjection(rows: Record<string, unknown>[], p: ProjectionRewrite) {
  if (!p.hide.length && !p.mask.length) return rows;
  return rows.map(r => {
    const o: Record<string, unknown> = { ...r };
    for (const h of p.hide) delete o[h];
    for (const m of p.mask) o[m.col] = applyMask(o[m.col], m.pattern);
    return o;
  });
}
```

### 4.3 Mask patterns

```
XXXX-XXXX-{last4}      → 'XXXX-XXXX-1234'  (last 4 chars preserved)
{first2}***            → 'Jo***'           (first 2 preserved)
{hash}                 → '8a1f3b...'       (SHA-256 hex)
{category}             → 'medium'          (numeric bucket: low/medium/high)
[REDACTED]             → '[REDACTED]'      (constant)
```

```ts
function applyMask(v: unknown, pattern: string): unknown {
  if (v == null) return v;
  const s = String(v);
  return pattern
    .replace(/\{last(\d+)\}/g, (_, n) => s.slice(-Number(n)))
    .replace(/\{first(\d+)\}/g, (_, n) => s.slice(0, Number(n)))
    .replace(/\{hash\}/g, crypto.createHash('sha256').update(s).digest('hex').slice(0, 12))
    .replace(/\{category\}/g, () => categorise(Number(s)));
}
```

### 4.4 Test-as-user

Admin can preview what user X sees:

```
POST /dataset/:id/preview-as { userId: '<uuid>' }
```

Backend swaps the caller in the SecurityCompiler call. UI shows a
banner: "Previewing as Alice (member of group APAC)".

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST   | `/column-security` | Add column rule |
| PUT    | `/column-security/:id` | Update |
| DELETE | `/column-security/:id` | Delete |
| GET    | `/column-security/list/:datasetId` | List |
| POST   | `/user-attributes` | Define attribute |
| GET    | `/user-attributes/list` | List |
| PUT    | `/user-attributes/value` | Set value for user |
| POST   | `/dataset/:id/preview-as` | Test-as-user |

## 6. UI specs

### 6.1 Dataset → Security tab

Side-by-side panels: **Rows** (existing RLS) and **Columns** (new).
Column panel shows the dataset's columns; admin clicks "Add rule" on a
column and picks Hide / Mask + scope + scope target.

### 6.2 User attributes admin

Org Settings → User attributes:

- Define attribute (name, type, default).
- Assign per-user values.
- Reference in RLS rule values as `{{user.attr_name}}`.

### 6.3 Test-as-user

Above the dataset preview, dropdown "View as: [me ▾]". Pick another
user; the preview re-runs. Banner reminds the admin.

## 7. Code recipes

### 7.1 Wiring into the existing dataset preview

```ts
// src/modules/datasets/controllers/datasetPreview.ts
export default async function datasetPreview(req, res) {
  const ds = await loadDataset(req.params.id);
  const caller = res.locals.previewAs
    ? await loadAuthCtx(res.locals.previewAs)
    : res.locals.authCtx;

  const sec = await securityCompiler.apply(ds.sql, ds, caller);
  const pool = await pools.acquire(ds.datasourceId);
  const { rows, columns } = await pool.query(sec.sql, sec.bindings);
  const safeRows = applyProjection(rows, sec.projection);
  const safeCols = columns.filter(c => !sec.projection.hide.includes(c.name));

  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    rows: safeRows, columns: safeCols,
  });
}
```

## 8. Test plan

- **RLS-COL-H-01** — user without column access sees mask
- **RLS-COL-H-02** — admin sees raw column
- **RLS-COL-H-03** — `{{user.region}}` substitutes user's attribute value
- **RLS-COL-N-01** — mask pattern with unknown placeholder errors loudly
- **RLS-COL-E-01** — user with both group rule + user rule → strictest wins (intersection)
- **RLS-TEST-H-01** — admin "View as" preview shows user-scoped rows

## 9. Migration & rollout

1. Add `column_security` + `user_attribute(_value)` tables.
2. Compiler refactor: extract `SecurityCompiler` shared by row + column.
3. UI: Dataset Security tab; Org Settings User Attributes.
4. Test-as-user behind admin permission check.

## 10. Open questions

- Should column masking apply only to the projection or also to
  WHERE / GROUP BY? A masked column shouldn't be usable as a filter
  by the masked user. Recommend: also block the column from the
  filter picker for that user.
