/**
 * prompt-join-builder — structured, point-and-click, multi-hop JOIN builder.
 *
 * Supersedes the single-hop `prompt-join-picker`. The admin builds an ordered
 * chain of joins to reach ANY column in the schema, with two ways to add each
 * hop:
 *   • FK-suggested — pick from the datasource's foreign-key edges that
 *     originate on a table already in scope (the base table or a previously
 *     joined table). One click derives the ON clause.
 *   • Manual — for DBs without declared FKs: pick a source table (in scope) +
 *     column = a target table + column, and a join type.
 *
 * Multi-hop is modelled with `dependsOnKey`: a hop whose source is the target
 * of an earlier hop depends on that earlier join, so the compiler's
 * join.resolver emits them in the right order. The builder emits the exact
 * `join_edges` (JoinMeta[]) + `required_joins` (joinKeys) shape the BE
 * `configPrompt` stores and the querybuilder compiler consumes — no free-text
 * SQL, no QB coupling.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';

/** Raw FK edge from GET /datasources/:id/foreign-keys → { data.foreignKeys }. */
export interface FkEdge {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
}

/** The compiler's join contract (mirrors BE JoinMeta). Stored in join_edges. */
export interface JoinEdge {
  joinKey: string;
  joinType: string; // INNER | LEFT
  targetSchema: string;
  targetTable: string;
  targetAlias: string;
  onClause: string;
  dependsOnKey: string | null;
  cardinality: string; // to_one | to_many
  sequence: number;
}

/** A table currently reachable (base or a joined target) — the join source pool. */
export interface ScopeTable {
  schema: string;
  table: string;
  alias: string;
  /** joinKey that introduced this table, or null for the base table. */
  fromJoinKey: string | null;
}

/** A column the admin can now filter/select on, alias-qualified. */
export interface ReachableColumn {
  label: string; // alias.column
  value: string; // alias.column (the expr)
  schema: string;
  table: string;
  alias: string;
  column: string;
}

@Component({
  selector: 'prompt-join-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './prompt-join-builder.component.html',
  styleUrls: ['./prompt-join-builder.component.scss'],
})
export class PromptJoinBuilderComponent implements OnChanges {
  @Input({ required: true }) datasourceId!: string;
  @Input() baseSchema: string | null = null;
  @Input() baseTable: string | null = null;
  @Input() baseAlias: string | null = null;
  /** Existing join_edges to seed from (edit an existing config). */
  @Input() initialEdges: JoinEdge[] | null = null;

  /** Emits the full join_edges array whenever the chain changes. */
  @Output() edgesChange = new EventEmitter<JoinEdge[]>();
  /** Emits the reachable columns (base + all joined targets) for the filter picker. */
  @Output() reachableChange = new EventEmitter<ReachableColumn[]>();

  private readonly datasource = inject(DatasourceService);

  readonly loadingFks = signal(false);
  readonly fkEdges = signal<FkEdge[]>([]);
  readonly joins = signal<JoinEdge[]>([]);

  // ── Add-join form state ─────────────────────────────────────────────
  readonly mode = signal<'fk' | 'manual'>('fk');
  readonly addOpen = signal(false);

  // FK mode
  readonly selectedFkKey = signal<string | null>(null);
  // Manual mode
  readonly manSourceAlias = signal<string | null>(null); // alias of an in-scope table
  readonly manSourceColumn = signal<string | null>(null);
  readonly manTargetSchema = signal<string | null>(null);
  readonly manTargetTable = signal<string | null>(null);
  readonly manTargetColumn = signal<string | null>(null);
  readonly manJoinType = signal<'LEFT' | 'INNER'>('LEFT');
  readonly manSourceCols = signal<{ label: string; value: string }[]>([]);
  readonly manTargetTables = signal<{ label: string; value: string }[]>([]);
  readonly manTargetCols = signal<{ label: string; value: string }[]>([]);
  readonly manSchemas = signal<{ label: string; value: string }[]>([]);

  private fkByKey = new Map<string, FkEdge>();
  private columnsByTable = new Map<string, string[]>(); // `${schema}.${table}` → cols

  /** All tables currently in scope: base + every joined target. */
  readonly scope = computed<ScopeTable[]>(() => {
    const base: ScopeTable[] = this.baseTable
      ? [
          {
            schema: this.baseSchema || '',
            table: this.baseTable,
            alias: this.baseAlias || this.baseTable,
            fromJoinKey: null,
          },
        ]
      : [];
    const joined = this.joins().map(j => ({
      schema: j.targetSchema,
      table: j.targetTable,
      alias: j.targetAlias,
      fromJoinKey: j.joinKey,
    }));
    return [...base, ...joined];
  });

  /** In-scope tables as options for the manual "source table" dropdown. */
  readonly scopeOptions = computed(() =>
    this.scope().map(s => ({ label: `${s.table} (${s.alias})`, value: s.alias })),
  );

  /** FK suggestions: edges originating on any in-scope table, not already added. */
  readonly fkSuggestions = computed<{ label: string; value: string }[]>(() => {
    const inScope = new Set(this.scope().map(s => s.table));
    const used = new Set(this.joins().map(j => `${j.targetSchema}.${j.targetTable}`));
    return this.fkEdges()
      .filter(e => inScope.has(e.table))
      .filter(e => !used.has(`${e.refSchema}.${e.refTable}`))
      .map(e => ({
        label: `${e.table}.${e.column} → ${e.refTable}.${e.refColumn}`,
        value: this.fkKey(e),
      }));
  });

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['initialEdges'] && this.initialEdges) {
      this.joins.set([...this.initialEdges]);
      this.emit();
    }
    if (
      (changes['datasourceId'] || changes['baseTable'] || changes['baseSchema']) &&
      this.datasourceId &&
      this.baseSchema
    ) {
      await this.loadFks();
      await this.loadSchemas();
      this.emit();
    }
  }

  // ── FK loading ──────────────────────────────────────────────────────
  private async loadFks(): Promise<void> {
    this.loadingFks.set(true);
    try {
      const res: any = await this.datasource.listForeignKeys(this.datasourceId, {
        schema: this.baseSchema || undefined,
      });
      const list: FkEdge[] = res?.data?.foreignKeys ?? [];
      this.fkByKey.clear();
      list.forEach(e => this.fkByKey.set(this.fkKey(e), e));
      this.fkEdges.set(list);
    } catch {
      this.fkEdges.set([]);
    } finally {
      this.loadingFks.set(false);
    }
  }

  private async loadSchemas(): Promise<void> {
    try {
      const res: any = await this.datasource.listDatasourceSchemas(
        { datasourceId: this.datasourceId },
        true,
      );
      const rows: any[] = Array.isArray(res?.data) ? res.data : [];
      this.manSchemas.set(
        rows
          .map(r => r.schema_name ?? r.schemaName)
          .filter(Boolean)
          .map(n => ({ label: n, value: n })),
      );
    } catch {
      this.manSchemas.set([]);
    }
  }

  private async columnsFor(schema: string, table: string): Promise<string[]> {
    const key = `${schema}.${table}`;
    if (this.columnsByTable.has(key)) return this.columnsByTable.get(key)!;
    try {
      const res: any = await this.datasource.listTableColumns(
        { datasourceId: this.datasourceId, schemaName: schema, tableName: table },
        true,
      );
      const raw: any[] = Array.isArray(res?.data) ? res.data : res?.data?.columns || [];
      const cols = raw
        .map(c => c.column_name ?? c.columnName ?? c.name)
        .filter(Boolean);
      this.columnsByTable.set(key, cols);
      return cols;
    } catch {
      return [];
    }
  }

  // ── Add / remove joins ──────────────────────────────────────────────
  openAdd(): void {
    this.addOpen.set(true);
    this.resetAddForm();
  }
  cancelAdd(): void {
    this.addOpen.set(false);
    this.resetAddForm();
  }
  setMode(m: 'fk' | 'manual'): void {
    this.mode.set(m);
  }

  /** FK mode: one click builds the edge from the chosen FK. */
  addFkJoin(): void {
    const key = this.selectedFkKey();
    const e = key ? this.fkByKey.get(key) : null;
    if (!e) return;
    // The source is the in-scope table `e.table`; find its scope entry for alias + dep.
    const src = this.scope().find(s => s.table === e.table);
    if (!src) return;
    const targetAlias = this.uniqueAlias(e.refTable);
    const joinKey = this.joinKey(e.refTable, targetAlias);
    const onClause = `${targetAlias}.${e.refColumn} = ${src.alias}.${e.column}`;
    this.pushJoin({
      joinKey,
      joinType: 'LEFT',
      targetSchema: e.refSchema,
      targetTable: e.refTable,
      targetAlias,
      onClause,
      dependsOnKey: src.fromJoinKey,
      cardinality: 'to_one',
      sequence: this.joins().length,
    });
    this.cancelAdd();
  }

  /** Manual mode: admin picked source alias+col and target schema/table/col. */
  addManualJoin(): void {
    const srcAlias = this.manSourceAlias();
    const srcCol = this.manSourceColumn();
    const tSchema = this.manTargetSchema();
    const tTable = this.manTargetTable();
    const tCol = this.manTargetColumn();
    if (!srcAlias || !srcCol || !tSchema || !tTable || !tCol) return;
    const src = this.scope().find(s => s.alias === srcAlias);
    if (!src) return;
    const targetAlias = this.uniqueAlias(tTable);
    const joinKey = this.joinKey(tTable, targetAlias);
    const onClause = `${targetAlias}.${tCol} = ${srcAlias}.${srcCol}`;
    this.pushJoin({
      joinKey,
      joinType: this.manJoinType(),
      targetSchema: tSchema,
      targetTable: tTable,
      targetAlias,
      onClause,
      dependsOnKey: src.fromJoinKey,
      cardinality: 'to_one',
      sequence: this.joins().length,
    });
    this.cancelAdd();
  }

  removeJoin(joinKey: string): void {
    // Remove the join and any join that transitively depends on it.
    const toRemove = new Set<string>([joinKey]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of this.joins()) {
        if (j.dependsOnKey && toRemove.has(j.dependsOnKey) && !toRemove.has(j.joinKey)) {
          toRemove.add(j.joinKey);
          grew = true;
        }
      }
    }
    this.joins.set(
      this.joins()
        .filter(j => !toRemove.has(j.joinKey))
        .map((j, i) => ({ ...j, sequence: i })),
    );
    this.emit();
  }

  // ── Manual-mode cascading loads ─────────────────────────────────────
  async onManSourceAlias(alias: string): Promise<void> {
    this.manSourceAlias.set(alias);
    this.manSourceColumn.set(null);
    const s = this.scope().find(x => x.alias === alias);
    if (!s) return;
    const cols = await this.columnsFor(s.schema, s.table);
    this.manSourceCols.set(cols.map(c => ({ label: c, value: c })));
  }
  async onManTargetSchema(schema: string): Promise<void> {
    this.manTargetSchema.set(schema);
    this.manTargetTable.set(null);
    this.manTargetColumn.set(null);
    this.manTargetCols.set([]);
    try {
      const res: any = await this.datasource.listSchemaTables(
        { datasourceId: this.datasourceId, schemaName: schema },
        true,
      );
      const rows: any[] = Array.isArray(res?.data) ? res.data : [];
      this.manTargetTables.set(
        rows
          .map(r => r.table_name ?? r.tableName ?? r.name)
          .filter(Boolean)
          .map(n => ({ label: n, value: n })),
      );
    } catch {
      this.manTargetTables.set([]);
    }
  }
  async onManTargetTable(table: string): Promise<void> {
    this.manTargetTable.set(table);
    this.manTargetColumn.set(null);
    const schema = this.manTargetSchema();
    if (!schema) return;
    const cols = await this.columnsFor(schema, table);
    this.manTargetCols.set(cols.map(c => ({ label: c, value: c })));
  }

  // ── Emit reachable columns + edges ──────────────────────────────────
  private async emitReachable(): Promise<void> {
    const out: ReachableColumn[] = [];
    for (const s of this.scope()) {
      const cols = await this.columnsFor(s.schema, s.table);
      cols.forEach(c =>
        out.push({
          label: `${s.alias}.${c}`,
          value: `${s.alias}.${c}`,
          schema: s.schema,
          table: s.table,
          alias: s.alias,
          column: c,
        }),
      );
    }
    this.reachableChange.emit(out);
  }

  private emit(): void {
    this.edgesChange.emit(this.joins());
    void this.emitReachable();
  }

  private pushJoin(j: JoinEdge): void {
    this.joins.set([...this.joins(), j]);
    this.emit();
  }

  // ── helpers ─────────────────────────────────────────────────────────
  private fkKey(e: FkEdge): string {
    return `${e.schema}.${e.table}.${e.column}->${e.refSchema}.${e.refTable}.${e.refColumn}`;
  }
  private joinKey(table: string, alias: string): string {
    const norm = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '_');
    return `j__${norm(table)}__${norm(alias)}`;
  }
  private uniqueAlias(table: string): string {
    const base = (table || 't').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toLowerCase();
    const used = new Set(this.scope().map(s => s.alias));
    let i = 1;
    let alias = `${base}${i}`;
    while (used.has(alias)) alias = `${base}${++i}`;
    return alias;
  }

  private resetAddForm(): void {
    this.selectedFkKey.set(null);
    this.manSourceAlias.set(null);
    this.manSourceColumn.set(null);
    this.manTargetSchema.set(null);
    this.manTargetTable.set(null);
    this.manTargetColumn.set(null);
    this.manJoinType.set('LEFT');
    this.manSourceCols.set([]);
    this.manTargetTables.set([]);
    this.manTargetCols.set([]);
  }
}
