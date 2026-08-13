# Asset Sharing — Implementation Plan

**Date:** 2026-07-19 · **Branch:** `version_261` (both repos) · **Spec:**
`docs/superpowers/specs/2026-07-19-asset-sharing-design.md`

Four commit slices, each gate-green. FE repo = `/dbexec-ui`, BE = `/dbexec-api`.
NEVER push; never stage `.env`/`environment*.ts`. Commit trailer on every commit.

---

## Slice 1 — BE: entity + validator + share controllers + router

**Goal:** the `/asset-shares` CRUD surface, no enforcement yet.

- [ ] 1.1 `BE/src/shared/db/shared_entity/assetShare.entity.ts` — `AssetShare`
      entity per spec §2 (nullable tenant/audit, unnamed `@Index`, apostrophe-free
      comment). Register in `all_entities.constant.ts` (import + array, alpha —
      after `AnnouncementDismissal`? no: alpha `AssetShare` after `AnalysisWidget`).
- [ ] 1.2 Mirrored validator `shared/validators/assetShares.ts` (BE) — Zod 4,
      `ASSET_SHARE_LIMITS`, `assetType`/`granteeType`/`permission` enums,
      `addAssetShareSchema`, `bulkAddAssetShareSchema`, `updateAssetShareSchema`;
      messages = `validation.assetShares.*`.
- [ ] 1.3 `constants/response.messages.ts` — new `ASSET_SHARE` group
      (GRANTED/UPDATED/REVOKED/LIST_FETCHED/NOT_FOUND/GRANTEE_NOT_FOUND/
      ASSET_NOT_FOUND/SELF_SHARE?/INVALID_ASSET_TYPE).
- [ ] 1.4 `constants/audit.constants.ts` — add `AUDIT_MODULES.ASSET_SHARE =
'asset-share'`. (GRANT/REVOKE actions already exist; add nothing else.)
- [ ] 1.5 `utility/auditMetadata.ts` — `AUDIT_FIELDS.ASSET_SHARE =
['assetType','assetId','granteeType','granteeId','permission']`.
- [ ] 1.6 Middleware `modules/asset-shares/middleware/`:
  - `verifyAssetSharePermission.middleware.ts` — factory `(level)`; maps
    `:assetType → datasetManager|analyses|dashboard`, verifies the permission
    tree at `level`, 401 else. (Sidesteps single-perm `VerifyPermissionMiddleware`.)
  - `loadAsset.validation.ts` — resolves `:assetType`+`:assetId` org-scoped,
    loads `{ id, createdBy, name }` into `res.locals.targetAsset`; 404 if absent.
  - `addAssetShare.validation.ts` / `bulkAddAssetShare.validation.ts` /
    `updateAssetShare.validation.ts` — `zodValidate(...)`.
- [ ] 1.7 Controllers `modules/asset-shares/controllers/` (one fn/file,
      try/catch, sendResponse, close connection, audit CUD):
  - `shareAsset.ts` (upsert one) · `bulkShareAsset.ts` (upsert many) ·
    `listAssetShares.ts` (owner + grants, name-enriched) ·
    `updateAssetShare.ts` (change level) · `revokeAssetShare.ts` (soft-delete) ·
    `assetShare.controller.ts` (class wrapper like `dataset.controller.ts`).
- [ ] 1.8 `shared/services/assetShare.service.ts` (BE) — the reusable
      `resolveEffectivePermission(conn, orgId, userId, assetType, assetId,
assetOwnerId)` → `'owner'|'edit'|'view'|null` (MAX of owner/user-grant/
      group-grant via `UserGroupMapping`). **Written here in slice 1, consumed in
      slice 2.** Plus a `grantRank()` helper.
- [ ] 1.9 `modules/asset-shares/asset-shares.routes.ts` per spec §5. Mount in
      `server.ts` after the sanitizer: `this.app.use('/api/v1/asset-shares',
assetShareRoutes)`.
- [ ] 1.10 **Gate:** `cd BE && npx tsc --noEmit && npm run build` → green.
- [ ] 1.11 Commit slice 1 (BE).

## Slice 2 — BE: enforcement guards + list share-awareness

**Goal:** wire `resolveEffectivePermission` into the 3 modules; ship
`permissive` default (tighten writes only).

- [ ] 2.1 `config/config.ts` — `share: { enforcement: process.env
.SHARE_ENFORCEMENT || 'permissive' }` (values `permissive|strict`). No `.env`
      committed; default in code.
- [ ] 2.2 `shared/utility/requireAssetPermission.ts` — helper
      `requireAssetPermission(res, assetType, assetId, need: 'edit'|'owner',
ownerId)` → returns `true`/sends 401. Reads the config flag; in `permissive`
      it only blocks writes for non-owner non-editors; owner short-circuits.
- [ ] 2.3 datasets: add guard to `updateDataset`, `updateDatasetViaBuilder`,
      `addDatasetField`, `updateDatasetField`, `deleteDatasetField`,
      `duplicateDataset` (edit) and `deleteDataset` (owner). Guard runs after
      `res.locals.dataset` preload.
- [ ] 2.4 analyses: guard `updateAnalysis`, `duplicateAnalysis` (edit),
      `deleteAnalysis` (owner). Uses `res.locals.analysis`.
- [ ] 2.5 dashboards: guard `publishDashboard` **only when target id already
      exists** (republish), `duplicateDashboard` (edit), `deleteDashboard` (owner).
- [ ] 2.6 **strict-mode list filter (built, gated):** in `listDataset`,
      `listAnalyses`, `listDashboard`, when `enforcement==='strict'` add
      `AND (createdBy = :uid OR EXISTS(direct/group share))` sub-clause; no-op in
      `permissive`. Same for the `get`/`run` guards (view level, strict-only).
- [ ] 2.7 **Gate:** BE `tsc --noEmit` + `npm run build` → green.
- [ ] 2.8 Commit slice 2 (BE).

## Slice 3 — FE: validator + service + api constant + share dialog

- [ ] 3.1 `FE/src/app/shared/validators/assetShares.ts` — **byte-identical** to
      the BE file from 1.2.
- [ ] 3.2 `core/constants/api.constant.ts` — `ASSET_SHARE` group
      (LIST/ADD/BULK/UPDATE/DELETE prefix+suffix builders per the `/asset-shares`
      routes).
- [ ] 3.3 `shared/services/assetShares.service.ts` — signal service
      (`providedIn:'root'`, `_loading/_saving/_deleting`, cancelReads Subject,
      `apiGet/apiPost/apiPut/apiDelete` + `skipLoader:true`): `listShares`,
      `addShares` (bulk), `updateShare`, `revokeShare`.
- [ ] 3.4 `shared/components/asset-share-dialog/` — component mirroring
      `share-dashboard-dialog` (OnPush, `[visible]`/`(closed)`, `.confirmation-popup`,
      toast helpers, inline revoke confirm). Recipient picker (users + groups
      `app-custom-multiselect` server fetchers reusing `UserService.listUser` /
      `GroupService.listGroups`), per-recipient + inline `app-custom-dropdown`
      Edit/View (`appendTo="body"`), owner pinned, current-grants list.
- [ ] 3.5 Declare `AssetShareDialogComponent` in `SharedModule` (so all 3
      feature modules can use it) + its i18n keys.
- [ ] 3.6 **Gate:** `cd FE && npx tsc --noEmit && npx ngc -p tsconfig.app.json
--noEmit && npx ng build --configuration production` → all green.
- [ ] 3.7 Commit slice 3 (FE).

## Slice 4 — FE: adoption (list rows + view screens) + full i18n

- [ ] 4.1 list-dataset / list-analyses / list-dashboard — add Share action
      (`pi-share-alt`) in `<ng-template usGridCell="actions">`, gated
      `*hasPermission="'<perm>'; level:'write'"`; wire `onShare(id)` + dialog state
      flags + `<app-asset-share-dialog>` in each list template.
- [ ] 4.2 view-dataset / view-analysis / view-dashboard — Share button in the
      action bar + dialog instance.
- [ ] 4.3 i18n — fill `SHARE.*` + `validation.assetShares.*` in **all 10**
      locales (en,de,es,fr,it,ja,ko,nl,pt-BR,zh-CN). Parity sweep: every en key
      present in the other 9.
- [ ] 4.4 **Gate:** FE `tsc` → `ngc --noEmit` → `ng build --configuration
production` → all green.
- [ ] 4.5 Commit slice 4 (FE).

---

## Verify gate (all 5 must be green before "done")

1. BE `npx tsc --noEmit`
2. BE `npm run build`
3. FE `npx tsc --noEmit`
4. FE `npx ngc -p tsconfig.app.json --noEmit`
5. FE `npx ng build --configuration production`

## Guardrails

- Onboarding-safe: additive nullable, unnamed `@Index`, apostrophe-free comment,
  registered in `all_entities`. Fresh org onboards clean (empty table).
- Bound SQL params only; org-scoped; RLS untouched (object security is orthogonal
  to row/column RLS).
- No push. No `.env`/`environment*.ts`. Commit trailer required.

## Deferred / user's call

- `strict` enforcement flip (hide unshared) — built, default off.
- `canReshare` split (Power BI style) — bundled into edit for now.
- Ownership transfer endpoint — owner = createdBy; add later.
- Notifications/email on share — out of scope for this cut.
