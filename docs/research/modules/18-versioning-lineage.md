# 18 · Versioning, Git Sync, Lineage

## Versioning

```sql
CREATE TABLE object_version (
  id          uuid PRIMARY KEY,
  target_type varchar(16) NOT NULL,        -- analysis|dashboard|dataset|semantic_model|rls_rule
  target_id   uuid NOT NULL,
  version     int NOT NULL,
  body        jsonb NOT NULL,
  comment     text,
  author_id   uuid NOT NULL,
  created_on  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, version)
);
```

On every save:

```ts
async function saveAnalysis(a: Analyses) {
  const last = await ObjectVersion.findOne({
    where: { targetType: 'analysis', targetId: a.id },
    order: { version: 'DESC' },
  });
  const v = (last?.version ?? 0) + 1;
  await Analyses.save(a);
  await ObjectVersion.insert({
    targetType: 'analysis', targetId: a.id, version: v,
    body: serialize(a), authorId: ctx.user.id,
  });
}
```

Revert: load the body, write a new max-version with `body = oldBody`,
update the live row.

Diff UI: side-by-side JSON, or render two pseudo-canvases for visual
diffs.

## Git sync (later)

```sql
CREATE TABLE git_sync_config (
  organisation_id uuid PRIMARY KEY,
  provider       varchar(16) NOT NULL,            -- github|gitlab|bitbucket
  repo           varchar(255) NOT NULL,
  branch         varchar(64) NOT NULL DEFAULT 'main',
  pat_enc        bytea NOT NULL,
  webhook_secret varchar(64),
  last_synced_at timestamptz,
  status         varchar(16) NOT NULL DEFAULT 'idle'
);
```

Sync direction:

- **DBExec → Git** — on save, serialise to YAML and `git commit + push`.
- **Git → DBExec** — webhook receives push event, pulls + applies.

Conflict policy: last-writer-wins per object; PR-based review optional
(advanced).

## Lineage

Computed graph (no separate table):

```ts
function lineage(start: { type: string; id: string }): LineageGraph {
  const nodes = new Map<string, LineageNode>();
  const edges: LineageEdge[] = [];

  const visit = async (n: LineageNode) => {
    if (nodes.has(`${n.type}:${n.id}`)) return;
    nodes.set(`${n.type}:${n.id}`, n);
    for (const child of await childrenOf(n)) {
      edges.push({ from: n, to: child });
      await visit(child);
    }
  };
  visit(start);
  return { nodes: [...nodes.values()], edges };
}
```

FE: react-flow-style graph component. Nodes coloured by type. Click =
navigate to that object.

## Tests

- **VER-H-01** — saving creates v2, body matches
- **VER-H-02** — revert v1 makes live = v1
- **VER-DIFF-H-01** — diff shows changed fields
- **LIN-H-01** — dataset → analyses → dashboards graph correct

## Appendix · Review additions

- **Branches** (LookML dev mode): user edits a branch, merges when
  ready. Prod unaffected during edits.
- **Pull requests** between branches with diff + approval workflow.
- **Column-level lineage**: which visual's metric ultimately reads
  which source column.
- **Lineage from external systems** (dbt model → DBExec dataset).
- **Impact analysis**: renaming a column → 7 affected analyses.
- **Time-travel**: "what did this dashboard look like 30 days ago".
- **Selective revert**: restore a single visual to old state without
  reverting the rest.

### Schema delta

```sql
CREATE TABLE branch (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(64) NOT NULL,
  base_branch_id  uuid REFERENCES branch(id),
  created_by      uuid NOT NULL,
  status          varchar(16) NOT NULL DEFAULT 'open',
  merged_at       timestamptz,
  merged_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch_change (
  id          uuid PRIMARY KEY,
  branch_id   uuid NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  target_type varchar(16) NOT NULL,
  target_id   uuid NOT NULL,
  action      varchar(16) NOT NULL,    -- create|update|delete
  body        jsonb,
  author_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE column_lineage (
  dataset_id  uuid NOT NULL,
  column_name varchar(255) NOT NULL,
  sources     jsonb NOT NULL,           -- [{ datasource_id, schema, table, column }]
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, column_name)
);
```

### Impact analysis algorithm

```ts
async function impactOf(datasetId: string, columnName: string) {
  // 1. Find custom_fields that reference the column
  // 2. Find visuals whose field_mapping references those columns
  // 3. Find analyses containing those visuals
  // 4. Find dashboards containing those analyses
  // 5. Find subscriptions/alerts targeting those
  return { customFields, visuals, analyses, dashboards, subscriptions, alerts };
}
```

### Test IDs

- VER-BRANCH-H-01 — edit on branch doesn't affect prod
- VER-MERGE-H-01 — merge applies all branch changes
- VER-PR-H-01 — PR shows diff + supports approve
- LIN-COL-H-01 — column lineage traces metric to source column
- LIN-IMPACT-H-01 — renaming source column lists affected analyses
- VER-SELECT-H-01 — revert a single visual without reverting rest
