# Query Runner — Object Explorer (design)

Turn the executor's left tree from "schemas → tables → columns" into a
proper, read-only PostgreSQL object explorer. Editing stays in the SQL
editor; the browser only inspects.

## Tree shape (grouped, lazy)

```
▾ public                         (schema — lazy: loads groups on expand)
  ▾ Tables                       (relkind r/p)  → detail modal
      orders                     dbl-click = SELECT * LIMIT 100
        ▸ columns (lazy, as today)
  ▾ Views                        (relkind v)    → detail modal (definition)
  ▾ Materialized Views           (relkind m)    → detail modal + Refresh
  ▾ Functions                    (pg_proc)      → detail modal (source)
  ▾ Sequences                    (pg_class S)   → detail modal (values)
```

Group folders are cheap (counts come from one grouped query per schema).
Columns still lazy-load per table on expand (unchanged). Indexes /
constraints / triggers are NOT tree nodes — they live in the table
detail modal (fetched when the modal opens).

## Detail modal (tabs, per object type)

Reuse the app confirm-dialog chrome (`.confirmation-popup` shell).

- **Table** → Columns · Indexes · Constraints · Triggers · DDL · Info
- **View** → Columns · Definition (SQL) · Info
- **Matview** → Columns · Definition · Indexes · Info (+ Refresh button)
- **Function** → Signature · Source · Info
- **Sequence** → Info (last value, increment, min/max, owned-by)

All read-only. A "Copy" button on Definition / Source / DDL. Table DDL
is reconstructed from columns + constraints (no pg_dump dependency).

## BE — new introspection (introspectCatalog.ts) + endpoints

All parameterised, has_*_privilege-filtered, Postgres.

- `listSchemaObjects(schema)` → grouped counts + names per object type
  (tables/views/matviews/functions/sequences) in ONE call — powers the
  group folders on schema expand.
- `getTableDetail(schema, table)` → { columns, indexes, constraints,
  triggers, ddl, sizeBytes, rowEstimate, comment }.
- `getViewDetail(schema, view)` → { columns, definition, comment }.
- `getFunctionDetail(schema, name, args)` → { signature, source,
  language, returns }.
- `getSequenceDetail(schema, name)` → { lastValue, increment, min, max,
  cycle, ownedBy }.

Endpoints (all queryRunner READ), on /connections/:id :
  GET /objects?schema=            → grouped object list
  GET /object/table?schema=&name=
  GET /object/view?schema=&name=
  GET /object/function?schema=&name=&args=
  GET /object/sequence?schema=&name=
  POST /object/matview/refresh?schema=&name=   (WRITE — the one mutation)

Queries:
- indexes: pg_index + pg_class + pg_get_indexdef
- constraints: pg_constraint + pg_get_constraintdef (contype p/f/u/c)
- triggers: pg_trigger (not tgisinternal) + pg_get_triggerdef
- functions: pg_proc + pg_get_functiondef / pg_get_function_arguments
- sequences: pg_sequences (PG10+) or pg_sequence
- size: pg_total_relation_size ; rows: reltuples
- view def: pg_get_viewdef(oid, true)

## FE

- `ObjectDetailComponent` (standalone) — the tabbed modal; input =
  { connectionId, type, schema, name, args? }; fetches on open.
- Executor tree: group folders per schema; each object row opens the
  modal. Matview row gets a Refresh action.
- Service: getObjects / getTableDetail / getViewDetail / getFunctionDetail
  / getSequenceDetail / refreshMatview.

## Out of scope (intentionally)

- No ALTER/CREATE wizards — edits are typed in the SQL editor.
- No types/enums/triggers-as-tree-nodes in v1 (triggers live in the
  table modal). Can add later.
