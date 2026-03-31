import {
  DatasourceSchema,
  SchemaGroup,
  TableSchema,
  TableColumn,
} from './dummy-data.helper';

/**
 * Helper class for transforming API responses into DatasourceSchema format
 */
export class SchemaTransformerHelper {
  /**
   * Transform API response to DatasourceSchema interface
   * @param response - API response from backend
   * @returns DatasourceSchema array
   */
  static transformSchemaResponse(response: any): DatasourceSchema[] {
    // Transform the API response to match our DatasourceSchema interface
    const schemas: SchemaGroup[] = [];

    // Handle different API response formats:
    // 1. { data: { schemas: [...] } } - wrapped response
    // 2. { schemas: [...] } - direct response
    // 3. { data: [...] } - legacy format
    let schemasData =
      response?.data?.schemas || response?.schemas || response?.data;

    // If schemasData is an object with schemas property (nested), unwrap it
    if (schemasData && !Array.isArray(schemasData) && schemasData.schemas) {
      schemasData = schemasData.schemas;
    }

    if (schemasData && Array.isArray(schemasData)) {
      for (const schemaData of schemasData) {
        const tables: TableSchema[] = [];

        // Handle tables array
        const tablesData = schemaData.tables || [];
        if (Array.isArray(tablesData)) {
          for (const tableData of tablesData) {
            const columns: TableColumn[] = [];

            // Handle columns array
            const columnsData = tableData.columns || [];

            if (Array.isArray(columnsData)) {
              for (const col of columnsData) {
                columns.push({
                  name: col.name || col.column_name,
                  type: col.type || col.data_type,
                  nullable: col.nullable === true || col.is_nullable === 'YES',
                  isPrimaryKey: col.isPrimaryKey || col.is_primary_key || false,
                  isForeignKey: col.isForeignKey || col.is_foreign_key || false,
                  foreignKeyTable: col.foreignKeyTable || col.foreign_key_table,
                  foreignKeyColumn:
                    col.foreignKeyColumn || col.foreign_key_column,
                });
              }
            }

            tables.push({
              name: tableData.table || tableData.table_name || tableData.name,
              columns: columns,
            });
          }
        }

        const schemaName =
          schemaData.schema ||
          schemaData.schema_name ||
          schemaData.name ||
          'public';
        schemas.push({
          name: schemaName,
          tables: tables,
        });
      }
    }

    const result = [
      {
        name:
          response.datasource_name ||
          response?.data?.datasource_name ||
          response.name ||
          'datasource',
        schemas: schemas,
      },
    ];
    return result;
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
