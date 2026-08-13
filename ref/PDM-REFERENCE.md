# PDM Reference — PostgreSQL Data-access Management (db-access)

> Canonical, durable reference for the `db-access` module (BE `src/modules/db-access`,
> FE `src/app/modules/db-access`). Read this before touching either screen.
> **Full rationale + phasing:** `dbexec-api/docs/superpowers/specs/2026-08-10-pdm-postgres-access-mgmt-prd.md`.
> **Mirror:** an identical copy lives at `dbexec-ui/ref/PDM-REFERENCE.md` — edit both together.

---

## 1. What the module is

A per-datasource UI over PostgreSQL's **native** security model (roles/users, memberships,
object privileges, ownership, RLS visibility, live sessions). It is a **second, separate** system
from DBExec's application RBAC (`role` / `system-roles` / `permissions`). In Postgres a "user" IS a
role (differs only by `LOGIN`).

**Two screens (structure unchanged — do NOT touch the sidebar):**
- **Database Users & Roles** — `list-db-roles` + `add/edit/view-db-role` (perm `dbRoles`).
- **Database Roles and Privileges** — `privileges-access` + `sessions` (perm `dbPrivileges`).
- Shared reads accept either (`PERM_ANY`).

## 2. Non-negotiable invariants

1. **Stateless about DB state.** PostgreSQL is the ONLY source of truth for what grants exist. The
   SINGLE persisted exception is `db_role_template` (reusable role/privilege recipes — §7 D10); it
   stores *intent*, never a mirror of live grants. No `db_role_mapping` / `db_access_audit`.
2. **No raw SQL from the client, ever.** The FE sends structured intent; `pgSqlBuilder` composes SQL;
   every identifier is `quoteIdent`-quoted, every literal `quoteLiteral`-escaped.
3. **One data contract, read identically everywhere.** Never invent field names per screen. (The
   `Object/Type = —` bug came from `view-db-role` binding `row.object`/`row.objectType` while the API
   returns `schema`/`table`/`privilege`/`via`.)
4. **Show the SQL; gate the danger.** Every write previews masked SQL; destructive → badge + reason;
   critical → typed-name confirm.
5. **Reflect current state, apply the diff** for memberships and privileges.
6. **Everything lazy + server-searchable**; trees lazy-expand via API. `app-custom-table` on every grid.

## 3. Canonical contracts (bind these EXACT fields)

### Effective privilege row
```ts
interface EffectivePrivilegeRow {
  schema: string; table: string; column?: string | null;
  privilege: string; grantable: boolean;
  via: string; // 'direct' | '<roleName>'
}
```

### Lazy tree node
```ts
interface PrivTreeNode {
  id: string; kind: 'schema' | 'table' | 'column';
  label: string; count?: number; hasChildren: boolean;
  privileges?: { privilege: string; via: string; grantable: boolean }[];
}
```

### Preview response (returned by ALL write endpoints on `previewOnly`)
```ts
interface PreviewResponse {
  summary: string[];   // plain-English lines
  masked: string[];    // exact SQL, password-masked
  statements: { sql: string; isDestructive: boolean;
                dangerClass: 'none'|'destructive'|'critical'; dangerReason?: string }[];
  isDestructive: boolean;
  requiresTypedConfirm: boolean;
  confirmPhrase?: string; // exact string user must type for critical ops
}
```

## 4. Danger classifier

| Op | class | typed confirm | reason key |
|---|---|---|---|
| GRANT / non-priv ALTER ROLE / rename-to-new | none | no | — |
| REVOKE (object / membership) | destructive | no | `PDM.DANGER.REVOKE` |
| REVOKE FROM PUBLIC | destructive | no | `PDM.DANGER.REVOKE_PUBLIC` |
| ALTER DEFAULT PRIVILEGES … REVOKE | destructive | no | `PDM.DANGER.DEFAULT_REVOKE` |
| DROP ROLE | critical | yes (role) | `PDM.DANGER.DROP_ROLE` |
| DROP OWNED BY | critical | yes (role) | `PDM.DANGER.DROP_OWNED` |
| REASSIGN OWNED BY | critical | yes (role) | `PDM.DANGER.REASSIGN` |
| SUPERUSER / BYPASSRLS grant | critical | yes (role) | `PDM.DANGER.SUPERUSER` |
| de-LOGIN / rename of SELF | critical | yes + BE block | `PDM.DANGER.SELF_LOCKOUT` |
| REVOKE … CASCADE | critical | yes (object) | `PDM.DANGER.CASCADE` |

`none` → single click · `destructive` → click + "I understand" · `critical` → Run disabled until the
typed value === `confirmPhrase`. BE re-checks the phrase server-side for critical ops.

## 5. Diff-apply algorithm (current-state → target)

```
load current (memberships / role grants) → render candidates PRE-CHECKED where true →
Apply: toGrant = target\current ; toRevoke = current\target →
empty ⇒ "No changes" (Apply disabled) →
one change-set (grants first, then revokes) → previewOnly → Review-SQL dialog →
typed confirm if critical → execute → re-read (dialog reflects new truth).
```

## 6. Endpoint catalog

**Reads** (`dbPrivileges`/`dbRoles`/`PERM_ANY` READ):
`GET /:ds/capability` · `/:ds/roles` (paged opt-in) · `/:ds/memberships` · `/:ds/schemas` ·
`/:ds/objects/sequences|functions` · `/:ds/grants/tables|columns` (paged+search) ·
`/:ds/grants/export` · `/:ds/default-privileges` · `/:ds/effective/:role` (contract §3) ·
`/:ds/effective/:role/tree` (lazy) · `/:ds/roles/:role/grants` (current grants) ·
`/:ds/roles/:role/owned` · `/:ds/roles/:role/export` · `/:ds/objects/who-can-access` (reverse) ·
`/:ds/database-privileges` · `/:ds/public-grants` · `/:ds/rls` · `/:ds/revoke-impact` · `/:ds/sessions` (paged).

**Writes** (WRITE; destructive → FULL + confirm; critical → + typed phrase):
`POST /:ds/roles` · `PUT /:ds/roles/:role` · `POST /:ds/roles/:role/rename|delete|reassign` ·
`POST /:ds/memberships` · `POST /:ds/memberships/remove` · `POST /:ds/change-set` ·
`POST /:ds/sessions/:pid/cancel|terminate`.

All write endpoints honor `previewOnly: true` → `PreviewResponse` (nothing executes).

## 7. Feature map (all stateless)

- **Fixes:** unify effective contract (fixes `Object/Type = —`); naming clarity in-screen; mandatory
  `*` + save-gating.
- **Safety:** SQL preview · danger badge + typed confirm · REVOKE/DROP impact preview · self-lockout
  guards surfaced · change-set dry-run diff.
- **Intelligence:** current-state reflection + diff apply · dependent dropdown cascades · grantee-aware
  pre-load.
- **Detail:** schema→table→(columns)→privileges lazy tree with provenance.
- **Lazy-load:** `app-custom-table` + server page/sort/search on every grid; tree lazy-expands.
- **New:** clone privileges · bulk grant/revoke · database & schema privileges · PUBLIC hardening ·
  password/expiry lifecycle · RLS read-only view · ownership/REASSIGN · grant/admin-option mgmt ·
  reverse lookup · **server-side role/privilege templates** (persisted `db_role_template`; org-wide or
  datasource-pinned; 5 read-only built-ins: Reader/Writer/Read-Write/Owner/Monitor; custom CRUD) ·
  session hints.
- **Design-only:** multi-engine abstraction seam.
- **Explicitly OUT (need persistence):** app↔DB mapping · persisted in-module audit history.

### Template entity + endpoints (the one stateful feature)
`db_role_template` (shared DB, per-org): `{ id, name, description?, isBuiltIn, datasourceId? (null=org-wide),
definition: { attributes, rules[] }, +tenant/audit }`. `definition` holds names/flags/privilege keywords
only — no schema/table resolved until applied. CRUD under `/api/v1/db-access/templates`
(`GET /templates`, `GET /templates/:id`, `POST /templates`, `PUT /templates/:id` [409 if built-in],
`POST /templates/bulk-delete` [blocks built-in]) — standard org request flow, NOT `loadTargetConnection`.
Apply = FE expands `rules` into composer rules → existing change-set / create-role path. Seed built-ins
idempotently with `isBuiltIn=1`.

## 8. Key files

**BE** `src/modules/db-access/`: `db-access.routes.ts` · `controllers/*` (one fn per file) ·
`services/pgIntrospect.ts` (reads) · `services/pgSqlBuilder.ts` (writes; `quoteIdent`/`quoteLiteral`) ·
`services/dangerClassifier.ts` (new, pure) · `execTxn.ts` · `datasourceOpLock.ts` · `auditDbAccess.ts` ·
`loadTargetConnection.ts`.

**FE** `src/app/modules/db-access/`: `services/db-access.service.ts` · `db-access-context.service.ts`
(memoized cache) · `roles/{list,add,edit,view}-db-role` · `privileges/{privileges-access,sessions}` ·
`components/review-sql-dialog/` (new) · `components/privilege-tree/` (new) ·
`config/privilege-presets.ts` (new client-side presets).

## 9. Gotchas

- **Postgres-only** (pg_catalog specific). Guard non-PG with a clear capability message (E1 seam).
- `getEffectivePrivileges` recursive CTE: cast the anchor to `::name` (not `text`) or Postgres 500s on a
  collation mismatch (already fixed — don't regress).
- `quoteIdent` rejects NUL + >63-byte names (never truncate); spaces allowed.
- Session cancel/terminate: self-pid guard in controller AND validated at the edge.
- `toIsoOrNull` guards `'infinity'` timestamps (an Invalid Date) — reuse for any new timestamp reads.
- Under-privileged management login → read-only + Copy-SQL (capability `canManage === false`).
- Dev stack: FE :4200 / BE :3000; warehouse PG `localhost:5432/DbExec`, user `postgres`.

## 10. Verification

BE: `tsc --noEmit` + `npm run build` + `dangerClassifier` unit suite.
FE: `tsc --noEmit` → `ngc -p tsconfig.app.json --noEmit` → `ng build --configuration production`.
Live: every write previews correct SQL → danger badges → typed confirm for critical → executes →
reflects on refresh → audits to org chain. Detail tree renders real values (no `—`).
