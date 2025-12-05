import { DatabaseSchema, SchemaGroup, TableSchema, TableColumn } from './dummy-data.helper';

/**
 * Helper class for transforming API responses into DatabaseSchema format
 */
export class SchemaTransformerHelper {

  /**
   * Transform API response to DatabaseSchema interface
   * @param response - API response from backend
   * @returns DatabaseSchema array
   */
  static transformSchemaResponse(response: any): DatabaseSchema[] {
    // Transform the API response to match our DatabaseSchema interface
    const schemas: SchemaGroup[] = [];

    if (response && response.data && Array.isArray(response.data)) {
      for (const schemaData of response.data) {
        const tables: TableSchema[] = [];
        
        if (Array.isArray(schemaData.tables)) {
          for (const tableData of schemaData.tables) {
            const columns: TableColumn[] = [];
            
            if (Array.isArray(tableData.columns)) {
              for (const col of tableData.columns) {
                columns.push({
                  name: col.column_name || col.name,
                  type: col.data_type || col.type,
                  nullable: col.is_nullable === 'YES' || col.nullable === true,
                  isPrimaryKey: col.is_primary_key || col.isPrimaryKey || false,
                  isForeignKey: col.is_foreign_key || col.isForeignKey || false,
                  foreignKeyTable: col.foreign_key_table || col.foreignKeyTable,
                  foreignKeyColumn: col.foreign_key_column || col.foreignKeyColumn
                });
              }
            }

            tables.push({
              name: tableData.table_name || tableData.name,
              columns: columns
            });
          }
        }

        schemas.push({
          name: schemaData.schema_name || schemaData.name || 'public',
          tables: tables
        });
      }
    }

    return [{
      name: response.database_name || 'database',
      schemas: schemas
    }];
  }

  /**
   * Extract all tables from database schemas (flattened)
   * @param databases - Array of DatabaseSchema
   * @returns Array of TableSchema with flattened structure
   */
  static extractAllTables(databases: DatabaseSchema[]): TableSchema[] {
    const tables: TableSchema[] = [];

    if (databases && databases.length > 0) {
      for (const db of databases) {
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
   * @param databases - Array of DatabaseSchema
   * @returns Map of table names to columns
   */
  static buildTableColumnsMap(databases: DatabaseSchema[]): { [key: string]: TableColumn[] } {
    const tableColumns: { [key: string]: TableColumn[] } = {};

    if (databases && databases.length > 0) {
      for (const db of databases) {
        for (const schema of db.schemas) {
          for (const table of schema.tables) {
            const fullTableName = schema.name === 'public' ? table.name : `${schema.name}.${table.name}`;
            tableColumns[fullTableName] = table.columns;
            tableColumns[table.name] = table.columns;
          }
        }
      }
    }

    return tableColumns;
  }

  /**
   * Find a table by name across all databases and schemas
   * @param databases - Array of DatabaseSchema
   * @param tableName - Name of the table to find
   * @returns TableSchema or undefined
   */
  static findTableByName(databases: DatabaseSchema[], tableName: string): TableSchema | undefined {
    const tables = this.extractAllTables(databases);
    return tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
  }

  /**
   * Get all table names from databases
   * @param databases - Array of DatabaseSchema
   * @returns Array of table names
   */
  static getAllTableNames(databases: DatabaseSchema[]): string[] {
    const tables = this.extractAllTables(databases);
    return tables.map(t => t.name);
  }

  /**
   * Get column names for a specific table
   * @param databases - Array of DatabaseSchema
   * @param tableName - Name of the table
   * @returns Array of column names
   */
  static getColumnNamesForTable(databases: DatabaseSchema[], tableName: string): string[] {
    const table = this.findTableByName(databases, tableName);
    return table ? table.columns.map(c => c.name) : [];
  }
}
