# Dataset

> Implementation companion to research module 03. Datasets are
> the reusable, named, semantically-typed views that analyses
> and the semantic layer build on. This doc pins exactly how
> they're authored, validated, refreshed, and consumed.

**Status:** 🟡 partial — table exists, SQL editor exists,
field-type inference is buggy, no preview pagination, no
parameter binding.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

A dataset says "this is `Sales 2026`: a SELECT with these
joins, with these fields typed as date / string / number /
boolean / currency, owned by these people, refreshed at this
cadence, with these dependencies." It's the **noun** every
other authoring surface composes on. Today's gaps:

- Inferred types wrong for `numeric(18,2)`, `timestamptz`,
  `jsonb`, `array`.
- No "preview rows" pagination beyond a hard 100.
- No way to mark fields as `pii` / `hidden` / `display_only`.
- No relations between datasets (joins are inline SQL, can't
  be reused).
- No refresh schedule (everything is live).

---

## 1. Data model

```sql
CREATE TABLE dataset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  datasource_id   UUID NOT NULL REFERENCES datasource_s(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  source_kind     TEXT NOT NULL                -- 'sql' | 'table' | 'builder' | 'uploaded'
                    CHECK (source_kind IN ('sql', 'table', 'builder', 'uploaded')),
  source_sql      TEXT,                          -- when source_kind='sql' or 'builder'
  source_table    TEXT,                          -- when source_kind='table' ('schema.table')
  builder_state   JSONB,                         -- when source_kind='builder'
  refresh_cadence TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'cached' | 'materialised'
  refresh_cron    TEXT,                          -- when refresh_cadence='materialised'
  cache_ttl_sec   INTEGER,                       -- when refresh_cadence='cached'
  owner_user_id   UUID NOT NULL REFERENCES "user"(id),
  status          TEXT NOT NULL DEFAULT 'draft' -- 'draft' | 'published' | 'archived'
                    CHECK (status IN ('draft', 'published', 'archived')),
  row_count_est   BIGINT,                         -- updated on save / refresh
  byte_count_est  BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_dataset_slug ON dataset(org_id, slug);

CREATE TABLE dataset_field (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                     -- canonical column name (lowercased)
  display_name TEXT NOT NULL,                    -- what users see
  description TEXT,
  data_type   TEXT NOT NULL                       -- 'string' | 'number' | 'integer' | 'date' | 'timestamp' | 'boolean' | 'json' | 'array'
                CHECK (data_type IN ('string', 'number', 'integer', 'date', 'timestamp', 'boolean', 'json', 'array')),
  semantic_type TEXT,                              -- 'currency' | 'percent' | 'email' | 'phone' | 'url' | 'geo_point' | etc.
  format_args JSONB,                               -- {decimals:2, currencyCode:'USD'}
  is_pii      BOOLEAN NOT NULL DEFAULT false,
  is_hidden   BOOLEAN NOT NULL DEFAULT false,
  is_display_only BOOLEAN NOT NULL DEFAULT false,
  cardinality_hint INTEGER,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_dataset_field_name ON dataset_field(dataset_id, name);

CREATE TABLE dataset_parameter (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                     -- 'as_of_date'
  display_name  TEXT NOT NULL,
  data_type     TEXT NOT NULL,
  default_value JSONB,
  allowed_values JSONB,                              -- {kind: 'enum', values: [...]} | {kind: 'sql', sql: '...'} | null
  is_required   BOOLEAN NOT NULL DEFAULT false,
  display_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE dataset_relation (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  left_id     UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  right_id    UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL                         -- 'one_to_one' | 'one_to_many' | 'many_to_many'
                CHECK (kind IN ('one_to_one', 'one_to_many', 'many_to_many')),
  left_field  TEXT NOT NULL,
  right_field TEXT NOT NULL,
  description TEXT,
  CHECK (left_id <> right_id)
);
```

---

## 2. Source kinds — what's actually stored

| `source_kind` | What's stored | When to use |
|---|---|---|
| `sql` | `source_sql` (raw SELECT) | Power user; max flexibility |
| `table` | `source_table` ('schema.table') | Direct table mirror; no transformation |
| `builder` | `builder_state` (JSON tree of joins/filters) | Self-serve; the dataset wizard |
| `uploaded` | `source_table` pointing to managed-datasource schema | CSV/XLSX upload (module 12) |

Compilation: builder JSON compiles to SQL at save time; SQL is
re-validated on each save. Table mirror is just `SELECT * FROM <table>`.

---

## 3. Type inference + sanitisation

Run on every save:

```typescript
export async function inferFields(
  dataset: Dataset,
  pool: Pool,
  adapter: DialectAdapter,
): Promise<DatasetField[]> {
  const sample = await pool.query(dataset.source_sql ?? `SELECT * FROM ${dataset.source_table}`,
                                  [], { maxRows: 100, timeoutMs: 30_000 });

  const fields: DatasetField[] = sample.fields.map((col, i) => ({
    name: normaliseName(col.name),
    displayName: humanise(col.name),
    dataType: pgTypeToDataType(col.dataTypeID),  // adapter-specific
    semanticType: inferSemanticType(col.name, sample.rows.map(r => r[i])),
    isPii: looksLikePii(col.name),
    isHidden: false,
    isDisplayOnly: false,
    cardinalityHint: Math.min(sample.rows.length, distinctCount(sample.rows.map(r => r[i]))),
    displayOrder: i,
  }));
  return fields;
}

function inferSemanticType(name: string, values: any[]): string | null {
  if (/(_id|_pk|^id$)/i.test(name)) return 'identifier';
  if (/(price|amount|cost|revenue|total)/i.test(name)) return 'currency';
  if (/(rate|pct|percent|ratio)/i.test(name)) return 'percent';
  if (/email/i.test(name)) return 'email';
  if (/phone/i.test(name)) return 'phone';
  if (/(url|link|href)/i.test(name)) return 'url';
  if (/(lat|latitude)/i.test(name)) return 'geo_lat';
  if (/(lng|long|longitude)/i.test(name)) return 'geo_lng';
  return null;
}

function looksLikePii(name: string): boolean {
  return /(ssn|email|phone|address|first_name|last_name|dob|birthdate|passport)/i.test(name);
}
```

Authors can override every inferred value in the field editor.

---

## 4. SQL validation

`source_sql` parsed at save against a strict whitelist:

- Must be a single statement, no trailing `;`.
- Must start with `SELECT` or `WITH ... SELECT`.
- No `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `ALTER`,
  `CREATE`, `DROP`, `GRANT`, `REVOKE`, `COPY` keywords.
- No `INTO` (no `SELECT … INTO new_table`).
- Parameter references via `:param_name` binding-style only.

Library: a permissive SQL parser like `node-sql-parser` for
top-level shape check; reject anything that fails to parse.

---

## 5. Materialisation (refresh_cadence = 'materialised')

The materialiser is a BullMQ job that runs on `refresh_cron`:

```typescript
// src/services/dataset/materialiser.ts
export async function refreshDataset(datasetId: string): Promise<void> {
  const dataset = await loadDataset(datasetId);
  if (dataset.refreshCadence !== 'materialised') return;

  const adapter = engineFor(dataset.datasource.type);
  const pool = await getPool(dataset.orgId, dataset.datasource.defaultConnectionId);

  const targetSchema = `dbexec_mat_${dataset.orgId.replace(/-/g, '_')}`;
  const targetTable = `mat_${dataset.slug}_${Date.now()}`;
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`);
  await pool.query(`CREATE TABLE ${targetSchema}.${targetTable} AS ${dataset.sourceSql}`);

  // Atomic swap via view
  await pool.query(`
    BEGIN;
    DROP VIEW IF EXISTS ${targetSchema}.${dataset.slug};
    CREATE VIEW ${targetSchema}.${dataset.slug} AS SELECT * FROM ${targetSchema}.${targetTable};
    COMMIT;
  `);

  // Drop old physical tables older than 24h
  await cleanupOldMatTables(pool, targetSchema, dataset.slug, 24 * 3600);
}
```

The dataset's effective source becomes the view, which the
query processor selects from. Old materialisations kept for 24h
for rollback.

---

## 6. Controllers

```typescript
// src/controllers/dataset/addDataset.ts
const addDataset = async (req: Request, res: Response) => {
  const { name, slug, datasourceId, sourceKind, sourceSql, sourceTable, builderState, refreshCadence } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    // 1. Validate SQL shape
    if (sourceKind === 'sql' && !validateSelectOnly(sourceSql)) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, DS_MSG.BAD_SQL);
    }
    // 2. Build effective SQL
    const effectiveSql = sourceKind === 'builder' ? compileBuilder(builderState) : sourceSql;
    // 3. Test: run a LIMIT 1 against the datasource
    const pool = await getPool(orgData.orgId, await defaultConn(datasourceId));
    const sample = await pool.query(`SELECT * FROM (${effectiveSql}) _ LIMIT 1`, [], { timeoutMs: 30000 });
    // 4. Infer fields
    const fields = inferFields({ ...sample }, ...);
    // 5. Persist (tx)
    const dataset = await connection.transaction(async (tx: any) => {
      const ds = await tx.getRepository('Dataset').save({
        orgId: orgData.orgId, datasourceId, name, slug,
        sourceKind, sourceSql: effectiveSql, sourceTable, builderState,
        refreshCadence: refreshCadence ?? 'live',
        ownerUserId: loggedInId, status: 'draft',
      });
      for (const f of fields) {
        await tx.getRepository('DatasetField').save({ datasetId: ds.id, ...f });
      }
      return ds;
    });
    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.DATASET,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'Dataset',
      entityId: dataset.id,
      metadata: { sourceKind, fieldCount: fields.length },
    });
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, DS_MSG.CREATED, dataset);
  } catch (err: any) {
    Logger.error(`Add dataset failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 7. FE — dataset editor

Three panes: schema browser (left), SQL/builder editor
(centre), field editor (right). Bottom: preview panel with
pagination (server-side, cursor-based) and refresh schedule.

`src/app/modules/datasets/`:
- `dataset-editor/` — shell
- `sql-editor/` — monaco-based, with autocomplete from
  introspection cache
- `builder-editor/` — visual join builder (drag tables onto canvas)
- `field-panel/` — editable list, supports bulk type set
- `preview-table/` — cursor-paginated, virtualised
- `parameter-panel/` — define dataset parameters
- `relation-editor/` — define joins between datasets
- `refresh-settings/` — cadence + cron picker

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_dataset_save_ms` | histogram | `source_kind` | save latency |
| `dbexec_dataset_infer_ms` | histogram | — | inference cost |
| `dbexec_dataset_preview_ms` | histogram | `dataset` | preview latency |
| `dbexec_dataset_materialise_ms` | histogram | `dataset` | refresh cost |
| `dbexec_dataset_materialise_failed_total` | counter | `dataset`, `reason` | failures |
| `dbexec_dataset_count` | gauge | `org`, `status` | per-org counts |

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| Author injects DDL via `source_sql` | SQL parser whitelists SELECT only; reject on save |
| Builder JSON includes raw SQL fragments | Builder compiler escapes via parameterised IR; no raw fragments allowed |
| PII auto-detection misses | Author can manually flag; admin audit shows un-flagged fields containing common PII patterns |
| Cross-org datasource reference | Datasource lookup joined by org_id |
| Materialised view bloat / cleanup miss | 24h cleanup cron; admin alert on `dbexec_dataset_materialise_failed_total` > 0 |
| Slow preview DoSes the warehouse | Preview wrapped in `LIMIT n`; 30 s timeout; per-user concurrent preview limit (3) |
| Param injection (`:param_name`) | Binding only — names mapped to dialect placeholders; never string-interpolated |

---

## 10. Runbook

**Symptom: save fails with "field count mismatch".**
1. Source SELECT changed columns; inference picks up new
   columns but old `dataset_field` rows still exist. Re-save
   forces reconciliation.

**Symptom: materialisation takes hours.**
1. Source query is too big. Suggest a `WHERE` filter or
   convert to incremental refresh (v2).

**Symptom: preview empty but warehouse has data.**
1. RLS (module 09) emptying it — `Preview as another user`
   in the toolbar swaps context.

---

## 11. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Save (with infer) | 400 ms | 1.5 s | 10 s |
| Preview (100 rows) | 200 ms | 800 ms | 30 s |
| Materialise (10M-row table) | — | — | depends on warehouse |
| Schema browser render | 50 ms | 200 ms | 1 s |

---

## 12. Migration & rollout

1. **Migrations:** add `dataset_field`, `dataset_parameter`,
   `dataset_relation`; extra columns on `dataset`.
2. **Backfill:** for each existing dataset, run inference once
   and populate `dataset_field`.
3. **Feature flag:** `feature.dataset_v2`. Editor reads new tables
   when on; falls back to legacy preview otherwise.

---

## 13. Open questions

1. **Incremental refresh** — only re-materialise rows newer
   than `last_run_at`. Requires a watermark column. v2.
2. **Dataset versioning UI** — module 18 stores versions;
   should the editor surface "compare to last published"?
   Yes; deferred to module 18 work.
3. **Cross-datasource joins in builder** — federation. Hard;
   defer.

---

## 14. References

- [03-dataset.md](../research/modules/03-dataset.md)
- [01-datasource-connection.md](../research/modules/01-datasource-connection.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- [05-cache-materialisation.md](../research/modules/05-cache-materialisation.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [12-import-upload.md](../research/modules/12-import-upload.md)
- node-sql-parser docs
