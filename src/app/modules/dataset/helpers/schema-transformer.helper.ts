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
  static transformSchemaResponse(
    response: IAPIResponse<ApiSchemaGroup[]> | ApiSchemaGroup[],
  ): DatasourceSchema[] {
    // Accept either the wrapped envelope or a bare array (some legacy
    // callers may have already unwrapped).
    const schemasData: ApiSchemaGroup[] = Array.isArray(response)
      ? response
      : (response?.data ?? []);

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

    return [
      {
        name: 'datasource',
        schemas,
      },
    ];
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
}
