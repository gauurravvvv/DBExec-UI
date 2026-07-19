# Asset Sharing — Design Spec

**Date:** 2026-07-19
**Branch:** `version_261` (both repos)
**Status:** Design — approved defaults, ready to implement
**Author:** Claude (autonomous; user reviews)

Make Datasets, Analyses and Dashboards **highly shareable** — grant access to
individual **users** and to **groups**, each at **Edit** or **View**, like
Tableau / Power BI / Looker / Metabase / Superset. One generic sharing
substrate serving all three asset types.

---

## 1. Phase 1 research — how the five tools do it

| Tool | Grant unit | Levels (→ our map) | Re-share right | "Who has access" surface | Multi-grant resolution |
|---|---|---|---|---|---|
| **Tableau** | users + groups | View / Explore / Publish / Overwrite capability templates. View→**VIEW**, Explore+→**EDIT** | "Overwrite" = save + become owner (ownership transfer) | Per-content Permissions panel; project defaults inherited | grant/deny/unspecified, deny wins |
| **Power BI** | users + groups (+ link) | Viewer=**VIEW**, Contributor/Member=**EDIT**; separate **Build** + **Reshare** toggles | Explicit "Allow recipients to share" toggle | Manage-permissions pane per item + workspace roles | role = max container role |
| **Looker** | users + groups | **View** (see/view/copy) / **Manage-Edit** (view + rename/move/delete + *manage access*) | Bundled into Manage-Edit | Folder "Add group or user → pick level → Add" list (Google-Docs UX) | most permissive |
| **Metabase** | groups only | **View** / **Curate** (=edit) / No-access (hidden) | Bundled into Curate | Collection permissions grid | **additive — most permissive across groups** |
| **Superset** | users + groups | per-resource **editors** / **viewers** subject pickers; owner=full | editors can edit; groups recommended | editors/viewers picker; DASHBOARD_RBAC role list | max |

**Distilled patterns → decisions**

1. **Grant to BOTH users and groups.** Four of five do; Metabase (group-only)
   is the outlier. `granteeType = 'user' | 'group'`.
2. **Two levels, Edit/View** (the brief). VIEW = read + run only. EDIT =
   modify + run + view. Owner = full. This is the common denominator of every
   tool's two "content" tiers.
3. **Effective permission = MAX(ownership, direct-user grant, group grants the
   user is in).** This is Metabase's *additive/most-permissive* rule, echoed by
   Looker and Power BI. Owner always wins (= full).
4. **Re-share** is a fork: Power BI/Superset make it a separate bit; Looker/
   Metabase bundle "manage access" into Edit. **DECISION: bundle into EDIT** —
   simpler, matches the two-tier brief. An **Editor can add/modify/revoke other
   grants**; only the **Owner can delete the asset and transfer ownership**. A
   `canReshare` bit is a trivial future add if the user wants Power-BI-style
   separation. *(Flagged for user.)*
5. **Explicit grants are orthogonal to public links.** DBExec already has a
   public share-token subsystem for dashboards (`dashboard_share_token`, the
   `share-dashboard-dialog`). This feature is *internal, identity-based* grants
   to known users/groups. Both coexist; the new Share dialog is a separate
   management surface.
6. **No folder/project inheritance.** DBExec removed folders (flat lists per
   project memory), so — unlike all five tools — there is nothing to inherit
   from. Grants are per-asset and flat. Simpler.
7. **"Who has access" = a Looker/Docs-style list** inside the Share dialog:
   the owner pinned at top ("Owner"), then each grant as `name/email · Edit|View
   dropdown · Revoke`, plus an add-recipients row (users + groups multiselect +
   level dropdown).

---

## 2. Data model — one generic `asset_share` table

**Decision: a single generic shared_entity, not per-type tables.**

Justification vs per-type (`dataset_share` / `analysis_share` / `dashboard_share`):

- The row shape is *identical* for all three (assetType + assetId + grantee +
  level + tenant/audit). Per-type tables would triplicate the entity, the
  controllers, the validator and the migration for zero schema divergence.
- Superset's newer model is exactly this: one editors/viewers substrate over
  every resource kind. Metabase/Looker likewise share one permissions table
  across content types.
- Enforcement is one `resolveEffectivePermission(userId, assetType, assetId)`
  helper reused by all three modules — a per-type table would need three copies.
- Downside (a soft polymorphic FK — `assetId` has no DB-level FK to a single
  table) is acceptable and already the house style: `dashboard.sourceAnalysisId`
  and `dashboard_share_token.dashboardId` are deliberately un-constrained soft
  pointers. We scope every query by `organisationId` + existence, exactly as
  those do.

### Entity: `AssetShare` (`asset_share`) — per-org shared DB

```
id                uuid PK
assetType         enum('dataset','analysis','dashboard')  NOT NULL   -- which family
assetId           uuid  NOT NULL                                     -- soft pointer (scoped by org + existence)
granteeType       enum('user','group')  NOT NULL
granteeId         uuid  NOT NULL                                     -- user.id or group.id (same org)
permission        enum('edit','view')  NOT NULL
organisationId    uuid  nullable  -- tenant stamp (nullable => onboarding-safe on a brand-new table)
organisationName  varchar nullable
createdOn/By, updatedOn/By, deletedOn/By  -- standard audit block (By cols select:false)
version           VersionColumn(select:false)
```

Indexes (all auto-named, unnamed `@Index`):
- `@Index(['organisationId', 'assetType', 'assetId'])` — the hot path: "who can
  see asset X" + "does user's grant exist for X".
- `@Index(['organisationId', 'granteeType', 'granteeId'])` — reverse: "what is
  shared with user/group Y" (future shared-with-me filter).

**Uniqueness** — one grant per (org, assetType, assetId, granteeType, granteeId)
is enforced **in the controller** (find-then-upsert), NOT a DB unique index,
because a partial-unique index `WHERE deletedOn IS NULL` risks onboarding drift;
the app-level upsert matches the SavedQuery/Group house pattern ("unique per
owner enforced in the controller not the DB").

**Onboarding-safety:** brand-new table, all columns nullable except the four
NOT-NULL business columns (assetType/assetId/granteeType/granteeId/permission)
which are always supplied at insert; apostrophe-free `@Entity` comment; unnamed
`@Index`; registered in `all_entities.constant.ts` alphabetically. A fresh org
onboards cleanly (empty table, no data dependency).

---

## 3. Permission semantics

```
owner (asset.createdBy == userId)        => FULL  (edit + delete + share-mgmt + transfer)
direct user grant  permission='edit'     => EDIT
group grant (user ∈ group) 'edit'        => EDIT
direct user grant  permission='view'     => VIEW
group grant (user ∈ group) 'view'        => VIEW
otherwise                                => (org-wide READ today; see §4)
```

`resolveEffectivePermission(conn, orgId, userId, assetType, assetId, assetOwnerId?)`
returns one of `'owner' | 'edit' | 'view' | null` = **MAX** of:
1. owner check (`assetOwnerId === userId` → `owner`),
2. direct user grant,
3. any group grant where the user is a member (via `UserGroupMapping`).

Rank: `owner(3) > edit(2) > view(1) > null(0)`.

**Capability map**

| Capability | owner | edit | view |
|---|---|---|---|
| View / read / run | ✓ | ✓ | ✓ |
| Modify (update, add fields, republish) | ✓ | ✓ | ✗ |
| Manage grants (add/change/revoke shares, incl. re-share) | ✓ | ✓ | ✗ |
| Delete the asset | ✓ | ✗ | ✗ |
| Transfer ownership | ✓ (deferred) | ✗ | ✗ |

Decisions flagged for the user:
- **Editors CAN re-share** (Looker/Metabase model). If you want Power-BI's
  "reshare is a separate toggle", add a `canReshare` boolean later — trivial.
- **Delete is owner-only** (stricter than Looker where Edit deletes). Safer for
  a first cut; easy to loosen.
- **Ownership transfer is deferred** — owner = `asset.createdBy`; a future
  `POST /asset-shares/transfer` (owner-only) can reassign it.

---

## 4. Composition with existing RLS + list endpoints

**Confirmed from code (Phase-0 exploration):**

- `listDataset`, `listAnalyses`, `listDashboard` all filter by
  `organisationId` **only** — every org user already sees every asset. So
  **"shared-with-me appears in my list" is already true today** at the list
  level. The sharing feature does not have to *add* rows to lists.
- The `Get*Validation` middleware preloads the org-scoped entity into
  `res.locals.{dataset|analysis|dashboard}`; the run/get/delete/update
  controllers consume it. Today they gate purely on the route-level
  `VerifyPermissionMiddleware('<perm>', ACCESS.<X>)` — i.e. *anyone in the org
  with the module permission* can edit/delete any asset.

**Two-layer model (what changes):**

1. **RLS (`resolveRlsFilters`) is untouched.** RLS is *row/column* security on
   the *data a dataset returns*. Asset-sharing is *object* security on *who can
   open/edit/delete the asset*. Orthogonal — asset-share never touches
   `resolveRlsFilters`, and a VIEW grant still runs the dataset through the
   caller's RLS identity. No interaction, no regression.

2. **Object-level enforcement is layered onto the existing controllers.** After
   the entity is preloaded, the mutate/delete/(optionally run) controllers call
   `resolveEffectivePermission(...)` and enforce:
   - **update / add-field / publish-republish / duplicate-into** → require
     `edit` or `owner` (else 401).
   - **delete** → require `owner` (else 401).
   - **run / get / list / distinct-values** → require `>= view` when a stricter
     mode is on (see below); by default stays org-wide READ so nothing breaks.

**Backward-compat switch — `SHARE_ENFORCEMENT` (default `permissive`).**
Because lists are org-wide *today*, flipping every asset to "owner+shared only"
is a behaviour change for existing orgs. The enforcement helper runs in one of
two modes (a single config flag, `config.share.enforcement`):

- `permissive` (**default, ships on**): the module permission still grants
  org-wide READ (view/run/list unchanged); **but** update/delete now
  additionally require `edit`/`owner` when the caller is **not** the owner and
  has **no** grant — i.e. we *tighten writes* (a non-owner without an edit grant
  can no longer silently overwrite/delete someone else's asset) while leaving
  reads exactly as they are. This is the safe, shippable default: pure
  hardening, no lost visibility.
- `strict` (opt-in later): view/run/list also require `>= view`; lists filter to
  `owned ∪ shared-with-me ∪ group-shared`. This is the full Metabase/Looker
  "no-access hides it" posture. We build the list-filter SQL now but leave it
  gated off so the user can enable per-deployment after review.

*Flagged for the user:* default is `permissive` (tighten writes only). Say the
word and we flip to `strict` (hide unshared assets) — the code path exists.

**Effect on the four controllers per module** (dataset/analysis/dashboard):
`update`, `delete` (and dashboard `publish`, dataset `addField/updateField/
deleteField`, `duplicate`) gain a `requireAssetPermission(res, 'edit'|'owner')`
guard right after entity preload. `get/run/list/distinct` gain the guard only in
`strict` mode. The guard reads `res.locals.{asset}` (already org-scoped) + the
shared helper; on failure it `sendResponse(res, false, CODE.UNAUTHORIZED, …)`.

---

## 5. API surface — a shared `/asset-shares` router

Mounted at `/api/v1/asset-shares` (after `SanitizeOrgInputMiddleware`, like all
per-org routers). Gated by the *asset's own* module permission at WRITE (sharing
is a write-grade management action), resolved per `assetType`.

| Method | Path | Permission | Body / Result |
|---|---|---|---|
| POST | `/:assetType/:assetId/shares` | asset module WRITE | `{ granteeType, granteeId, permission }` → upsert one grant. Returns the grant. |
| POST | `/:assetType/:assetId/shares/bulk` | asset module WRITE | `{ grants: [{granteeType,granteeId,permission}] }` → upsert many (the dialog's "Add" adds several at once). |
| GET | `/:assetType/:assetId/shares` | asset module READ | → `{ owner: {...}, shares: [{ id, granteeType, granteeId, granteeName, permission, ... }] }` ("who has access"). |
| PUT | `/shares/:shareId` | asset module WRITE | `{ permission }` → change a grant's level. |
| DELETE | `/shares/:shareId` | asset module WRITE | revoke a grant (soft-delete). |

`:assetType` ∈ `dataset|analysis|dashboard`. `assetId` existence + org scope is
verified in a validation middleware that also preloads the target asset owner so
the controller can enforce "only owner/editor may manage grants". The share row
itself is org-scoped on every read/mutate (`organisationId = orgData.id`).

Because `VerifyPermissionMiddleware` can gate only one permission string, the
share routes gate on a small custom middleware `VerifyAssetSharePermission` that
maps `:assetType → {datasetManager|analyses|dashboard}` and delegates to the
same permission-tree check at the required level (mirrors how
`/datasets/:id/distinct-values` sidesteps the single-permission limit).

**Grantee name resolution:** the GET enriches each grant with a display name —
`user.username`/`email` or `group.name` — via a scoped lookup, so the dialog
renders without a second round-trip.

---

## 6. Frontend — the Share dialog

Mirror the existing **`share-dashboard-dialog`** (already a Docs-style
list/create/revoke surface: `[visible]` + `(closed)`, OnPush + `markForCheck`,
toast helpers, inline confirm). New generic component:

`shared/components/asset-share-dialog/` (shared so all three modules reuse it):
- `@Input() visible; @Input() assetType: 'dataset'|'analysis'|'dashboard';
  @Input() assetId; @Input() assetName; @Output() closed`.
- `.confirmation-popup` overlay (NOT p-dialog), backdrop-click-to-close.
- **Add row:** `app-custom-multiselect` (server fetcher → users) + a second for
  groups (or one toggle), plus an `app-custom-dropdown` Edit/View, `appendTo="body"`.
- **Current-access list:** owner pinned first (badge "Owner"), then each grant:
  name/email, an inline `app-custom-dropdown` Edit/View (change level), and a
  Revoke button with the inline two-click confirm pattern from the share-token
  dialog.
- All calls via a new signal service `assetShares.service.ts`
  (`providedIn:'root'`, `_loading/_saving/_deleting`, `HttpClientService` +
  `skipLoader:true`), endpoints from a new `ASSET_SHARE` group in
  `api.constant.ts`.

**Adoption:** add a **Share** action (`pi-share-alt`) to:
- list-row actions of `list-dataset`, `list-analyses`, `list-dashboard`
  (`<ng-template usGridCell="actions">`), gated
  `*hasPermission="'<perm>'; level: 'write'"`.
- the `view-*` screens' action bar for each of the three.

**Validator (mirrored):** `shared/validators/assetShares.ts` byte-identical
FE↔BE, Zod 4, messages = `validation.assetShares.<field>.<rule>` i18n keys.

**i18n:** a `SHARE` block (+ `validation.assetShares.*`) in **all 10 locales**.

---

## 7. Enforcement points (summary)

| Module | Controller | Guard added | Level |
|---|---|---|---|
| datasets | update, addField, updateField, deleteField, duplicate, from-builder update | `requireAssetPermission('dataset','edit')` | edit/owner |
| datasets | delete | `requireAssetPermission('dataset','owner')` | owner |
| datasets | get, run, list, distinct-values | strict-only guard | view |
| analyses | update, duplicate | `edit` | edit/owner |
| analyses | delete | `owner` | owner |
| analyses | get, run, list, distinct, bootstrap, fields, versions | strict-only | view |
| dashboards | publish (republish existing), duplicate | `edit` | edit/owner |
| dashboards | delete | `owner` | owner |
| dashboards | get, run, render, list, distinct | strict-only | view |

`publish` is subtle: creating a *new* dashboard is fine (no asset yet); only
*re-publishing an existing* dashboard id requires edit — the guard runs only
when the target dashboard already exists.

---

## 8. Decisions recorded (defaults chosen; user may override)

1. **One generic `asset_share` table** (not per-type). — §2
2. **Levels = Edit / View**, owner = full. — §3
3. **Effective = MAX(owner, user grant, group grant)** (additive). — §3
4. **Editors can re-share; delete + transfer are owner-only.** — §3
5. **Default enforcement = `permissive`** (tighten *writes* only; reads stay
   org-wide). `strict` (hide unshared) is built but gated off. — §4
6. **Explicit grants are separate from public share links.** — §1.5
7. **No folder inheritance** (folders removed). — §1.6
8. **Ownership transfer deferred** (owner = createdBy). — §3

**Needs the user's eyes:**
- Flip to `strict` enforcement (hide assets a user has no grant on)? Default is
  `permissive`.
- Split re-share into its own bit (Power BI style)? Default bundles it into Edit.
- Should VIEW-only recipients be blocked from *duplicating* an asset (a copy is
  a back-door to edit)? Default: duplicate requires edit.
