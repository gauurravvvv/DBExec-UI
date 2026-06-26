# Search, tags, collections, favourites

> Implementation companion to research module 17. Pins the
> unified `search_doc` table, hybrid ranking (tsvector +
> pg_trgm + pgvector + recency), Cmd-K palette, tags,
> collections, and favourites.

**Status:** 🔴 not in product (favourites + tag tables exist
half-built; no unified search).
**Effort:** M-L (~3 weeks).

---

## 0. Problem statement

Users have 200 dashboards, 800 analyses, 50 datasets, and
1,000 saved queries across an org. They need to find things by
name, by description, by content of the SQL, by tag, by
recent-use, by who owns it. Today: a flat list with a string
match. Insufficient.

Build a unified search that indexes every kind, ranks by
relevance + recency, supports filters (kind, owner, tag), and
opens in milliseconds from Cmd-K.

---

## 1. Data model

```sql
CREATE TABLE search_doc (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  entity_kind   TEXT NOT NULL,                       -- 'dashboard' | 'analysis' | 'dataset' | 'semantic_model' | 'saved_query'
  entity_id     UUID NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  body          TEXT,                                  -- aggregated searchable content (SQL, field names, …)
  owner_user_id UUID,
  owner_name    TEXT,                                  -- denormalised for display
  tag_ids       UUID[],
  ts_vec        TSVECTOR,                              -- generated
  trgm_field    TEXT,                                  -- trigram-friendly title+body concat
  embedding     VECTOR(384),                            -- pgvector; populated by an embedder
  popularity    REAL NOT NULL DEFAULT 0,               -- decayed view count
  updated_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);

-- Maintain ts_vec via trigger or generated column
ALTER TABLE search_doc
  ADD COLUMN ts_vec_gen TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED;

CREATE INDEX idx_search_doc_org ON search_doc(org_id);
CREATE INDEX idx_search_doc_ts ON search_doc USING GIN (ts_vec_gen);
CREATE INDEX idx_search_doc_trgm ON search_doc USING GIN (trgm_field gin_trgm_ops);
CREATE INDEX idx_search_doc_embedding ON search_doc USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE tag (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  color     TEXT,
  description TEXT,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_tag_name ON tag(org_id, lower(name));

CREATE TABLE collection (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  description TEXT,
  cover_emoji TEXT,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_item (
  collection_id UUID NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  entity_kind   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, entity_kind, entity_id)
);

CREATE TABLE favourite (
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entity_kind, entity_id)
);

CREATE TABLE recent_view (
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entity_kind, entity_id)
);
CREATE INDEX idx_recent_user ON recent_view(user_id, viewed_at DESC);

CREATE TABLE saved_search (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  query       TEXT NOT NULL,
  filters     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Indexing pipeline

Every CUD on a searchable entity emits a `search_index` job to
BullMQ. The worker re-derives the `search_doc` row.

```typescript
// src/services/search/indexer.ts
export async function indexEntity(kind: string, id: string): Promise<void> {
  const doc = await deriveSearchDoc(kind, id);
  if (!doc) {
    // Entity deleted → drop from index
    await connection.getRepository('SearchDoc').delete({ entityKind: kind, entityId: id });
    return;
  }
  // Compute embedding from title+description+body
  doc.embedding = await embedderClient.embed(`${doc.title}\n${doc.description}\n${doc.body}`);
  doc.trgmField = `${doc.title} ${doc.description ?? ''}`.toLowerCase();

  await connection.query(`
    INSERT INTO search_doc
      (entity_kind, entity_id, org_id, title, description, body, owner_user_id, owner_name,
       tag_ids, trgm_field, embedding, popularity, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (entity_kind, entity_id) DO UPDATE SET
      title=EXCLUDED.title, description=EXCLUDED.description, body=EXCLUDED.body,
      owner_user_id=EXCLUDED.owner_user_id, owner_name=EXCLUDED.owner_name,
      tag_ids=EXCLUDED.tag_ids, trgm_field=EXCLUDED.trgm_field,
      embedding=EXCLUDED.embedding, updated_at=EXCLUDED.updated_at
  `, [...]);
}

async function deriveSearchDoc(kind: string, id: string) {
  switch (kind) {
    case 'dashboard': return deriveDashboard(id);
    case 'analysis':  return deriveAnalysis(id);
    case 'dataset':   return deriveDataset(id);
    case 'semantic_model': return deriveSemanticModel(id);
    case 'saved_query': return deriveSavedQuery(id);
  }
}

async function deriveDataset(id: string) {
  const ds = await loadDatasetWithFields(id);
  return {
    entityKind: 'dataset',
    entityId: ds.id,
    orgId: ds.orgId,
    title: ds.name,
    description: ds.description,
    body: [
      ds.sourceSql ?? '',
      ds.fields.map((f: any) => `${f.displayName} ${f.name}`).join(' '),
    ].join('\n'),
    ownerUserId: ds.ownerUserId,
    ownerName: ds.owner.name,
    tagIds: ds.tagIds ?? [],
    popularity: ds.popularity ?? 0,
    updatedAt: ds.updatedAt,
  };
}
```

Embedding model: a small open-source model (e.g.,
`bge-small-en-v1.5`, 384 dim) served via an internal Python
microservice or via a CPU-friendly Node binding. Embedding
recompute is async — search works with last-known embedding.

---

## 3. Search controller

```typescript
// src/controllers/search/search.ts
const search = async (req: Request, res: Response) => {
  const { q, kinds, ownerId, tagIds, limit = 20 } = req.query as any;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const orgId = orgData.orgId;

    // Generate query embedding (cached per query string for 5 min)
    const qEmbedding = await embedQuery(q);

    const sql = `
      WITH scored AS (
        SELECT
          d.entity_kind, d.entity_id, d.title, d.description, d.owner_name, d.tag_ids,
          ts_rank_cd(d.ts_vec_gen, plainto_tsquery('english', $1))             AS ts_score,
          similarity(d.trgm_field, $1)                                          AS trgm_score,
          1 - (d.embedding <=> $2)                                              AS sem_score,
          d.popularity                                                          AS pop_score,
          EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400                    AS days_old
        FROM search_doc d
        WHERE d.org_id = $3
          ${kinds ? `AND d.entity_kind = ANY($4::text[])` : ''}
          ${ownerId ? `AND d.owner_user_id = $5` : ''}
          ${tagIds ? `AND d.tag_ids && $6::uuid[]` : ''}
      )
      SELECT *,
        (0.40 * ts_score + 0.20 * trgm_score + 0.25 * sem_score + 0.10 * pop_score
         - 0.05 * LEAST(days_old / 30, 1)) AS final_score
      FROM scored
      WHERE ts_score > 0 OR trgm_score > 0.2 OR sem_score > 0.5
      ORDER BY final_score DESC
      LIMIT $${kinds && ownerId && tagIds ? 7 : 4};
    `;
    const rows = await connection.query(sql, [q, qEmbedding, orgId, kinds, ownerId, tagIds, limit].filter(v => v !== undefined));

    // Filter by RLS — entities the user can't access drop out
    const accessible = await filterByAccess(rows, loggedInId, orgId);

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, SEARCH_MSG.OK, { results: accessible });
  } catch (err: any) {
    Logger.error(`Search failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

Ranking weights are tunable via `org_search_config` — orgs can
dial up semantic vs. lexical.

---

## 4. Cmd-K palette

A FE-only component that floats over the app, debounces the
query (150 ms), shows recent + favourites until typing starts,
then full results.

```typescript
// src/app/shared/components/command-palette/command-palette.component.ts
@Component({
  selector: 'app-command-palette',
  templateUrl: './command-palette.component.html',
})
export class CommandPaletteComponent implements OnInit {
  isOpen = signal(false);
  query = signal('');
  results = signal<SearchResult[]>([]);
  recent = signal<SearchResult[]>([]);
  favourites = signal<SearchResult[]>([]);
  selectedIndex = signal(0);

  private debounceTimer: any;

  ngOnInit() {
    fromEvent(window, 'keydown').pipe(
      filter((ev: any) => (ev.metaKey || ev.ctrlKey) && ev.key === 'k'),
    ).subscribe((ev: any) => { ev.preventDefault(); this.toggle(); });

    // Preload recent + favourites
    this.search.getRecent().then(r => this.recent.set(r));
    this.search.getFavourites().then(f => this.favourites.set(f));
  }

  onQueryChange(q: string) {
    this.query.set(q);
    clearTimeout(this.debounceTimer);
    if (!q) { this.results.set([]); return; }
    this.debounceTimer = setTimeout(async () => {
      const r = await this.search.search(q);
      this.results.set(r);
      this.selectedIndex.set(0);
    }, 150);
  }

  onKeydown(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown') this.selectedIndex.update(i => Math.min(i + 1, this.results().length - 1));
    if (ev.key === 'ArrowUp') this.selectedIndex.update(i => Math.max(i - 1, 0));
    if (ev.key === 'Enter') this.open(this.results()[this.selectedIndex()]);
    if (ev.key === 'Escape') this.close();
  }

  open(r: SearchResult) {
    this.router.navigate([r.routerLink]);
    this.close();
  }
}
```

Template highlights:

- Empty state: "Recent" + "Favourites" + "Type to search".
- Result rows: icon-by-kind + title + breadcrumbs + tags.
- Keyboard: ↑/↓ navigate, Enter open, Esc close, Cmd-K toggle.
- Filters surface as inline chips: type `kind:dashboard` or
  `owner:bob`.

---

## 5. Tag / collection / favourite endpoints

```
POST   /tag/add                   {name, color, description}
PATCH  /tag/update/:id
DELETE /tag/delete/:id
GET    /tag/list

POST   /collection/add
POST   /collection/:id/add-item
DELETE /collection/:id/remove-item
GET    /collection/:id

POST   /favourite/toggle          {entityKind, entityId}
GET    /favourite/list

POST   /recent/record             {entityKind, entityId}     -- called on every entity open
GET    /recent/list

POST   /saved-search/add          {name, query, filters}
GET    /saved-search/list
DELETE /saved-search/delete/:id
```

Each follows the standard controller pattern.

---

## 6. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_search_query_total` | counter | `org`, `has_filters` | volume |
| `dbexec_search_latency_ms` | histogram | `org` | end-to-end |
| `dbexec_search_zero_results_total` | counter | `org` | leading indicator (what aren't we indexing?) |
| `dbexec_search_click_position` | histogram | — | does the top result get clicked? |
| `dbexec_search_index_lag_seconds` | gauge | — | how stale is the index |
| `dbexec_search_embed_ms` | histogram | — | embedder latency |

---

## 7. Security & threat model

| Threat | Mitigation |
|---|---|
| User searches and sees an entity they can't access | RLS-style access filter after search ranking; entity-kind-specific resolver |
| Index leaks confidential body (SQL with hard-coded ids) | `body` content tagged for sensitivity; admin can configure "exclude SQL from search body" |
| pgvector index DoS via huge query embedding | Embeddings always 384-dim; embedder validates |
| Search-as-you-type rate-abuse | Per-user rate-limit (10 req/s burst, 100 req/min sustained) |
| Cross-org entity collision (UUIDs collide?) | UUIDv4 collision probability negligible; PRIMARY KEY is `(entity_kind, entity_id)` and `org_id` filter is mandatory |
| Embedder microservice exfil | Internal-only; pinned hostname; no external request from embedder |
| Empty query with no filter returns everything | Reject empty `q` unless filters present |

---

## 8. Runbook

**Symptom: search results stale.**
1. Check `dbexec_search_index_lag_seconds`. > 60s = worker
   backlog. Scale worker count or re-trigger from
   `/admin/search/reindex/:kind`.

**Symptom: bad ranking ("the right dashboard is 5th").**
1. Inspect the score breakdown via `?explain=1` query param —
   returns the four sub-scores per row. Tune weights in
   `org_search_config`.

**Symptom: Cmd-K palette never opens.**
1. Keyboard handler conflict with a chart that captures
   keydowns. Fix: stop propagation only when palette is open.

---

## 9. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Search query (full hybrid) | 80 ms | 250 ms | 1 s |
| Embed query (cached) | 1 ms | 5 ms | 20 ms |
| Embed query (cold) | 30 ms | 100 ms | 500 ms |
| Cmd-K render | 8 ms | 30 ms | 100 ms |
| Index a single entity | 30 ms | 100 ms | 1 s |

---

## 10. Migration & rollout

1. **Migrations:** create `search_doc`, `tag`, `collection`,
   `collection_item`, `favourite`, `recent_view`, `saved_search`.
   Install `pg_trgm` and `pgvector` extensions.
2. **Initial index:** one-time backfill cron that iterates every
   entity per org → calls `indexEntity()`.
3. **Embedder service** provisioned (CPU-friendly, ~50 MB RAM
   per replica).
4. **Feature flag:** `feature.search_v2`. Old search remains
   for fallback.
5. **GA:** after backfill complete + p95 < 250ms in soak.

---

## 11. Open questions

1. **Synonyms / spell-correct** — trgm catches typos; explicit
   synonym dictionary per org (v2).
2. **Personalised ranking** — boost entities the user often
   opens. Add `user_personal_pop` decayed counter. v2.
3. **Cross-org global admin search** — for support staff. Sep
   endpoint with audit-logged superpower.
4. **Comment search** — module 18's comments could be indexed.
   Defer.

---

## 12. References

- [17-search-catalogue.md](../research/modules/17-search-catalogue.md)
- [18-versioning-lineage.md](../research/modules/18-versioning-lineage.md)
- [25-ai-insights.md](../research/modules/25-ai-insights.md)
- pgvector docs (ivfflat vs hnsw)
- PostgreSQL `pg_trgm` docs
- BGE / e5 embedding model cards
