/**
 * SchemaCatalog — the client-side index that powers the editor's
 * IntelliSense. Built incrementally as the object browser / completion
 * fetch tables per schema and columns per table (lazy loading), so it
 * never needs the whole database up front.
 */
export interface ColInfo {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  nullable: boolean;
}
export interface TblInfo {
  schema: string;
  name: string;
  type: string;
}

export class SchemaCatalog {
  private byTable = new Map<string, ColInfo[]>(); // `${schema}.${table}` + bare `table`
  private tablesBySchema = new Map<string, TblInfo[]>();
  schemas: string[] = [];
  readonly defaultSchema = 'public';

  constructor(schemas: string[] = []) {
    this.schemas = schemas;
  }

  setSchemas(schemas: string[]): void {
    this.schemas = schemas;
  }

  /** Merge the tables of one schema (from a lazy fetch). */
  setTables(schema: string, tables: { name: string; type: string }[]): void {
    this.tablesBySchema.set(
      schema,
      tables.map(t => ({ schema, name: t.name, type: t.type })),
    );
  }

  /** Merge the columns of one table (from a lazy fetch). */
  setColumns(schema: string, table: string, cols: ColInfo[]): void {
    this.byTable.set(`${schema}.${table}`.toLowerCase(), cols);
    // Bare-name fallback (last-wins across schemas; fine for completion).
    this.byTable.set(table.toLowerCase(), cols);
  }

  hasColumns(schema: string | undefined, table: string): boolean {
    return (
      this.byTable.has(`${schema ?? this.defaultSchema}.${table}`.toLowerCase()) ||
      this.byTable.has(table.toLowerCase())
    );
  }

  columns(schema: string | undefined, table: string): ColInfo[] {
    return (
      this.byTable.get(`${schema ?? this.defaultSchema}.${table}`.toLowerCase()) ??
      this.byTable.get(table.toLowerCase()) ??
      []
    );
  }

  tablesInSchema(schema: string): TblInfo[] {
    return this.tablesBySchema.get(schema) ?? [];
  }

  allTables(): TblInfo[] {
    return [...this.tablesBySchema.values()].flat();
  }

  isSchema(name: string): boolean {
    return this.schemas.includes(name);
  }
}
