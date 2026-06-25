# 18 · Versioning, Git Sync, Lineage

> Source-of-truth tracking. Every dataset SQL, every analysis
> visual, every dashboard layout edited over time produces
> versions. Versions let users "see what changed", roll back,
> blame, and branch.
>
> The lineage half answers "what depends on this?". When a
> dataset column changes type, the lineage graph tells you which
> analyses and dashboards need re-validating.
>
> Sister modules:
> [17 · Search](17-search-catalogue.md) for back-references,
> [22 · API & SDK](22-api-sdk-plugins.md) for the git-sync
> protocol, [19 · Audit](19-audit-observability.md) for the
> immutable change log.

**Depends on:** Dataset (03), Analysis (06), Dashboard (08), Auth (10)
**Unblocks:** Compliance audits, recovery, "blame this chart"
**Maturity:** 🟡 partial — analyses have a `version_number`; everything else is overwrite-in-place

---

## 1. Industry baseline

| Tool | Versioning | Diff | Rollback | Branches | Git sync |
|---|---|---|---|---|---|
| **Tableau** | revisions per published workbook | view-only diff | yes | no | no |
| **Power BI** | OneDrive integration (~ish) | partial | yes (via OneDrive) | no | no |
| **Looker** | LookML in Git (native) | git diff | yes | yes | first-class |
| **Hex** | project versions | yes | yes | yes (notebook branches) | yes (paid) |
| **Mode** | report versions | line-level | yes | no | no |
| **Metabase** | revision history | per-question | yes | no | no |
| **Superset** | dashboards versioned in db | partial | yes | no | partial |
| **dbt** | (model layer) git-native | git diff | git revert | git branches | first-class |

**The patterns to copy:**

- **Every CUD on a versionable entity creates a version row.**
  Not a clone of the whole entity — an immutable diff with a
  `parent_version_id`, suitable for git-style traversal.
- **Lineage edges are projections, not source-of-truth.** They're
  derived from the entity content (a dataset's SQL references
  tables; an analysis references datasets; a dashboard references
  analyses). Re-derived on every entity change.
- **Branches are optional but the model should support them**.
  Looker's "dev mode" branching shows the upside.
- **Git sync is a power-user feature.** Most customers never want
  it but the ones who do want it desperately. Build the export
  side first, defer write-back.

## 2. DBExec today

- `analyses` has `version_number` + a soft `previous_version_id`
  pointer; the publish path writes a new row instead of updating.
- Datasets / dashboards / RLS rules are mutated in-place. There's
  no diff trail; the audit_log has a snapshot, but it's not
  designed for "show me the diff between Q3 publish and current".
- No lineage graph. Searching "what uses dataset X" is a
  string-grep over analysis.sql + dashboard snapshots.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| VR-G01 | Versioned dataset (every save = new version) | P0 | M |
| VR-G02 | Versioned dashboard | P0 | M |
| VR-G03 | Versioned RLS rules | P1 | M |
| VR-G04 | Versioned semantic model | P1 | M |
| VR-G05 | Diff view (JSON-patch or field-level) | P0 | M |
| VR-G06 | Rollback to version | P0 | M |
| VR-G07 | Compare two versions side-by-side | P1 | M |
| VR-G08 | Tag a version (release name) | P1 | S |
| VR-G09 | Branches (dataset / analysis fork) | P2 | L |
| VR-G10 | Lineage graph entity + edges table | P0 | L |
| VR-G11 | "Impact analysis" UI | P1 | M |
| VR-G12 | Column-level lineage (which output col comes from which input col) | P2 | L |
| VR-G13 | Git export (read-only YAML) | P1 | L |
| VR-G14 | Git import (write-back from YAML) | P2 | L |
| VR-G15 | Git webhook (CI-style PR check) | P2 | M |
| VR-G16 | Version retention policy | P0 | S |
| VR-G17 | "Drafts" — unpublished edits visible only to author | P1 | M |
| VR-G18 | Blame view ("who changed this column?") | P1 | M |

## 4. Target architecture

### 4.1 Version model — one table per versionable entity

We could put all versions in one big polymorphic table; we don't,
because the diff shapes differ enough that one entity's NULLs are
another's required fields. Instead, each versionable entity has
its own `_version` table mirroring it:

```sql
-- migration: 2026-12-XX_versioning.sql

CREATE TABLE dataset_version (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id        uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  organisation_id   uuid NOT NULL,

  version_number    int NOT NULL,               -- monotonic per dataset
  parent_version_id uuid,                        -- chain pointer
  branch_name       varchar(64) NOT NULL DEFAULT 'main',
  tag_name          varchar(64),                  -- "Q3-release" etc.

  -- Snapshot of the entity at this version
  name              varchar(255),
  description       text,
  sql               text,
  fields            jsonb,                        -- DatasetField[] denorm

  -- Diff representation
  diff_from_parent  jsonb,                        -- {added:{}, removed:{}, changed:{}}

  -- Authoring
  edited_by         uuid NOT NULL,
  edit_message      varchar(500),                 -- "fix join condition"
  created_on        timestamptz NOT NULL DEFAULT now(),

  -- Status
  is_draft          boolean NOT NULL DEFAULT false,
  is_published      boolean NOT NULL DEFAULT false,
  published_at      timestamptz,

  UNIQUE (dataset_id, branch_name, version_number)
);
CREATE INDEX dataset_version_chain ON dataset_version (dataset_id, branch_name, version_number DESC);
CREATE INDEX dataset_version_published ON dataset_version (dataset_id, is_published, published_at DESC);

CREATE TABLE dashboard_version ( /* analogous */ );
CREATE TABLE rls_rule_version ( /* analogous */ );
CREATE TABLE analysis_version ( /* mirrors existing analyses partial impl */ );
CREATE TABLE semantic_model_version ( /* analogous */ );
```

### 4.2 Diff representation

JSON-patch-ish but flattened for ergonomic UI rendering:

```ts
type Diff = {
  added: Record<string, unknown>;          // field → new value
  removed: Record<string, unknown>;        // field → old value
  changed: Record<string, {                // field → {from, to}
    from: unknown;
    to: unknown;
  }>;
};

function computeDiff(prev: any, next: any): Diff {
  const added: any = {}, removed: any = {}, changed: any = {};
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  for (const k of keys) {
    if (!(k in prev)) added[k] = next[k];
    else if (!(k in next)) removed[k] = prev[k];
    else if (!deepEqual(prev[k], next[k])) {
      changed[k] = { from: prev[k], to: next[k] };
    }
  }
  return { added, removed, changed };
}
```

The dataset SQL field gets a more granular text diff:

```ts
import { diffLines } from 'diff';

function sqlDiff(prevSql: string, nextSql: string) {
  return diffLines(prevSql, nextSql).map(part => ({
    type: part.added ? 'add' : part.removed ? 'remove' : 'context',
    text: part.value,
  }));
}
```

### 4.3 Save flow — versioning hook

```ts
// src/shared/services/versioning/recordDatasetVersion.ts
export async function recordDatasetVersion(
  manager: EntityManager,
  dataset: Dataset,
  prev: Dataset | null,
  editedBy: string,
  editMessage?: string,
  options: { branchName?: string; isDraft?: boolean } = {},
) {
  const branchName = options.branchName ?? 'main';
  const next = await manager.query(`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS n
    FROM dataset_version
    WHERE dataset_id = $1 AND branch_name = $2`,
    [dataset.id, branchName]);
  const versionNumber = next[0].n;

  const parent = await manager.getRepository(DatasetVersion).findOne({
    where: { datasetId: dataset.id, branchName },
    order: { versionNumber: 'DESC' },
  });

  const fields = await manager.getRepository(DatasetField).find({
    where: { datasetId: dataset.id },
  });

  const newSnapshot = {
    name: dataset.name,
    description: dataset.description,
    sql: dataset.sql,
    fields: fields.map(f => ({
      name: f.name, dataType: f.dataType,
      customLogic: f.customLogic, columnToView: f.columnToView,
    })),
  };
  const prevSnapshot = prev ? {
    name: prev.name, description: prev.description, sql: prev.sql,
    fields: (prev as any).fields ?? [],
  } : {};
  const diff = computeDiff(prevSnapshot, newSnapshot);

  await manager.getRepository(DatasetVersion).save({
    datasetId: dataset.id,
    organisationId: dataset.organisationId,
    versionNumber,
    parentVersionId: parent?.id ?? null,
    branchName,
    ...newSnapshot,
    diffFromParent: diff,
    editedBy,
    editMessage: editMessage ?? null,
    isDraft: options.isDraft ?? false,
    isPublished: !options.isDraft,
    publishedAt: !options.isDraft ? new Date() : null,
  });

  // Update lineage (§4.5)
  await rebuildLineageForDataset(manager, dataset.id);
}
```

Called from `addDataset` + `updateDataset` + any other dataset
mutation, *inside* the same transaction so a version is never
missing for an applied change.

### 4.4 Rollback

```ts
// POST /datasets/:id/rollback  body: { versionId, justification }
async function rollbackDataset(req, res) {
  const { id } = req.params;
  const { versionId, justification } = req.body;

  const target = await DatasetVersion.findOne({
    where: { id: versionId, datasetId: id, organisationId: res.locals.orgData.id },
  });
  if (!target) return sendResponse(res, false, 404, 'version.not_found');

  // Restore via a fresh update — which itself records a new version
  // tagged as a rollback. Never directly write the old row over the
  // new one — we want full forward history.
  await master_db_connection.manager.transaction(async (manager) => {
    const current = await manager.getRepository(Dataset).findOne({ where: { id } });
    if (!current) throw new Error('not found');

    current.name = target.name!;
    current.description = target.description ?? '';
    current.sql = target.sql!;
    current.updatedBy = res.locals.loggedInId;
    await manager.getRepository(Dataset).save(current);

    // Replace fields with the snapshotted set
    await manager.getRepository(DatasetField).delete({ datasetId: id });
    for (const f of target.fields as any[]) {
      await manager.getRepository(DatasetField).save({
        datasetId: id, ...f,
      });
    }

    // Record the rollback as its own version with an explicit message
    await recordDatasetVersion(manager, current, /* prev */ current,
                                res.locals.loggedInId,
                                `Rolled back to v${target.versionNumber}. ${justification ?? ''}`);
  });

  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { fromVersionId: versionId, justification },
  });

  return sendResponse(res, true, 200, 'dataset.rolled_back');
}
```

### 4.5 Lineage graph

A normalised edge table:

```sql
CREATE TABLE lineage_edge (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL,

  -- Upstream (the thing being depended on)
  upstream_type     varchar(32) NOT NULL,    -- dataset | analysis | semantic_model | datasource
  upstream_id       uuid NOT NULL,
  upstream_column   varchar(128),             -- optional, for column-level

  -- Downstream (the thing depending on upstream)
  downstream_type   varchar(32) NOT NULL,    -- analysis | dashboard | rls_rule | subscription
  downstream_id     uuid NOT NULL,
  downstream_column varchar(128),

  -- Edge metadata
  relationship      varchar(32) NOT NULL,     -- direct | transitive | inferred | snapshot
  confidence        smallint NOT NULL DEFAULT 100,   -- 0–100; SQL-parse confidence
  reason            varchar(255),             -- "column referenced in WHERE clause"

  -- Maintenance
  rebuilt_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (upstream_type, upstream_id, upstream_column,
          downstream_type, downstream_id, downstream_column)
);
CREATE INDEX lineage_edge_upstream
  ON lineage_edge (upstream_type, upstream_id);
CREATE INDEX lineage_edge_downstream
  ON lineage_edge (downstream_type, downstream_id);
CREATE INDEX lineage_edge_org_upstream
  ON lineage_edge (organisation_id, upstream_type);
```

### 4.6 Rebuild lineage

```ts
// src/shared/services/lineage/rebuild.ts

// Rebuild edges where this dataset is upstream OR downstream.
export async function rebuildLineageForDataset(
  manager: EntityManager,
  datasetId: string,
) {
  // 1. Datasource → Dataset edges (direct)
  const ds = await manager.getRepository(Dataset).findOne({
    where: { id: datasetId },
    relations: ['datasource'],
  });
  if (!ds) return;

  // Clear all edges where this dataset is downstream (we re-add)
  await manager.query(`
    DELETE FROM lineage_edge
    WHERE downstream_type = 'dataset' AND downstream_id = $1`, [datasetId]);

  await manager.query(`
    INSERT INTO lineage_edge (organisation_id, upstream_type, upstream_id,
                              downstream_type, downstream_id,
                              relationship, confidence, reason)
    VALUES ($1, 'datasource', $2, 'dataset', $3, 'direct', 100, 'dataset.datasourceId')`,
    [ds.organisationId, ds.datasourceId, ds.id]);

  // 2. Parse SQL → tables referenced (column-level later)
  const tables = parseTablesFromSql(ds.sql);     // see §4.7
  for (const t of tables) {
    await manager.query(`
      INSERT INTO lineage_edge (organisation_id, upstream_type, upstream_id,
                                downstream_type, downstream_id,
                                relationship, confidence, reason)
      VALUES ($1, 'datasource_table', $2, 'dataset', $3, 'direct', 80,
              'parsed from SQL FROM/JOIN')
      ON CONFLICT DO NOTHING`,
      [ds.organisationId, t.tableRef, ds.id]);
  }
}

// When a dataset's columns / SQL change, every analysis using it
// needs its analysis-side edges rebuilt too. We do this lazily:
// the analysis's own rebuildLineageForAnalysis() is queued.
```

### 4.7 SQL → tables/columns parser

```ts
// src/shared/services/lineage/parseSql.ts
import { parse } from 'pgsql-ast-parser';

type TableRef = { schema?: string; tableRef: string };

export function parseTablesFromSql(sql: string): TableRef[] {
  try {
    const ast = parse(sql);
    const found = new Set<string>();
    const collect = (node: any) => {
      if (!node) return;
      if (node.type === 'tableRef') {
        const ref = node.schema
          ? `${node.schema}.${node.name}`
          : node.name;
        found.add(ref);
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === 'object') collect(v);
      }
    };
    collect(ast);
    return Array.from(found).map(t => ({ tableRef: t }));
  } catch {
    return [];     // parse failure — log but don't block save
  }
}
```

Column-level parsing is harder (requires resolving `*` and joins);
deferred to v2.

### 4.8 Lineage query

```ts
// GET /lineage/upstream?type=dataset&id=... — what does this depend on
// GET /lineage/downstream?type=dataset&id=... — what depends on this
async function lineageUpstream(req, res) {
  const { type, id } = req.query;
  const depth = Math.min(Number(req.query.depth) || 3, 10);

  // Recursive CTE — fan out upstream up to `depth` hops
  const rows = await master_db_connection.query(`
    WITH RECURSIVE lineage(level, upstream_type, upstream_id, downstream_type, downstream_id, reason) AS (
      SELECT 0, le.upstream_type, le.upstream_id, le.downstream_type, le.downstream_id, le.reason
      FROM lineage_edge le
      WHERE le.downstream_type = $1 AND le.downstream_id = $2
      UNION ALL
      SELECT l.level + 1, le.upstream_type, le.upstream_id, le.downstream_type, le.downstream_id, le.reason
      FROM lineage_edge le
      JOIN lineage l ON l.upstream_type = le.downstream_type AND l.upstream_id = le.downstream_id
      WHERE l.level < $3
    )
    SELECT * FROM lineage`,
    [type, id, depth]);

  return sendResponse(res, true, 200, '', { edges: rows });
}
```

### 4.9 Impact analysis

When the user opens "Edit dataset", the FE shows an Impact panel:

```ts
// GET /lineage/impact?type=dataset&id=...
async function impactAnalysis(req, res) {
  const { type, id } = req.query;
  // Downstream lineage to depth=5
  const downstream = await master_db_connection.query(`
    WITH RECURSIVE downstream(level, edge_id, dtype, did, reason) AS (
      SELECT 1, le.id, le.downstream_type, le.downstream_id, le.reason
      FROM lineage_edge le
      WHERE le.upstream_type = $1 AND le.upstream_id = $2
      UNION ALL
      SELECT d.level + 1, le.id, le.downstream_type, le.downstream_id, le.reason
      FROM lineage_edge le
      JOIN downstream d ON d.dtype = le.upstream_type AND d.did = le.upstream_id
      WHERE d.level < 5
    )
    SELECT level, dtype, did,
           COUNT(*) OVER (PARTITION BY dtype) AS type_count,
           reason
    FROM downstream`, [type, id]);

  // Group and pretty up — return shape like:
  //   { datasets: 3, analyses: 12, dashboards: 7, rls_rules: 2, subscriptions: 4 }
  return sendResponse(res, true, 200, '', {
    summary: summarise(downstream),
    edges: downstream,
  });
}
```

### 4.10 Blame

A simple per-field history endpoint:

```ts
// GET /datasets/:id/blame?field=sql
async function datasetBlame(req, res) {
  const { id } = req.params;
  const field = req.query.field as string;   // 'sql', 'name', etc.

  const versions = await DatasetVersion.find({
    where: { datasetId: id, organisationId: res.locals.orgData.id },
    order: { versionNumber: 'ASC' },
  });

  // Walk versions; pick out the chronological changes to `field`
  const changes: Array<{
    versionNumber: number;
    editedBy: string;
    createdOn: Date;
    editMessage: string | null;
    value: any;
  }> = [];
  for (const v of versions) {
    const diff = v.diffFromParent as any;
    if (diff?.changed?.[field] || diff?.added?.[field] || diff?.removed?.[field]) {
      changes.push({
        versionNumber: v.versionNumber,
        editedBy: v.editedBy,
        createdOn: v.createdOn,
        editMessage: v.editMessage,
        value: (v as any)[field],
      });
    }
  }
  return sendResponse(res, true, 200, '', { changes });
}
```

### 4.11 Drafts

Some users want to edit a dataset's SQL without affecting downstream
analyses until they're happy. Drafts:

```sql
ALTER TABLE dataset
  ADD COLUMN draft_version_id uuid,
  ADD COLUMN draft_owner_user_id uuid;
```

Edit flow:

1. User opens the dataset edit screen → BE creates a draft version
   if one doesn't already exist (or returns the existing draft).
2. User edits the draft. Saves go to the draft's snapshot.
3. The dataset's "live" SQL is unchanged.
4. User clicks "Publish" → the draft becomes the new live version,
   the dataset is updated, downstream lineage rebuild fires.
5. Or user clicks "Discard" → draft deleted, no change.

### 4.12 Branches

Branches are namespaced versions. `dataset_version.branch_name`
defaults to 'main' but can be any string. The version chain is
per-branch. Merging two branches is a UX problem (auto-merge SQL
is risky); for v2 we allow `git checkout`-style switching but not
merging — the user has to manually re-apply changes.

```ts
// POST /datasets/:id/branches  body: { name, baseVersionId }
async function createBranch(req, res) {
  const { name, baseVersionId } = req.body;
  const base = await DatasetVersion.findOne({ where: { id: baseVersionId } });
  if (!base) return sendResponse(res, false, 404, 'base.not_found');

  // Branch is just a new chain starting from baseVersionId's snapshot
  await DatasetVersion.save({
    datasetId: base.datasetId,
    organisationId: base.organisationId,
    versionNumber: 1,
    parentVersionId: base.id,
    branchName: name,
    name: base.name, description: base.description, sql: base.sql,
    fields: base.fields,
    diffFromParent: { added: {}, removed: {}, changed: {} },
    editedBy: res.locals.loggedInId,
    editMessage: `Branched from ${base.branchName}/v${base.versionNumber}`,
  });
}
```

### 4.13 Retention

Versions accumulate. Default retention:

- **All versions** for the last 90 days.
- **Tagged versions** forever.
- **Published-as-snapshot** versions forever (something downstream
  refers to them).
- **Everything else** beyond 90 days → moved to `dataset_version_archive`
  table with body columns nulled; only metadata kept for audit.

```sql
-- nightly cron
WITH cutoff AS (SELECT now() - interval '90 days' AS t)
INSERT INTO dataset_version_archive
  SELECT id, dataset_id, organisation_id, version_number, parent_version_id,
         branch_name, tag_name, edited_by, edit_message, created_on,
         is_draft, is_published, published_at
  FROM dataset_version
  WHERE created_on < (SELECT t FROM cutoff)
    AND tag_name IS NULL
    AND id NOT IN (SELECT base_version_id FROM dashboard_snapshot_ref);
DELETE FROM dataset_version
  WHERE created_on < (SELECT t FROM cutoff)
    AND tag_name IS NULL
    AND id NOT IN (SELECT base_version_id FROM dashboard_snapshot_ref);
```

### 4.14 Git sync (read-only export)

YAML export of an entire workspace's catalog:

```
workspace/
├── datasets/
│   ├── invoices_q3.yml
│   └── customers.yml
├── analyses/
│   ├── customer_ltv.yml
│   └── ...
├── dashboards/
│   └── sales_q3_review.yml
└── rls/
    └── region_apac_only.yml
```

Each YAML carries the entity definition + current version pointer.
A `dbexec sync export <org> > workspace.tar.gz` CLI command (and
equivalent REST endpoint) produces the bundle. Read-only — write-back
is a v2 feature with conflict resolution.

```ts
async function exportWorkspaceYaml(orgId: string): Promise<Buffer> {
  const datasets = await Dataset.find({ where: { organisationId: orgId } });
  // ... analyses, dashboards, rls ...
  const tar = require('tar-stream');
  const pack = tar.pack();

  for (const d of datasets) {
    const yaml = yamlStringify({
      kind: 'Dataset',
      apiVersion: 'dbexec.io/v1',
      metadata: { name: d.name, id: d.id },
      spec: {
        datasourceId: d.datasourceId,
        sql: d.sql,
        fields: await listDatasetFields(d.id),
      },
    });
    pack.entry({ name: `datasets/${slug(d.name)}.yml` }, yaml);
  }
  // ... others ...
  pack.finalize();
  return await streamToBuffer(pack);
}
```

The YAML schema is documented in module 22 (Public API & SDK). Git
sync is a thin client on top of that schema.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/datasets/:id/versions` | List versions |
| GET | `/datasets/:id/versions/:vid` | Detail |
| GET | `/datasets/:id/versions/:vid/diff?against=:prevId` | Diff two versions |
| POST | `/datasets/:id/rollback` | Roll back to version |
| POST | `/datasets/:id/versions/:vid/tag` | Tag version |
| POST | `/datasets/:id/branches` | Create branch |
| GET | `/datasets/:id/branches` | List branches |
| POST | `/datasets/:id/drafts` | Open / get a draft |
| POST | `/datasets/:id/drafts/publish` | Publish draft |
| DELETE | `/datasets/:id/drafts` | Discard draft |
| GET | `/datasets/:id/blame?field=sql` | Blame for a field |
| GET | `/lineage/upstream?type&id&depth` | Upstream chain |
| GET | `/lineage/downstream?type&id&depth` | Downstream chain |
| GET | `/lineage/impact?type&id` | Impact analysis summary |
| GET | `/workspace/export.yaml` | YAML bundle |
| (analogous endpoints for dashboards, analyses, rls_rules, semantic_models) |

## 6. FE specs

### 6.1 Version history panel

```
Version history · invoices_q3
─────────────────────────────────
○ v15 · 2026-08-04 14:22  Sarah Lee
  "added customer_segment column"
  +1 field, ~ 12 SQL lines
  [Compare with current] [Restore]

○ v14 · 2026-07-30 09:15  Sarah Lee
  "fix join with customers table"
  ~ 3 SQL lines
  [Compare with current] [Restore]

⭐ v13 · 2026-07-29 11:00  Sarah Lee
  Tagged: "Q3 launch"
  +2 fields
  [Compare with current] [Restore]

...
```

### 6.2 Diff view

Side-by-side, field-by-field:

```
Comparing v13 → v15

Name:         (no change) invoices_q3

Description:  (no change) Invoices snapshot for the quarter

SQL:
  - SELECT i.invoice_id, i.customer_id, i.amount
  + SELECT i.invoice_id, i.customer_id, i.amount,
  +        i.discount, c.segment AS customer_segment
  FROM invoices i
  - JOIN customers ON invoices.customer_id = customers.id
  + JOIN customers c ON i.customer_id = c.id

Fields:
  + discount           numeric
  + customer_segment   text
  ~ amount             numeric → numeric(12,2)
```

### 6.3 Impact panel

Shown on the edit-dataset screen header:

```
⚠  This dataset is used by:
   12 analyses · 7 dashboards · 2 RLS rules · 4 subscriptions
   [View impact ▸]
```

Clicking opens the impact tree.

### 6.4 Lineage graph

```
                    ┌──────────────────┐
                    │ datasource: pg-1 │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ dataset:invoices │ ◀── you are here
                    └────────┬─────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌─────────────────┐ ┌────────────┐ ┌──────────────┐
   │ analysis: LTV   │ │ analysis:  │ │ analysis:    │
   │                 │ │ Q3 Revenue │ │ Cohort       │
   └────────┬────────┘ └──────┬─────┘ └──────┬───────┘
            ▼                  ▼              ▼
       ┌─────────────┐  ┌────────────┐  ┌──────────────┐
       │ dashboard:  │  │ dashboard: │  │ subscription:│
       │ CFO Weekly  │  │ Sales Q3   │  │ Mon 9am PDF  │
       └─────────────┘  └────────────┘  └──────────────┘
```

Built with a force-directed layout (d3-force or react-flow); user
can pin nodes, expand/collapse subtrees.

## 7. Validators

```ts
export const rollbackSchema = z.object({
  versionId: z.string().uuid(),
  justification: z.string().min(1).max(500),
});

export const createBranchSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  baseVersionId: z.string().uuid(),
});

export const tagVersionSchema = z.object({
  versionId: z.string().uuid(),
  tagName: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/),
});

export const lineageQuerySchema = z.object({
  type: z.enum(['dataset','analysis','dashboard','datasource','rls_rule','semantic_model','datasource_table']),
  id: z.string().uuid(),
  depth: z.coerce.number().int().min(1).max(10).optional(),
});
```

## 8. Test plan

```
VR-VER-H-01    update dataset → new version row created
VR-VER-H-02    version_number is monotonic per (dataset, branch)
VR-VER-H-03    parent_version_id chains correctly
VR-VER-H-04    diff_from_parent.changed has both from + to
VR-VER-N-01    save with zero changes → no new version
VR-DIFF-H-01   diff endpoint returns added/removed/changed
VR-DIFF-H-02   SQL field diff is line-level
VR-ROLL-H-01   rollback restores entity to target version content
VR-ROLL-H-02   rollback writes a NEW version with edit_message
VR-ROLL-N-01   rollback to version from different dataset → 400
VR-TAG-H-01    tagging a version sets tag_name
VR-TAG-H-02    tagged versions survive retention sweep
VR-BR-H-01     create branch → new chain starting at v1
VR-BR-H-02     edits on branch don't affect main
VR-DRAFT-H-01  open draft → not visible to downstream
VR-DRAFT-H-02  publish draft → becomes new live version
VR-DRAFT-H-03  discard draft → no trace remains
VR-BLAME-H-01  blame field returns chronological changes
VR-RET-H-01    90-day-old untagged version moved to archive
VR-RET-H-02    snapshot-referenced version retained
VR-LIN-H-01    save dataset SQL → lineage edges rebuilt
VR-LIN-H-02    upstream query returns datasource → dataset edges
VR-LIN-H-03    downstream query returns dataset → analyses
VR-LIN-H-04    impact endpoint groups by type with counts
VR-LIN-N-01    cycle in lineage (shouldn't happen, but) → CTE depth-capped
VR-SQL-PARSE-H-01  CTE references both base tables → both parsed
VR-SQL-PARSE-N-01  syntactically broken SQL → no edges added, no crash
VR-EXP-H-01    workspace export yields YAML bundle with all entities
```

## 9. Migration & rollout

1. Phase 1 — `dataset_version` table + indexer hook on
   add/update. No new UI yet.
2. Phase 2 — diff endpoint + history panel UI.
3. Phase 3 — rollback + tag.
4. Phase 4 — same for dashboard / analysis / RLS / semantic_model.
5. Phase 5 — lineage edges + impact UI.
6. Phase 6 — drafts.
7. Phase 7 — branches (advanced).
8. Phase 8 — Git export YAML.

Feature flag `enableVersioning` per org.

## 10. Open questions

- **Storage cost.** A versioned dataset with 100 edits and
  10k fields = ~10 MB. Manageable; the archive job keeps it bounded.
- **Column-level lineage** is hard without a SQL semantic
  analyser. v2.
- **Branch merging** is harder still. v3.
- **Git write-back** — needs conflict UI. v2.
- **Cross-entity rollback** ("restore Q3 release across all
  entities") — possible via tag, but the UX is delicate. v2.

## 11. References

- pgsql-ast-parser: <https://github.com/oguimbal/pgsql-ast-parser>
- `diff` npm: <https://github.com/kpdecker/jsdiff>
- Looker LookML in Git: <https://cloud.google.com/looker/docs/version-control-and-deploying-changes>
- dbt model versioning: <https://docs.getdbt.com/docs/collaborate/govern/model-versions>
- Hex versions: <https://learn.hex.tech/docs/explore-hex/versioning>

## Appendix · Review additions

- **Branches + PRs** — §4.12.
- **Column-level lineage** flagged as v2 — §4.7.
- **Impact analysis** UI surface — §6.3.
- **Selective revert** via tag + rollback chain — §4.4 + §4.10.
- **YAML workspace export** for Git mirror — §4.14.
- **Drafts** isolated until publish — §4.11.
- **Blame** per field — §4.10.
- **Retention** with tagged/snapshot exemptions — §4.13.
