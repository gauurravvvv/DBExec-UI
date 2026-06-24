# 17 · Search, Tags, Collections, Favourites

## Concepts

- **Search** — Cmd-K palette across all objects.
- **Tags** — string labels attached to any object.
- **Collections** — curated groupings (folder-like but cross-cutting).
- **Favourites** — per-user star.

## Schema

```sql
CREATE TABLE tag (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(64) NOT NULL,
  colour          varchar(16),
  UNIQUE (organisation_id, name)
);
CREATE TABLE tag_attachment (
  tag_id      uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  target_type varchar(16) NOT NULL,
  target_id   uuid NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);

CREATE TABLE collection (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  description     text,
  parent_id       uuid REFERENCES collection(id),
  created_by      uuid NOT NULL
);
CREATE TABLE collection_item (
  collection_id uuid NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  target_type   varchar(16) NOT NULL,
  target_id     uuid NOT NULL,
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, target_type, target_id)
);

CREATE TABLE favourite (
  user_id     uuid NOT NULL,
  target_type varchar(16) NOT NULL,
  target_id   uuid NOT NULL,
  pinned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);
```

## Search indices

For Postgres:

```sql
ALTER TABLE dashboard  ADD COLUMN search_doc tsvector;
CREATE INDEX dashboard_search_idx ON dashboard USING GIN(search_doc);
CREATE TRIGGER dashboard_search_update BEFORE INSERT OR UPDATE ON dashboard
  FOR EACH ROW EXECUTE FUNCTION dashboard_search_trigger();
-- Same pattern for analyses, datasets, dataset_field
```

Search endpoint:

```ts
async function search(orgId: string, q: string) {
  const tsq = q.trim().split(/\s+/).map(w => `${w}:*`).join(' & ');
  return {
    dashboards: await sql`
      SELECT id, name, description FROM dashboard
       WHERE organisation_id = ${orgId}
         AND search_doc @@ to_tsquery('english', ${tsq})
       LIMIT 10`,
    analyses:   /* ... */,
    datasets:   /* ... */,
    users:      /* ... */,
  };
}
```

## Cmd-K palette

FE: open with Cmd-K (Ctrl-K on Windows). Debounce 150ms. Show 4 groups
(Dashboards, Analyses, Datasets, People). Arrow-key navigation, Enter
opens.

## Tags + Collections UX

- Right-click any object → "Add tag" / "Add to collection".
- List page filter: chip with tag name; "Has tag X".
- Sidebar: a "Collections" section with the user's pinned collections.

## Tests

- **SR-H-01** — Cmd-K opens palette
- **SR-H-02** — search returns dashboards by partial name
- **SR-TAG-H-01** — tag created, attached, filtered
- **SR-COL-H-01** — collection contains 3 objects, ordering preserved
- **SR-FAV-H-01** — favourite star shows on home; unstarred removes it
