# 17 · Search, Tags, Collections, Favourites

> The discovery surface. As DBExec accumulates hundreds of
> dashboards, dozens of datasets, and thousands of analyses,
> "browse the sidebar" stops scaling. Cmd-K palette becomes the
> primary navigation. This module is the substrate that makes it
> fast and useful.
>
> Sister modules: [22 · API & SDK](22-api-sdk-plugins.md) for the
> programmatic search endpoint, [18 · Versioning & Lineage](18-versioning-lineage.md)
> for the "things that reference X" inverse search.

**Depends on:** Dataset (03), Analysis (06), Dashboard (08), Auth (10)
**Unblocks:** Cmd-K UX, "where is X used", documentation portal
**Maturity:** 🟡 basic name-only search on list pages; no global search

---

## 1. Industry baseline

| Tool | Search surface | Tech | Fuzzy | Semantic |
|---|---|---|---|---|
| **Tableau** | "Explore" search across workbooks / datasources | Lucene-ish in-app index | ✓ | ✗ |
| **Looker** | Search bar in nav | Looker's own index | ✓ | ✗ |
| **Power BI** | Workspace search + global search | Azure Cog Search | ✓ | partial (recent) |
| **Notion** | Universal search Cmd-K | Postgres ts_vector + recent custom | ✓ | ✓ ("ask AI") |
| **Linear** | Cmd-K | Postgres + Algolia hybrid | ✓ | ✓ |
| **Figma** | Quick search Cmd-/ | Postgres + custom ranking | ✓ | ✗ |
| **Hex** | Cmd-K across notebooks / projects | Postgres + pgvector | ✓ | ✓ |
| **Metabase** | Search bar | Postgres ts_vector | ✓ | ✗ |
| **Superset** | List-page filter only | Postgres ILIKE | ✗ | ✗ |

**The patterns to copy:**

- **Two-pass ranking**: lexical (ts_vector) for "this is a likely
  match" + semantic (pgvector) for "this is conceptually related".
  Lexical alone misses "show me Q3 revenue" finding the "Quarterly
  Sales" dashboard.
- **Org-scoped + RLS-aware**. Users only see what they can open —
  search results that 404 on click are worse than no results.
- **Tags + Collections + Favourites are SEPARATE concepts**.
  Tag = label applied by an admin (`pii`, `experimental`). Collection
  = user-curated set (a folder). Favourite = personal bookmark.
  Conflating them is a UX trap many tools fall into.
- **Recent + Saved searches** boost mostly-used queries to the top.
- **Boost recently-viewed / recently-edited** in ranking — recency
  is a strong signal.

## 2. DBExec today

- Per-listing search via `ILIKE '%term%'` against `name`. Slow on
  large tables, no relevance ranking, no fuzzy matching.
- No global Cmd-K. No tags. No collections. No favourites.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| SR-G01 | Cross-object search (datasets, analyses, dashboards, users) | P0 | M |
| SR-G02 | Lexical full-text via `ts_vector` + GIN index | P0 | M |
| SR-G03 | Fuzzy via `pg_trgm` for typos | P0 | S |
| SR-G04 | Semantic via `pgvector` (embeddings of name + description) | P1 | L |
| SR-G05 | Boost by recency (last-viewed, last-edited) | P0 | S |
| SR-G06 | Boost by user affinity (I open X often) | P1 | M |
| SR-G07 | RLS / permission filter on results | P0 | M |
| SR-G08 | Tags entity + tag picker UI | P0 | M |
| SR-G09 | Collections (folder-like grouping) | P1 | M |
| SR-G10 | Favourites (per-user bookmark) | P0 | S |
| SR-G11 | Recent items per user | P0 | S |
| SR-G12 | Saved searches | P1 | S |
| SR-G13 | "What links here" — inverse references | P1 | M |
| SR-G14 | Search analytics (popular terms, no-result terms) | P2 | S |
| SR-G15 | Cmd-K command palette UI | P0 | M |
| SR-G16 | Keyboard-only result navigation | P0 | S |

## 4. Target architecture

### 4.1 Postgres-native, no external search service

The default DBExec deployment is one Postgres database per org. We
avoid adding Elasticsearch / Algolia for v1:

- `pg_trgm` + `tsvector` cover lexical + fuzzy at hundreds-of-MB
  index size for ≤100k objects per org.
- `pgvector` adds semantic search via embeddings (1536-dim for
  OpenAI ada-002, or 768-dim for sentence-transformers).
- Per-org isolation falls out for free — search runs against the
  org's own DB.

Trade-off: ranking quality is decent, not Algolia-class. Worth
it for operational simplicity until a customer exists who needs
better.

### 4.2 Schema

```sql
-- migration: 2026-11-XX_search_catalogue.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector

-- A unified search index across all searchable entities. Keeping
-- it in one table lets the API do a single query for "find X
-- across all kinds" instead of N UNION queries.
CREATE TABLE search_doc (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,

  -- Source pointer
  object_type     varchar(32) NOT NULL,   -- dataset | analysis | dashboard | user | tag | collection
  object_id       uuid NOT NULL,

  -- Search-relevant text fields
  title           varchar(255) NOT NULL,
  subtitle        varchar(500),
  body            text,                    -- description, comments, etc.
  tags            text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Computed
  search_vector   tsvector,                -- maintained by trigger
  embedding       vector(1536),            -- maintained by background job

  -- Signals for ranking
  owner_user_id   uuid,
  last_edited_at  timestamptz,
  last_viewed_at  timestamptz,
  view_count_30d  int NOT NULL DEFAULT 0,
  edit_count_30d  int NOT NULL DEFAULT 0,

  -- Status
  status          smallint NOT NULL DEFAULT 1,
  visibility      varchar(16) NOT NULL DEFAULT 'private',   -- private|org|public

  -- Maintenance
  indexed_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, object_type, object_id)
);

CREATE INDEX search_doc_tsv
  ON search_doc USING GIN (search_vector);
CREATE INDEX search_doc_title_trgm
  ON search_doc USING GIN (title gin_trgm_ops);
CREATE INDEX search_doc_subtitle_trgm
  ON search_doc USING GIN (subtitle gin_trgm_ops);
CREATE INDEX search_doc_tags
  ON search_doc USING GIN (tags);
CREATE INDEX search_doc_embedding
  ON search_doc USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX search_doc_org_recency
  ON search_doc (organisation_id, last_viewed_at DESC NULLS LAST);

-- tsvector maintained by trigger
CREATE OR REPLACE FUNCTION search_doc_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
       setweight(to_tsvector('english', coalesce(NEW.title, '')),    'A')
    || setweight(to_tsvector('english', coalesce(NEW.subtitle, '')), 'B')
    || setweight(to_tsvector('english', coalesce(NEW.body, '')),     'C')
    || setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER search_doc_tsv_bef
  BEFORE INSERT OR UPDATE OF title, subtitle, body, tags ON search_doc
  FOR EACH ROW EXECUTE FUNCTION search_doc_tsv_update();

-- Tags
CREATE TABLE tag (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(64) NOT NULL,    -- canonical (lowercase, snake)
  display_name    varchar(64) NOT NULL,
  color           varchar(16),
  created_on      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE TABLE tag_assignment (
  tag_id          uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  object_type     varchar(32) NOT NULL,
  object_id       uuid NOT NULL,
  assigned_by     uuid,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, object_type, object_id)
);
CREATE INDEX tag_assignment_object ON tag_assignment (object_type, object_id);

-- Collections (folder-like)
CREATE TABLE collection (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  description     varchar(500),
  parent_id       uuid REFERENCES collection(id) ON DELETE CASCADE,
  visibility      varchar(16) NOT NULL DEFAULT 'private',
  owner_user_id   uuid NOT NULL,
  cover_color     varchar(16),
  icon            varchar(32),
  created_on      timestamptz NOT NULL DEFAULT now(),
  deleted_on      timestamptz
);

CREATE TABLE collection_item (
  collection_id   uuid NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  object_type     varchar(32) NOT NULL,
  object_id       uuid NOT NULL,
  sequence        int NOT NULL DEFAULT 0,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, object_type, object_id)
);

-- Favourites (per user, simple)
CREATE TABLE favourite (
  user_id     uuid NOT NULL,
  object_type varchar(32) NOT NULL,
  object_id   uuid NOT NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, object_type, object_id)
);

-- Recently viewed (per user) — pruned at 100 most recent per user
CREATE TABLE recent_view (
  user_id     uuid NOT NULL,
  object_type varchar(32) NOT NULL,
  object_id   uuid NOT NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, object_type, object_id)
);
CREATE INDEX recent_view_recent ON recent_view (user_id, viewed_at DESC);

-- Saved searches
CREATE TABLE saved_search (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL,
  name            varchar(100) NOT NULL,
  query           varchar(500) NOT NULL,
  filters         jsonb,
  shortcut_key    varchar(16),               -- "1".."9" for keyboard
  created_on      timestamptz NOT NULL DEFAULT now()
);

-- Search analytics — what users actually search for
CREATE TABLE search_event (
  id              bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL,
  user_id         uuid,
  query           varchar(500) NOT NULL,
  result_count    int NOT NULL,
  clicked_object_type varchar(32),
  clicked_object_id   uuid,
  clicked_rank    int,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_event_org ON search_event (organisation_id, occurred_at DESC);
```

### 4.3 Indexing pipeline

The `search_doc` table is a denormalised projection. It's kept in
sync by:

```ts
// src/shared/services/search/searchIndexer.ts

export async function indexDataset(dataset: Dataset, conn: DataSource) {
  const fields = await DatasetField.find({ where: { datasetId: dataset.id } });
  const tagNames = await loadTagNames('dataset', dataset.id);

  await conn.query(`
    INSERT INTO search_doc (
      organisation_id, object_type, object_id,
      title, subtitle, body, tags,
      owner_user_id, last_edited_at, status, visibility
    ) VALUES ($1,'dataset',$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (organisation_id, object_type, object_id) DO UPDATE
    SET title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        body = EXCLUDED.body,
        tags = EXCLUDED.tags,
        last_edited_at = EXCLUDED.last_edited_at,
        status = EXCLUDED.status,
        visibility = EXCLUDED.visibility,
        indexed_at = now()`,
    [
      dataset.organisationId, dataset.id,
      dataset.name,
      `Dataset · ${fields.length} columns`,
      [dataset.description ?? '', ...fields.map(f => f.name)].join(' '),
      tagNames,
      dataset.createdBy, dataset.updatedOn, dataset.status,
      'private',
    ]);

  // Embedding generation is async — enqueue if missing
  await scheduleQueue.add('search:embed', { docType: 'dataset', docId: dataset.id });
}

// Similarly for indexAnalysis, indexDashboard, indexUser, indexTag,
// indexCollection. Each emitter (the create/update controllers
// for those entities) calls the respective index function in the
// SAME transaction as the entity write — so the search index never
// shows stale state.
```

### 4.4 Embedding worker

```ts
// jobs/embedSearchDoc.ts
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function embedSearchDoc(jobData: {
  docType: string; docId: string;
}) {
  const doc = await SearchDoc.findOne({
    where: { objectType: jobData.docType, objectId: jobData.docId },
  });
  if (!doc) return;
  const text = `${doc.title}\n${doc.subtitle ?? ''}\n${doc.body ?? ''}`;
  if (text.trim().length === 0) return;

  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  const embedding = resp.data[0].embedding;

  await master_db_connection.query(
    `UPDATE search_doc
        SET embedding = $1::vector,
            indexed_at = now()
      WHERE id = $2`,
    [`[${embedding.join(',')}]`, doc.id],
  );
}
```

For air-gapped deployments, swap OpenAI for a local
sentence-transformers server (`all-MiniLM-L6-v2` is ~80 MB
download and adequate for short-text similarity).

### 4.5 Search controller

```ts
// src/modules/search/controllers/search.ts
async function search(req: Request, res: Response) {
  const q = (req.query.q as string)?.trim() ?? '';
  const types = (req.query.types as string)?.split(',') as string[] | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { orgData, loggedInId, master_db_connection } = res.locals;

  if (!q) {
    // Empty query — return recent items
    return sendResponse(res, true, CODE.SUCCESS, '', {
      results: await recentForUser(loggedInId, limit, master_db_connection),
      mode: 'recent',
    });
  }

  // Build the tsquery — escape, prefix-match each term
  const tsq = q.split(/\s+/)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(Boolean)
    .map(w => `${w}:*`)
    .join(' & ');

  const typesClause = types?.length
    ? `AND object_type = ANY($3)`
    : ``;

  // Hybrid query — lexical AND fuzzy AND optionally semantic.
  // The ORDER BY combines three signals:
  //   1. ts_rank (lexical relevance)
  //   2. similarity(title, q) (fuzzy)
  //   3. embedding cosine distance (semantic), if embedding present
  //   4. recency boost
  const rows = await master_db_connection.query(`
    WITH semantic_ref AS (
      SELECT embedding
      FROM search_doc
      WHERE organisation_id = $1
        AND embedding IS NOT NULL
        AND search_vector @@ to_tsquery('english', $2)
      ORDER BY ts_rank(search_vector, to_tsquery('english', $2)) DESC
      LIMIT 1
    )
    SELECT
      sd.id, sd.object_type, sd.object_id,
      sd.title, sd.subtitle, sd.tags,
      sd.last_viewed_at, sd.last_edited_at,
      ts_rank(sd.search_vector, to_tsquery('english', $2)) AS lex_rank,
      similarity(sd.title, $4) AS fuzzy_rank,
      CASE WHEN sr.embedding IS NOT NULL AND sd.embedding IS NOT NULL
           THEN 1 - (sd.embedding <=> sr.embedding) ELSE 0 END AS sem_rank,
      CASE WHEN sd.last_viewed_at IS NULL THEN 0
           ELSE 1.0 / (1 + EXTRACT(EPOCH FROM (now() - sd.last_viewed_at)) / 86400)
      END AS recency_rank
    FROM search_doc sd
    LEFT JOIN semantic_ref sr ON true
    WHERE sd.organisation_id = $1
      AND sd.status = 1
      AND (sd.search_vector @@ to_tsquery('english', $2)
           OR sd.title % $4
           OR sd.tags && string_to_array($4, ' '))
      ${typesClause}
    ORDER BY (
      lex_rank * 1.0 +
      fuzzy_rank * 0.5 +
      sem_rank * 0.7 +
      recency_rank * 0.3
    ) DESC
    LIMIT $5`,
    [orgData.id, tsq, types ?? [], q, limit]);

  // Filter by permission — drop results the user can't open.
  // For now, simple owner-or-shared check. RLS-strict filtering
  // happens on the detail load.
  const filtered = await filterByPermission(rows, loggedInId, master_db_connection);

  // Log the search for analytics
  await SearchEvent.insert({
    organisationId: orgData.id,
    userId: loggedInId,
    query: q,
    resultCount: filtered.length,
  }).catch(() => {});

  return sendResponse(res, true, CODE.SUCCESS, '', {
    results: filtered,
    mode: 'search',
  });
}
```

### 4.6 Recent items

```ts
async function recentForUser(userId: string, limit: number, conn: DataSource) {
  const rows = await conn.query(`
    SELECT sd.object_type, sd.object_id, sd.title, sd.subtitle,
           sd.tags, rv.viewed_at
    FROM recent_view rv
    JOIN search_doc sd ON sd.object_type = rv.object_type
                       AND sd.object_id = rv.object_id
    WHERE rv.user_id = $1
      AND sd.status = 1
    ORDER BY rv.viewed_at DESC
    LIMIT $2`, [userId, limit]);
  return rows;
}

// Called from every "view" endpoint (renderDashboard, openAnalysis, ...)
export async function recordView(userId: string, objectType: string, objectId: string) {
  await master_db_connection.query(`
    INSERT INTO recent_view (user_id, object_type, object_id, viewed_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (user_id, object_type, object_id)
    DO UPDATE SET viewed_at = EXCLUDED.viewed_at`,
    [userId, objectType, objectId]);

  // Prune old: keep only 100 most recent per user
  await master_db_connection.query(`
    DELETE FROM recent_view
    WHERE user_id = $1
      AND viewed_at < (
        SELECT viewed_at FROM recent_view
        WHERE user_id = $1
        ORDER BY viewed_at DESC
        OFFSET 100 LIMIT 1
      )`, [userId]);

  // Also bump view_count on search_doc — debounced via a counter so
  // we don't hammer the row on every render
  await viewCounter.bump(objectType, objectId);
}
```

### 4.7 Tags

```ts
// POST /tags  body: { name, displayName, color }
async function createTag(req, res) {
  const { name, displayName, color } = req.body;
  const canonical = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  await Tag.upsert({
    organisationId: res.locals.orgData.id,
    name: canonical,
    displayName,
    color,
  }, ['organisationId', 'name']);
}

// POST /tags/:id/assign  body: { objectType, objectId }
async function assignTag(req, res) {
  await TagAssignment.upsert({
    tagId: req.params.id,
    objectType: req.body.objectType,
    objectId: req.body.objectId,
    assignedBy: res.locals.loggedInId,
  }, ['tagId', 'objectType', 'objectId']);

  // Re-index the object to include this tag
  await reIndex(req.body.objectType, req.body.objectId);
}
```

### 4.8 Collections

Folder-like structure. A collection can contain any object type:

```ts
// POST /collections  body: { name, description, visibility, parentId? }
// POST /collections/:id/items  body: { objectType, objectId }
// PUT /collections/:id/reorder  body: { items: [{type,id,sequence}] }
```

Visibility:
- **`private`** — only the owner sees it.
- **`org`** — everyone in the org can see it.
- **`public`** — anonymous (via a public link; rare).

Collections can nest (parentId). Common pattern: an admin creates
"Sales" as an `org`-visible top-level collection, drops the sales
dashboards into it, and users see it as a sidebar group.

### 4.9 Favourites

The simplest of the three — just a per-user marker:

```ts
// POST /favourites  body: { objectType, objectId }
async function addFavourite(req, res) {
  await Favourite.upsert({
    userId: res.locals.loggedInId,
    objectType: req.body.objectType,
    objectId: req.body.objectId,
  }, ['userId', 'objectType', 'objectId']);
}
```

### 4.10 Saved searches

```ts
// POST /saved-searches  body: { name, query, filters, shortcutKey }
async function saveSearch(req, res) {
  await SavedSearch.save({
    ownerUserId: res.locals.loggedInId,
    name: req.body.name,
    query: req.body.query,
    filters: req.body.filters,
    shortcutKey: req.body.shortcutKey,    // "1".."9"
  });
}
```

The Cmd-K palette lets the user invoke saved searches with
keyboard shortcuts; "1" → run saved-search slot 1.

### 4.11 "What links here" (inverse search)

When the user views a dataset, they ask: "what analyses use this?"
The search index already has the references — we just need to
query in reverse:

```ts
// GET /search/back-references?objectType=dataset&objectId=...
async function backReferences(req, res) {
  const { objectType, objectId } = req.query;
  // For datasets: find analyses with datasetId pointing here, find
  // dashboards via published snapshot referring to those analyses,
  // find RLS rules + subscriptions, etc.
  const refs = await collectReferences(objectType as string, objectId as string,
                                       res.locals.master_db_connection);
  return sendResponse(res, true, CODE.SUCCESS, '', { refs });
}
```

See [18 · Versioning & Lineage](18-versioning-lineage.md) for the
formal lineage graph; back-references are a simpler subset.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/search?q=...&types=dataset,dashboard&limit=20` | Cross-object search |
| GET | `/search/recent` | Recent items for current user |
| POST | `/search/click` | Click telemetry (rank tracking) |
| GET | `/search/back-references?type&id` | Inverse lineage |
| GET/POST/DELETE | `/saved-searches` | CRUD |
| GET/POST/DELETE | `/tags` | CRUD |
| POST | `/tags/:id/assign` | Add tag to object |
| DELETE | `/tags/:id/assign` | Remove tag |
| GET/POST/PUT/DELETE | `/collections` | CRUD |
| POST | `/collections/:id/items` | Add object to collection |
| DELETE | `/collections/:id/items/:objType/:id` | Remove object from collection |
| POST | `/favourites` | Add |
| DELETE | `/favourites` | Remove |
| GET | `/favourites` | List mine |

## 6. FE specs

### 6.1 Cmd-K palette

```
[Cmd-K]
┌──────────────────────────────────────────────────────────┐
│ 🔍 q3 sales________________________________________      │
├──────────────────────────────────────────────────────────┤
│  Recent                                                  │
│    📊 Sales Q3 Review               2m ago               │
│    📊 Customer Churn (Q3)           1h ago               │
│  ───                                                     │
│  Results for "q3 sales"                                  │
│    📊 Sales Q3 Review               Dashboard           │
│    📈 Quarterly Sales Trend         Analysis            │
│    🗄️ sales_q3                       Dataset · 48 cols   │
│    🏷️ q3-sales (4 dashboards)        Tag                 │
│    👤 Sarah Lee (q3-sales owner)    User                │
│  ───                                                     │
│  Saved searches                                          │
│    [1]  My favourite dashboards                          │
│    [2]  Failed datasets this week                        │
│                                                          │
│  ↑↓ navigate   ↵ open   ⌘P pin   ⌘D delete              │
└──────────────────────────────────────────────────────────┘
```

Behaviour:

- Opens on Cmd-K (Mac) / Ctrl-K (others).
- Empty query → "Recent" mode.
- Debounce typing 150ms before firing /search.
- Arrow keys move highlight; Enter opens.
- Cmd-Enter opens in new tab.
- Sticky weighting: clicking a result and re-querying boosts it
  for the next 24h (saved in `search_event`).

### 6.2 Tag picker

In edit-mode for every taggable object:

```
Tags: [pii ×] [sales ×] [+ add tag]
                      ↓ (on click)
              [Search tags...      ]
              ▸ pii
              ▸ sales
              ▸ q3-sales
              ▸ experimental
              + Create "ne..."
```

### 6.3 Collections sidebar

```
SIDEBAR
─────────
⭐ Favourites
🕐 Recent
─────────
📁 Sales       (org)
   📊 Q3 Review
   📊 YoY Trend
📁 Marketing   (org)
📁 My drafts   (private)
─────────
[+ New collection]
```

### 6.4 Back-references panel

On a dataset detail page, a "Used by" tab:

```
Used by (12)
────────────
Analyses (7)
  📈 Sales by Region
  📈 Customer LTV
  ...
Dashboards (3) — via published snapshot
  📊 Sales Q3 Review
  📊 CFO Weekly
RLS rules (2)
  region-APAC-only (assigned to 12 users)
  region-EMEA-only (assigned to 8 users)
Subscriptions (0)
```

## 7. Validators

```ts
export const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  types: z.string().regex(/^[a-z,]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  displayName: z.string().min(1).max(64),
  color: z.string().regex(/^#[a-f0-9]{6}$/).optional(),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
  visibility: z.enum(['private','org','public']).default('private'),
  icon: z.string().max(32).optional(),
  coverColor: z.string().regex(/^#[a-f0-9]{6}$/).optional(),
});

export const saveSearchSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().min(1).max(500),
  filters: z.record(z.string(), z.any()).optional(),
  shortcutKey: z.string().regex(/^[1-9]$/).optional(),
});
```

## 8. Test plan

```
SR-IDX-H-01    create dataset → search_doc row appears within tx
SR-IDX-H-02    update dataset name → search_doc.title updated
SR-IDX-H-03    delete dataset (soft) → search_doc.status = 0; excluded from results
SR-IDX-H-04    embedding job runs async; doc.embedding populates ≤1m later
SR-IDX-N-01    OpenAI API down → embedding null; lexical still works

SR-LEX-H-01    "sales q3" → ranks "Sales Q3 Review" first
SR-LEX-H-02    "sale" → matches "sales" (prefix wildcard tsquery)
SR-LEX-H-03    typo "saless" → fuzzy matches (pg_trgm)
SR-LEX-H-04    tag query "#pii" → matches by tags array
SR-LEX-H-05    recency boost: identical lex_rank → newer last_viewed wins

SR-SEM-H-01    "revenue" semantically matches "Sales Trends"
SR-SEM-H-02    no embedding ref → falls back to lex+fuzzy ordering

SR-PERM-N-01   user can't open dashboard X → X excluded from results
SR-PERM-H-01   admin sees all → broader result set than viewer

SR-RECENT-H-01 viewing dataset → recent_view row updated
SR-RECENT-H-02 100 views → only 100 rows retained per user
SR-RECENT-H-03 empty Cmd-K → recent list

SR-TAG-H-01    create tag → unique per org
SR-TAG-H-02    assign tag → search_doc.tags updated
SR-TAG-H-03    unassign tag → removed from object's row

SR-COLL-H-01   create collection → org-scoped
SR-COLL-H-02   collection visibility=private → other users 404
SR-COLL-H-03   nested collections → tree traversal in sidebar
SR-COLL-H-04   add same item to two collections → both rows exist

SR-FAV-H-01    favourite → upsert; second call no-op
SR-FAV-H-02    unfavourite → row removed
SR-FAV-H-03    list favourites returns rows in added_at desc

SR-SAVED-H-01  save search with shortcutKey=2 → trigger via "2"
SR-SAVED-N-01  shortcutKey already used → 405
```

## 9. Migration & rollout

1. Phase 1 — schema (search_doc, tag, favourite, recent_view,
   saved_search, search_event) + tsvector trigger + indexer for
   dataset / analysis / dashboard. No FE.
2. Phase 2 — search controller with lexical + fuzzy. Cmd-K UI.
3. Phase 3 — pgvector + embedding worker.
4. Phase 4 — tags + collections + favourites + back-references.
5. Phase 5 — saved searches + analytics.

Feature flag `enableSearchV2`. Embedding generation gated behind
`enableSemanticSearch` so air-gapped deployments can skip OpenAI.

## 10. Open questions

- **Embedding model choice.** OpenAI text-embedding-3-small is
  cheap ($0.02 / 1M tokens) but cloud-bound. For on-prem,
  sentence-transformers all-MiniLM-L6-v2 in a sidecar container.
  Document the trade-off.
- **Index size at scale.** 100k objects × 1536-dim vectors ≈ 600MB
  per org. Acceptable for most deployments; we'd switch to
  approximate indexes (HNSW) past 1M.
- **Search permissions.** Current filterByPermission re-checks per
  row — slow at scale. Switch to denormalised `accessible_to_user_ids`
  column on search_doc when this becomes a bottleneck.
- **Stop-word handling.** English `to_tsvector` strips "the", "a",
  etc. — searches like "the Q3" lose the article naturally. Good.
- **Multi-language.** Postgres has `simple` and per-language
  tsvector configs. For now we use English; switch to `simple`
  (no stemming) for orgs with non-English data, or detect locale
  per object and store the appropriate vector.
- **Wildcard in middle of word.** Postgres ts_query doesn't
  support `sa*es` — fuzzy via pg_trgm covers the common case.

## 11. References

- pg_trgm: <https://www.postgresql.org/docs/current/pgtrgm.html>
- tsvector + ts_rank: <https://www.postgresql.org/docs/current/textsearch.html>
- pgvector: <https://github.com/pgvector/pgvector>
- IVFFlat vs HNSW: <https://github.com/pgvector/pgvector#hnsw>
- OpenAI embeddings: <https://platform.openai.com/docs/guides/embeddings>
- Notion search architecture: <https://www.notion.so/blog/how-we-built-cmd-k>

## Appendix · Review additions

- **Fuzzy via pg_trgm** for typo tolerance — §4.5.
- **Semantic via pgvector** with cosine distance — §4.4 + §4.5.
- **Hybrid ranking** combining lex + fuzzy + semantic + recency — §4.5.
- **Saved searches** with keyboard shortcuts — §4.10.
- **Recently viewed** with 100-item cap per user — §4.6.
- **Inverse references ("what links here")** — §4.11.
- **Search analytics table** for popular and no-result query
  visibility — §4.2.
- **Cmd-K palette UX** with keyboard nav — §6.1.
