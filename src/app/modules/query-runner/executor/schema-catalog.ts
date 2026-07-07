/**
 * SchemaCatalog — the client-side index that powers the editor's
 * IntelliSense. Built from the /catalog DTO once per connection. Adapted
 * from INTEGRATION_PLAN §5.1.
 */
export interface SchemaCatalogDTO {
  schemas: string[];
  tables: { schema: string; name: string; type: string }[];
  columns: {
    schema: string;
    table: string;
    column: string;
    dataType: string;
    isNullable: boolean;
    isPrimaryKey: boolean;
  }[];
  foreignKeys: {
    schema: string;
    table: string;
    column: string;
    refSchema: string;
    refTable: string;
    refColumn: string;
  }[];
  fetchedAt: number;
}

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
  readonly schemas: string[];
  readonly defaultSchema = 'public';

  constructor(dto: SchemaCatalogDTO) {
    this.schemas = dto.schemas ?? [];
    for (const t of dto.tables ?? []) {
      const arr = this.tablesBySchema.get(t.schema) ?? [];
      arr.push({ schema: t.schema, name: t.name, type: t.type });
      this.tablesBySchema.set(t.schema, arr);
    }
    for (const c of dto.columns ?? []) {
      const info: ColInfo = {
        name: c.column,
        dataType: c.dataType,
        isPrimaryKey: c.isPrimaryKey,
        nullable: c.isNullable,
      };
      this.push(`${c.schema}.${c.table}`, info);
      this.push(c.table, info); // bare name (last-wins across schemas; fine)
    }
  }

  private push(key: string, c: ColInfo): void {
    const k = key.toLowerCase();
    const arr = this.byTable.get(k) ?? [];
    arr.push(c);
    this.byTable.set(k, arr);
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
