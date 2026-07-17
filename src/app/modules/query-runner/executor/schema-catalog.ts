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
  // Keyed ONLY by `${schema}.${table}`. No bare-`table` bucket: that was a
  // last-wins-across-schemas shortcut that let a lookup for one schema's
  // table return a DIFFERENT schema's columns (e.g. sales.orders getting
  // archive.orders' columns). Unqualified lookups resolve the schema first
  // (see resolveSchema).
  private byTable = new Map<string, ColInfo[]>();
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
  }

  /**
   * Resolve the schema for an unqualified table name to a CONCRETE schema
   * whose columns we hold: prefer defaultSchema if it has the table, else
   * the first loaded schema that has cached columns for it, else
   * defaultSchema. This replaces the old bare-key blob so an unqualified
   * `orders` never silently returns a different schema's `orders`.
   */
  private resolveSchema(table: string): string {
    const t = table.toLowerCase();
    if (this.byTable.has(`${this.defaultSchema}.${t}`)) return this.defaultSchema;
    for (const key of this.byTable.keys()) {
      if (key.endsWith(`.${t}`)) return key.slice(0, key.length - t.length - 1);
    }
    return this.defaultSchema;
  }

  hasColumns(schema: string | undefined, table: string): boolean {
    const sch = schema ?? this.resolveSchema(table);
    return this.byTable.has(`${sch}.${table}`.toLowerCase());
  }

  columns(schema: string | undefined, table: string): ColInfo[] {
    const sch = schema ?? this.resolveSchema(table);
    return this.byTable.get(`${sch}.${table}`.toLowerCase()) ?? [];
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
