/**
 * Database Schema Operations Helper
 * Contains utility methods for database schema operations
 */

export class DatabaseSchemaHelper {
  
  /**
   * Filter databases based on search text
   */
  static filterDatabases(
    databases: any[],
    searchText: string,
    expandedDatabases: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean }
  ): any[] {
    if (!databases || databases.length === 0) {
      return [];
    }
    
    if (!searchText.trim()) {
      return databases;
    }
    
    const search = searchText.toLowerCase();
    const filtered = databases.map(db => ({
      ...db,
      schemas: db.schemas.map((schema: any) => ({
        ...schema,
        tables: schema.tables.filter((table: any) => 
          table.name.toLowerCase().includes(search) ||
          table.columns.some((col: any) => col.name.toLowerCase().includes(search))
        )
      })).filter((schema: any) => schema.tables.length > 0)
    })).filter(db => db.schemas.length > 0);

    // Auto-expand databases and schemas that have matching results
    filtered.forEach(db => {
      expandedDatabases[db.name] = true;
      db.schemas.forEach((schema: any) => {
        expandedSchemas[`${db.name}.${schema.name}`] = true;
      });
    });

    return filtered;
  }

  /**
   * Ensure parent hierarchy is expanded
   */
  static ensureParentExpanded(
    dbName: string,
    expandedDatabases: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean },
    expandedTables: { [key: string]: boolean },
    schemaName?: string,
    tableName?: string
  ): void {
    expandedDatabases[dbName] = true;
    
    if (schemaName) {
      expandedSchemas[`${dbName}.${schemaName}`] = true;
    }
    
    if (tableName && schemaName) {
      expandedTables[`${dbName}.${schemaName}.${tableName}`] = true;
    }
  }

  /**
   * Collapse database and all its children
   */
  static collapseDatabase(
    databaseName: string,
    expandedDatabases: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean },
    expandedTables: { [key: string]: boolean }
  ): void {
    expandedDatabases[databaseName] = false;

    // Collapse all schemas under this database
    Object.keys(expandedSchemas).forEach(key => {
      if (key.startsWith(databaseName + '.')) {
        expandedSchemas[key] = false;
      }
    });

    // Collapse all tables under this database
    Object.keys(expandedTables).forEach(key => {
      if (key.startsWith(databaseName + '.')) {
        expandedTables[key] = false;
      }
    });
  }

  /**
   * Generate column reference text for insertion
   */
  static generateColumnReference(
    schemaName: string,
    tableName: string,
    columnName: string
  ): string {
    return schemaName === 'public' 
      ? `${tableName}.${columnName}` 
      : `${schemaName}.${tableName}.${columnName}`;
  }

  /**
   * Build table key for expanded state tracking
   */
  static buildTableKey(dbName: string, schemaName: string, tableName: string): string {
    return `${dbName}.${schemaName}.${tableName}`;
  }

  /**
   * Build schema key for expanded state tracking
   */
  static buildSchemaKey(dbName: string, schemaName: string): string {
    return `${dbName}.${schemaName}`;
  }
}
