/**
 * Datasource Schema Operations Helper
 * Contains utility methods for datasource schema operations
 */

export class DatasourceSchemaHelper {
  /**
   * Filter datasources based on search text
   */
  static filterDatasources(
    datasources: any[],
    searchText: string,
    expandedDatasources: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean },
  ): any[] {
    if (!datasources || datasources.length === 0) {
      return [];
    }

    if (!searchText.trim()) {
      return datasources;
    }

    const search = searchText.toLowerCase();
    const filtered = datasources
      .map(db => ({
        ...db,
        schemas: db.schemas
          .map((schema: any) => ({
            ...schema,
            tables: schema.tables.filter(
              (table: any) =>
                table.name.toLowerCase().includes(search) ||
                table.columns.some((col: any) =>
                  col.name.toLowerCase().includes(search),
                ),
            ),
          }))
          .filter((schema: any) => schema.tables.length > 0),
      }))
      .filter(db => db.schemas.length > 0);

    // Auto-expand datasources and schemas that have matching results
    filtered.forEach(db => {
      expandedDatasources[db.name] = true;
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
    expandedDatasources: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean },
    expandedTables: { [key: string]: boolean },
    schemaName?: string,
    tableName?: string,
  ): void {
    expandedDatasources[dbName] = true;

    if (schemaName) {
      expandedSchemas[`${dbName}.${schemaName}`] = true;
    }

    if (tableName && schemaName) {
      expandedTables[`${dbName}.${schemaName}.${tableName}`] = true;
    }
  }

  /**
   * Collapse datasource and all its children
   */
  static collapseDatasource(
    datasourceName: string,
    expandedDatasources: { [key: string]: boolean },
    expandedSchemas: { [key: string]: boolean },
    expandedTables: { [key: string]: boolean },
  ): void {
    expandedDatasources[datasourceName] = false;

    // Collapse all schemas under this datasource
    Object.keys(expandedSchemas).forEach(key => {
      if (key.startsWith(datasourceName + '.')) {
        expandedSchemas[key] = false;
      }
    });

    // Collapse all tables under this datasource
    Object.keys(expandedTables).forEach(key => {
      if (key.startsWith(datasourceName + '.')) {
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
    columnName: string,
  ): string {
    return schemaName === 'public'
      ? `${tableName}.${columnName}`
      : `${schemaName}.${tableName}.${columnName}`;
  }

  /**
   * Build table key for expanded state tracking
   */
  static buildTableKey(
    dbName: string,
    schemaName: string,
    tableName: string,
  ): string {
    return `${dbName}.${schemaName}.${tableName}`;
  }

  /**
   * Build schema key for expanded state tracking
   */
  static buildSchemaKey(dbName: string, schemaName: string): string {
    return `${dbName}.${schemaName}`;
  }
}
