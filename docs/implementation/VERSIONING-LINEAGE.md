# Versioning, drafts, branches, lineage

> Implementation companion to research module 18. Pins
> per-entity version tables, diff format, rollback semantics,
> drafts, branches, tags, retention exemption for
> snapshot-referenced versions, and the lineage edge table.

**Status:** 🔴 not in product.
**Effort:** L (~3 weeks).

---

## 0. Problem statement

Three customer asks roll up here:

1. "Who changed this dashboard?" — version history with actor +
   diff.
2. "Can we go back to last Tuesday's definition of revenue?" —
   rollback.
3. "What dashboards break if I delete this dataset?" —
   lineage.

Plus collaboration nice-to-haves: drafts, branches, named
tags (`v2.0`).

---

## 1. Data model

Per-entity version tables share the same shape — one table
per kind keeps schemas simple and joins clear.

```sql
CREATE TABLE dataset_version (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES dataset_version(id),
  version_no    INTEGER NOT NULL,                     -- monotonic per dataset
  branch        TEXT NOT NULL DEFAULT 'main',
  tag           TEXT,                                  -- e.g. 'v2.0'
  is_draft      BOOLEAN NOT NULL DEFAULT false,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  snapshot      JSONB NOT NULL,                        -- full entity at this version
  diff_from_parent JSONB,                              -- rfc6902-style patch from parent
  actor_user_id UUID NOT NULL REFERENCES "user"(id),
  message       TEXT,                                   -- commit message
  exempt_from_retention BOOLEAN NOT NULL DEFAULT false, -- snapshots reference these
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dataset_version_dataset ON dataset_version(dataset_id, version_no DESC);
CREATE INDEX idx_dataset_version_tag ON dataset_version(dataset_id, tag) WHERE tag IS NOT NULL;

-- Identical shape for these:
CREATE TABLE analysis_version (...);
CREATE TABLE dashboard_version (...);
CREATE TABLE semantic_model_version (...);
```

### Lineage

```sql
CREATE TABLE lineage_edge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  upstream_kind TEXT NOT NULL,                         -- 'dataset', 'semantic_model', ...
  upstream_id   UUID NOT NULL,
  downstream_kind TEXT NOT NULL,                       -- 'analysis', 'dashboard', 'subscription', ...
  downstream_id UUID NOT NULL,
  relation      TEXT NOT NULL,                         -- 'derived_from', 'embedded_in', 'aggregates'
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lineage_upstream ON lineage_edge(upstream_kind, upstream_id);
CREATE INDEX idx_lineage_downstream ON lineage_edge(downstream_kind, downstream_id);
CREATE UNIQUE INDEX uq_lineage_edge
  ON lineage_edge(upstream_kind, upstream_id, downstream_kind, downstream_id, relation);
```

---

## 2. Diff format

We use JSON Patch (RFC 6902). Lossless and standard.

```typescript
import * as jsonpatch from 'fast-json-patch';

export function diff(prev: any, next: any): jsonpatch.Operation[] {
  return jsonpatch.compare(prev, next);
}

export function applyPatch(base: any, ops: jsonpatch.Operation[]): any {
  return jsonpatch.applyPatch(structuredClone(base), ops).newDocument;
}
```

Storing both `snapshot` and `diff_from_parent` is redundant but
makes reads O(1) (just read the snapshot) and writes O(n) (only
compute diff at save). Storage is cheap; reads are hot.

---

## 3. Saving a version

```typescript
// src/services/versioning/saveVersion.ts
export async function saveDatasetVersion(
  connection: Connection,
  datasetId: string,
  next: Dataset,
  ctx: { actorUserId: string; message?: string; isDraft?: boolean; branch?: string },
): Promise<DatasetVersion> {
  const branch = ctx.branch ?? 'main';
  const prev = await connection.getRepository('DatasetVersion')
    .createQueryBuilder('v')
    .where('v.dataset_id = :id AND v.branch = :br', { id: datasetId, br: branch })
    .orderBy('v.version_no', 'DESC')
    .limit(1)
    .getOne();

  const versionNo = (prev?.versionNo ?? 0) + 1;
  const patch = prev ? diff(prev.snapshot, next) : null;

  return connection.getRepository('DatasetVersion').save({
    datasetId,
    parentId: prev?.id ?? null,
    versionNo,
    branch,
    isDraft: !!ctx.isDraft,
    isPublished: !ctx.isDraft,
    snapshot: next,
    diffFromParent: patch,
    actorUserId: ctx.actorUserId,
    message: ctx.message ?? null,
  });
}
```

---

## 4. Rollback

Rollback writes **forward**, not backward — preserves the
audit log.

```typescript
export async function rollbackDataset(
  connection: Connection,
  datasetId: string,
  targetVersionId: string,
  actorUserId: string,
): Promise<DatasetVersion> {
  const target = await connection.getRepository('DatasetVersion').findOne({ where: { id: targetVersionId } });
  if (!target) throw new Error('VERSION_NOT_FOUND');

  // Re-save target.snapshot as a new version with a "rollback to" message
  const restored = await saveDatasetVersion(connection, datasetId, target.snapshot, {
    actorUserId,
    message: `Rollback to v${target.versionNo}`,
  });

  // Replace the live dataset row
  await connection.getRepository('Dataset').update({ id: datasetId }, target.snapshot);

  return restored;
}
```

---

## 5. Drafts & branches

A draft is `is_draft=true && is_published=false`. The editor
auto-saves drafts every 30 s. Publishing flips a draft to
published and writes a new "publish" version on top.

Branches let two authors work in parallel:

```
main:  v1 → v2 → v3 (published)
       \
draft-branch (e.g. "alice/territory-refactor"): v1 → v2 → v2a → v2b
```

Merge: select a source branch + target branch + actor; we
compute the 3-way merge (target ancestor → source vs target).
Conflicts surface inline in the editor.

---

## 6. Tags

Named, immutable pointers to a version: `v2.0`, `production`,
`pre-restructure`. Used by:

- Snapshot dashboards (module 08) — "open the version tagged
  `production`".
- Embed share links — pin the embed to a specific tag so a
  customer never sees an unreviewed change.

```sql
ALTER TABLE dataset_version ADD CONSTRAINT uq_dataset_tag
  UNIQUE (dataset_id, tag) DEFERRABLE INITIALLY IMMEDIATE;
```

Tag move: explicit endpoint, writes audit row.

---

## 7. Retention

Default: keep 100 most recent versions per entity per branch +
all tagged versions + all `exempt_from_retention=true` versions.
Older versions purged by nightly cron.

`exempt_from_retention=true` flips on automatically when:

- A snapshot dashboard references this version.
- A scheduled report points at this version.
- A regulatory hold is in effect (module 28).

---

## 8. Lineage extraction

On every entity save, re-derive edges from the entity's
references:

```typescript
export async function reextractLineage(kind: string, id: string, entity: any): Promise<void> {
  const newEdges: LineageEdge[] = [];

  if (kind === 'analysis') {
    if (entity.datasetId) {
      newEdges.push({ upstreamKind: 'dataset', upstreamId: entity.datasetId,
                      downstreamKind: 'analysis', downstreamId: id,
                      relation: 'derived_from' });
    }
    if (entity.semanticModelId) {
      newEdges.push({ upstreamKind: 'semantic_model', upstreamId: entity.semanticModelId,
                      downstreamKind: 'analysis', downstreamId: id,
                      relation: 'derived_from' });
    }
  }

  if (kind === 'dashboard') {
    for (const tab of entity.tabs ?? []) {
      for (const v of tab.visuals ?? []) {
        newEdges.push({ upstreamKind: 'analysis', upstreamId: v.analysisId,
                        downstreamKind: 'dashboard', downstreamId: id,
                        relation: 'embedded_in' });
      }
    }
  }

  if (kind === 'subscription') {
    newEdges.push({ upstreamKind: 'dashboard', upstreamId: entity.dashboardId,
                    downstreamKind: 'subscription', downstreamId: id,
                    relation: 'aggregates' });
  }

  // Replace edges for this downstream
  await connection.getRepository('LineageEdge').delete({
    downstreamKind: kind, downstreamId: id,
  });
  for (const e of newEdges) {
    await connection.getRepository('LineageEdge').save(e);
  }
}
```

Hook into every save controller; happens after the entity tx
commits.

---

## 9. Impact preview

Before deleting a dataset:

```typescript
const downstream = await connection.getRepository('LineageEdge').find({
  where: { upstreamKind: 'dataset', upstreamId: datasetId },
});
// downstream = [{downstreamKind: 'analysis', downstreamId: ...}, ...]
```

FE shows the count + a button "view impacted entities". Block
the delete with `409 CONFLICT` if the count is non-zero unless
the user confirms cascade.

---

## 10. Controller — version list

```typescript
// src/controllers/version/listDatasetVersions.ts
const listDatasetVersions = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const { branch = 'main', limit = 50 } = req.query as any;
  const { orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const versions = await connection.getRepository('DatasetVersion').find({
      where: { datasetId, branch },
      order: { versionNo: 'DESC' },
      take: Math.min(Number(limit), 200),
    });
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, VER_MSG.OK,
      versions.map((v: any) => ({
        id: v.id, versionNo: v.versionNo, branch: v.branch, tag: v.tag,
        isDraft: v.isDraft, isPublished: v.isPublished,
        actor: v.actorUserId, message: v.message,
        diffSummary: summariseDiff(v.diffFromParent),
        createdAt: v.createdAt,
      })));
  } catch (err: any) {
    Logger.error(`List versions failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

function summariseDiff(ops: jsonpatch.Operation[] | null): string {
  if (!ops) return '(initial version)';
  const counts = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) counts[o.op as 'add'|'remove'|'replace']++;
  return `+${counts.add} -${counts.remove} ~${counts.replace}`;
}
```

---

## 11. FE — version history + diff viewer

In every entity edit screen, "History" tab:

```
┌──────────────────────────────────────────────────────┐
│  History                              [main ▼]       │
│  ──────────────────────────────────────────────      │
│  v12 — published                       just now       │
│        by Alice  · "added margin metric"             │
│        +2 -0 ~1   [view diff] [restore] [tag]         │
│                                                       │
│  v11 — draft                          15 min ago      │
│        by Alice (auto-save)                           │
│        +0 -0 ~3   [view diff] [restore]               │
│                                                       │
│  v10 — published [tag: v2.0]          2 days ago      │
│        by Bob  · "Q2 release"                         │
│        +5 -2 ~8   [view diff] [restore]               │
│                                                       │
│  [Show older]                                          │
└──────────────────────────────────────────────────────┘
```

Diff viewer: side-by-side JSON with `add`/`remove`/`replace`
highlights. For semantic model and dashboard, render a "logical
diff" — "metric *revenue* changed agg from `SUM` to `AVG`" — by
post-processing the JSON Patch.

---

## 12. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_version_save_total` | counter | `kind`, `is_draft` | usage |
| `dbexec_version_save_ms` | histogram | `kind` | latency |
| `dbexec_version_rollback_total` | counter | `kind` | rollback frequency |
| `dbexec_version_retained_count` | gauge | `kind` | per-kind retention size |
| `dbexec_lineage_edges_count` | gauge | — | edges table size |
| `dbexec_lineage_extract_ms` | histogram | `kind` | extraction cost |

---

## 13. Security & threat model

| Threat | Mitigation |
|---|---|
| Author rolls back to a version they shouldn't see | Version reads gated by entity-read permission |
| Snapshot leaks deleted PII | Versions are stored with the same RLS rules as the live entity; reads via the snapshot pass through resolver |
| Branch name injection | Branch name is `[a-z0-9-_/]{1,80}` only |
| Diff payload bloat (huge snapshots) | Per-snapshot size limit 5 MB; entities exceeding switch to compressed JSONB |
| Tag tampering | Tag move is its own audit event |

---

## 14. Runbook

**Symptom: rollback doesn't take effect.**
1. Cache (module 05) holds the old result. Invalidation should
   bump cache_version automatically — verify.

**Symptom: lineage graph missing edges.**
1. Re-extract for the upstream entity:
   `POST /admin/lineage/reextract/:kind/:id`.

**Symptom: version table growing fast.**
1. Auto-save draft frequency too high? Default 30s; bump to 60s
   under load.
2. Retention cron stalled? `dbexec_version_retained_count` rising
   = cleanup not running.

---

## 15. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Save version (5 KB entity) | 20 ms | 80 ms | 500 ms |
| Save version (500 KB entity) | 100 ms | 400 ms | 3 s |
| List 50 versions | 30 ms | 100 ms | 1 s |
| Diff render (small) | 5 ms | 20 ms | 100 ms |
| Rollback | 50 ms | 200 ms | 1 s |
| Lineage extract | 30 ms | 100 ms | 1 s |
| Impact preview (one upstream) | 10 ms | 30 ms | 200 ms |

---

## 16. Migration & rollout

1. **Migrations:** create four `*_version` tables and
   `lineage_edge`.
2. **Backfill:** for each existing entity, write a single
   "v1 initial" version row.
3. **Feature flag:** `feature.versioning_v2`.
4. **Lineage cron:** one-time backfill running
   `reextractLineage` over every entity.

---

## 17. Open questions

1. **Git sync** — mirror to a Git repo per org. Defer; a v2
   premium feature.
2. **Three-way merge UI** — sketched in §5. Hard to get right;
   start with two-way (just show conflicts; user resolves manually
   in the editor).
3. **Inter-entity transactions** — saving a dashboard might
   want to atomically save the analyses it references. Today we
   don't; should we? Defer.

---

## 18. References

- [18-versioning-lineage.md](../research/modules/18-versioning-lineage.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- [08-dashboard.md](../research/modules/08-dashboard.md)
- RFC 6902 JSON Patch
- `fast-json-patch` npm
