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
