/**
 * Bridge between the Query Executor's lazy `SchemaCatalog` and the shape
 * `MonacoIntelliSenseService` consumes.
 *
 * The two modules grew different schema models for good reasons:
 *
 *   - The **executor** browses arbitrary databases, so it loads lazily: schemas
 *     up front, a schema's tables when that node opens, a table's columns only
 *     when completion actually needs them. On a warehouse with thousands of
 *     tables, materialising everything would be unusable.
 *   - The **dataset creator** hands the IntelliSense service a plain
 *     `DatasourceSchema[]` tree and re-feeds it whenever the tree grows.
 *
 * Those are the same strategy expressed differently — both are incremental. So
 * rather than change either, this projects the catalog into the tree shape, and
 * the executor re-feeds it on every growth exactly as add-dataset already does.
 * That keeps a 2,272-line IntelliSense implementation untouched, which is the
 * whole reason the executor could adopt it at all.
 *
 * A table whose columns have not been fetched yet projects with an empty
 * `columns` array. That is not a lossy approximation — it is the signal the
 * service's column-request hook keys off, which is what preserves lazy loading.
 */
import {
  ColInfo,
  SchemaCatalog,
} from '../../modules/query-runner/executor/schema-catalog';

/**
 * Minimal structural types, declared here rather than imported.
 *
 * The dataset module's equivalents live in a `dummy-data.helper`, and importing
 * from a feature module into `shared/` is the layering violation this file
 * exists to avoid. Structural typing means the projection is still assignable
 * wherever the service expects its own interface.
 */
/**
 * Must match the dataset module's `TableColumn` field-for-field.
 *
 * The type field is `type`, NOT `dataType`. The catalog calls it `dataType`, so
 * the projection has to rename it — emitting `dataType` here made every column
 * suggestion read "undefined", which is how the mismatch was found.
 */
export interface BridgedColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface BridgedTable {
  name: string;
  /** 'table' | 'view' | … — passed through from the catalog. */
  type?: string;
  columns: BridgedColumn[];
}

export interface BridgedSchema {
  name: string;
  tables: BridgedTable[];
}

export interface BridgedDatasource {
  name: string;
  schemas: BridgedSchema[];
  dbType?: string;
}

/**
 * Project the catalog as it currently stands.
 *
 * Cheap enough to call on every catalog growth: it walks only what has been
 * loaded, and the service replaces its previous tree wholesale.
 *
 * @param name    label for the datasource, shown in suggestion details
 * @param dbType  engine id, so the service scopes keywords and functions to the
 *                right dialect — the executor's one connection has one engine
 */
export function catalogToDatasourceSchema(
  name: string,
  dbType: string | undefined,
  cat: SchemaCatalog,
): BridgedDatasource[] {
  const schemas: BridgedSchema[] = cat.schemas.map(schemaName => ({
    name: schemaName,
    tables: cat.tablesInSchema(schemaName).map(t => ({
      name: t.name,
      type: t.type,
      columns: toColumns(cat.columns(schemaName, t.name)),
    })),
  }));

  // Union in the tables we hold COLUMNS for but no listing of.
  //
  // `tablesInSchema` above only covers schemas the user expanded in the object
  // browser. Typing `select * from public.chart_demo t where t.` fetches that one
  // table's columns without ever expanding `public`, so the table exists in the
  // catalog's column map and in none of its table lists. Projecting only the
  // listings leaves those columns in the catalog but invisible to suggestions —
  // the lazy path silently returning SQL keywords instead of column names.
  for (const tbl of cat.tablesWithColumns()) {
    const schema = schemas.find(s => s.name === tbl.schema);
    if (!schema) {
      schemas.push({
        name: tbl.schema,
        tables: [
          {
            name: tbl.name,
            type: tbl.type,
            columns: toColumns(cat.columns(tbl.schema, tbl.name)),
          },
        ],
      });
      continue;
    }
    if (!schema.tables.some(t => t.name === tbl.name)) {
      schema.tables.push({
        name: tbl.name,
        type: tbl.type,
        columns: toColumns(cat.columns(tbl.schema, tbl.name)),
      });
    }
  }

  return [{ name, dbType, schemas }];
}

function toColumns(cols: ColInfo[]): BridgedColumn[] {
  // isPrimaryKey and nullable are carried through deliberately: the suggestion
  // list boosts primary keys and shows the type plus NOT NULL as the detail
  // line, so dropping them would visibly degrade completions.
  return cols.map(c => ({
    name: c.name,
    // catalog `dataType` → dataset module `type`.
    type: c.dataType,
    nullable: c.nullable,
    isPrimaryKey: c.isPrimaryKey,
  }));
}
