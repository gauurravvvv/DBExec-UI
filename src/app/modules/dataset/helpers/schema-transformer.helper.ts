import { IAPIResponse } from 'src/app/core/models/global.model';
import {
  DatasourceSchema,
  SchemaGroup,
  TableColumn,
  TableSchema,
} from './dummy-data.helper';

/**
 * Shape of a single column entry as returned by POST /api/v1/queries/structure.
 * BE controller: src/modules/queries/controllers/getDatasourceStructure.ts
 */
interface ApiColumn {
  name: string;
  type: string;
  nullable: boolean;
  default_value?: string | null;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
  foreign_key_schema?: string | null;
  foreign_key_table?: string | null;
  foreign_key_column?: string | null;
}

/** Shape of a single table entry in the BE schema response. */
interface ApiTable {
  table_name: string;
  table_alias?: string;
  columns: ApiColumn[];
}

/** Shape of a single schema entry in the BE schema response. */
interface ApiSchemaGroup {
  schema_name: string;
  tables: ApiTable[];
}

/**
 * New envelope shape introduced when `getDatasourceStructure` learned
 * to auto-degrade for warehouse-scale databases. `eager` carries
 * columns inline (the original behaviour); `lazy` ships schemas +
 * tables only and the FE fetches columns per-table on first use.
 *
 * The transformer accepts both this object form AND the legacy bare
 * array form so older BE versions keep working.
 */
export type SchemaTreeMode = 'eager' | 'lazy';
export interface ApiSchemaTreeEnvelope {
  mode: SchemaTreeMode;
  schemas: ApiSchemaGroup[];
  /** Approximate column count the BE found; useful for telemetry +
   *  for showing a "this is a big database" hint. Optional. */
  approxColumnCount?: number;
}

/** Helper class for transforming the BE schema response into DatasourceSchema. */
export class SchemaTransformerHelper {
  /**
   * Convert the BE `POST /api/v1/queries/structure` response into a
   * DatasourceSchema array. The BE always returns the same shape (built in
   * src/modules/queries/controllers/getDatasourceStructure.ts), so this is a
   * straight mapping. If the response shape ever drifts, the type system and
   * Logger.error in the controller will surface the mismatch — no defensive
   * fallbacks needed here.
   *
   * Returns a single-element array (one logical datasource per response) to
   * match the existing call-site contract.
   */
  /**
   * @returns the schema array. Callers that need the `mode` flag
   * should use `transformSchemaResponseWithMode` instead.
   */
  static transformSchemaResponse(
    response:
      | IAPIResponse<ApiSchemaGroup[] | ApiSchemaTreeEnvelope>
      | ApiSchemaGroup[]
      | ApiSchemaTreeEnvelope,
  ): DatasourceSchema[] {
    return this.transformSchemaResponseWithMode(response).datasources;
  }

  /**
   * Same conversion as `transformSchemaResponse` but also surfaces
   * the `mode` flag the BE ships in the new envelope shape. Legacy
   * BE responses (bare array) default to `eager` since they always
   * carried columns inline.
   */
  static transformSchemaResponseWithMode(
    response:
      | IAPIResponse<ApiSchemaGroup[] | ApiSchemaTreeEnvelope>
      | ApiSchemaGroup[]
      | ApiSchemaTreeEnvelope,
  ): { datasources: DatasourceSchema[]; mode: SchemaTreeMode } {
    // Unwrap the standard {status, data} envelope if present.
    const inner: ApiSchemaGroup[] | ApiSchemaTreeEnvelope | undefined =
      Array.isArray(response)
        ? response
        : (response as any)?.data !== undefined
          ? (response as any).data
          : (response as ApiSchemaTreeEnvelope);

    // Resolve to (schemasData, mode). New envelope: an object with
    // `mode` + `schemas`. Legacy: a bare array, treated as eager.
    let schemasData: ApiSchemaGroup[];
    let mode: SchemaTreeMode;
    if (Array.isArray(inner)) {
      schemasData = inner;
      mode = 'eager';
    } else if (inner && Array.isArray((inner as ApiSchemaTreeEnvelope).schemas)) {
      schemasData = (inner as ApiSchemaTreeEnvelope).schemas;
      mode = (inner as ApiSchemaTreeEnvelope).mode || 'eager';
    } else {
      schemasData = [];
      mode = 'eager';
    }

    const schemas: SchemaGroup[] = schemasData.map(
      (schemaData): SchemaGroup => ({
        name: schemaData.schema_name || 'public',
        tables: (schemaData.tables ?? []).map(
          (tableData): TableSchema => ({
            name: tableData.table_name,
            alias: tableData.table_alias,
            columns: (tableData.columns ?? []).map(
              (col): TableColumn => ({
                name: col.name,
                type: col.type,
                nullable: col.nullable === true,
                defaultValue: col.default_value ?? null,
                isPrimaryKey: col.is_primary_key === true,
                isForeignKey: col.is_foreign_key === true,
                foreignKeySchema: col.foreign_key_schema ?? undefined,
                foreignKeyTable: col.foreign_key_table ?? undefined,
                foreignKeyColumn: col.foreign_key_column ?? undefined,
              }),
            ),
          }),
        ),
      }),
    );

    return {
      datasources: [
        {
          name: 'datasource',
          schemas,
        },
      ],
      mode,
    };
  }

  /**
   * Extract all tables from datasource schemas (flattened)
   * @param datasources - Array of DatasourceSchema
   * @returns Array of TableSchema with flattened structure
   */
  static extractAllTables(datasources: DatasourceSchema[]): TableSchema[] {
    const tables: TableSchema[] = [];

    if (datasources && datasources.length > 0) {
      for (const db of datasources) {
        for (const schema of db.schemas) {
          for (const table of schema.tables) {
            tables.push(table);
          }
        }
      }
    }

    return tables;
  }

  /**
   * Build table-to-columns mapping for quick lookups
   * @param datasources - Array of DatasourceSchema
   * @returns Map of table names to columns
   */
  static buildTableColumnsMap(datasources: DatasourceSchema[]): {
    [key: string]: TableColumn[];
  } {
    const tableColumns: { [key: string]: TableColumn[] } = {};

    if (datasources && datasources.length > 0) {
      for (const db of datasources) {
        for (const schema of db.schemas) {
          for (const table of schema.tables) {
            const fullTableName =
              schema.name === 'public'
                ? table.name
                : `${schema.name}.${table.name}`;
            tableColumns[fullTableName] = table.columns;
            tableColumns[table.name] = table.columns;
          }
        }
      }
    }

    return tableColumns;
  }

  /**
   * Find a table by name across all datasources and schemas
   * @param datasources - Array of DatasourceSchema
   * @param tableName - Name of the table to find
   * @returns TableSchema or undefined
   */
  static findTableByName(
    datasources: DatasourceSchema[],
    tableName: string,
  ): TableSchema | undefined {
    const tables = this.extractAllTables(datasources);
    return tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
  }

  /**
   * Get all table names from datasources
   * @param datasources - Array of DatasourceSchema
   * @returns Array of table names
   */
  static getAllTableNames(datasources: DatasourceSchema[]): string[] {
    const tables = this.extractAllTables(datasources);
    return tables.map(t => t.name);
  }

  /**
   * Get column names for a specific table
   * @param datasources - Array of DatasourceSchema
   * @param tableName - Name of the table
   * @returns Array of column names
   */
  static getColumnNamesForTable(
    datasources: DatasourceSchema[],
    tableName: string,
  ): string[] {
    const table = this.findTableByName(datasources, tableName);
    return table ? table.columns.map(c => c.name) : [];
  }

  // ── Lazy schema responses ────────────────────────────────────────
  // GET /datasources/:datasourceId/schemas returns
  //   `[{ schema_name, tables: [] }]`
  // (tables array is intentionally empty — fetched on expand). Map to
  // the legacy DatasourceSchema shape that the IntelliSense + sidebar
  // consume; each schema starts with empty tables.
  static transformLazySchemasResponse(
    response: IAPIResponse<ApiSchemaGroup[]> | ApiSchemaGroup[],
  ): DatasourceSchema[] {
    const schemasData: ApiSchemaGroup[] = Array.isArray(response)
      ? response
      : (response?.data ?? []);

    const schemas: SchemaGroup[] = schemasData.map(
      (schemaData): SchemaGroup => ({
        name: schemaData.schema_name || 'public',
        tables: [], // populated lazily on expand
      }),
    );

    return [{ name: 'datasource', schemas }];
  }

  /**
   * GET /datasources/:datasourceId/schemas/:schema/tables returns
   *   `[{ table_name, table_alias? }]`
   * Map to the legacy TableSchema shape (columns empty until the table
   * itself is expanded). Tolerates the data either being a wrapped
   * envelope or a bare array.
   */
  static transformLazyTablesResponse(
    response: IAPIResponse<ApiTable[]> | ApiTable[],
  ): TableSchema[] {
    const tablesData: ApiTable[] = Array.isArray(response)
      ? response
      : (response?.data ?? []);

    return tablesData.map(
      (t): TableSchema => ({
        name: t.table_name,
        alias: t.table_alias,
        columns: [], // populated lazily on column expand
      }),
    );
  }

  /**
   * GET /datasources/:datasourceId/schemas/:schema/tables/:table/columns
   * returns `[{ column_name, data_type, is_nullable, column_default }]`.
   * Map to the legacy TableColumn shape; PK/FK metadata isn't part of the
   * lazy response so those fields default to undefined.
   */
  static transformLazyColumnsResponse(
    response:
      | IAPIResponse<
          {
            column_name: string;
            data_type: string;
            is_nullable: string | boolean;
            column_default?: string | null;
          }[]
        >
      | {
          column_name: string;
          data_type: string;
          is_nullable: string | boolean;
          column_default?: string | null;
        }[],
  ): TableColumn[] {
    const rows = Array.isArray(response) ? response : (response?.data ?? []);
    return rows.map(
      (c): TableColumn => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === true || c.is_nullable === 'YES',
        defaultValue: c.column_default ?? null,
      }),
    );
  }
}
