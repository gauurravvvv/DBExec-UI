/**
 * prompt-join-picker — no-SQL join builder for a prompt.
 *
 * When a prompt's filter column lives on a table reached via a foreign key from
 * the base table, the admin should not hand-write a JOIN. This picker fetches
 * the datasource's FK edges, shows the tables reachable in one hop from the base
 * table, and — once the admin picks a related table + column — computes a
 * deterministic joinKey + ON clause from the FK edge and emits a self-describing
 * edge descriptor. The prompt stores these in PromptConfig.join_edges +
 * required_joins; the Query Builder materialises them into QueryBuilderJoin rows
 * at placement time. No SQL is typed.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';

/** A raw FK edge as returned by GET /datasources/:id/foreign-keys. */
export interface FkEdge {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
}

/** The self-describing join descriptor the prompt stores + emits. */
export interface JoinEdgeDescriptor {
  joinKey: string;
  joinType: string;
  targetSchema: string;
  targetTable: string;
  targetAlias: string;
  onClause: string;
  cardinality: string;
}

/** What the picker emits when the admin reaches a related column. */
export interface ReachedColumn {
  edge: JoinEdgeDescriptor;
  /** alias-qualified column the filter/select uses, e.g. `dept.name`. */
  columnExpr: string;
  targetSchema: string;
  targetTable: string;
  column: string;
}

@Component({
  selector: 'prompt-join-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './prompt-join-picker.component.html',
  styleUrls: ['./prompt-join-picker.component.scss'],
})
export class PromptJoinPickerComponent implements OnChanges {
  /** The datasource whose FK graph we browse. */
  @Input({ required: true }) datasourceId!: string;
  /** The prompt's base schema (the FROM table's schema). */
  @Input() baseSchema: string | null = null;
  /** The prompt's base table — edges originating here are "reachable". */
  @Input() baseTable: string | null = null;
  /** The base table's alias in the generated SQL (defaults to the table name). */
  @Input() baseAlias: string | null = null;

  /** Emits when the admin picks a related table + column (a reached column). */
  @Output() reached = new EventEmitter<ReachedColumn>();
  /** Emits when the admin clears the join (back to a base-table column). */
  @Output() cleared = new EventEmitter<void>();

  private readonly datasource = inject(DatasourceService);
  private readonly global = inject(GlobalService);

  readonly loading = signal(false);
  readonly edges = signal<FkEdge[]>([]);
  readonly columns = signal<{ label: string; value: string }[]>([]);

  readonly selectedEdgeKey = signal<string | null>(null);
  readonly selectedColumn = signal<string | null>(null);

  /** One-hop tables reachable from the base table, as dropdown options. */
  readonly reachableTables = computed<{ label: string; value: string }[]>(() => {
    const bt = this.baseTable;
    if (!bt) return [];
    return this.edges()
      .filter(e => e.table === bt)
      .map(e => ({
        label: `${e.refTable}  (via ${e.column} → ${e.refColumn})`,
        value: this.edgeKey(e),
      }));
  });

  private edgeByKey = new Map<string, FkEdge>();

  async ngOnChanges(): Promise<void> {
    if (!this.datasourceId || !this.baseTable) {
      this.edges.set([]);
      return;
    }
    await this.loadEdges();
  }

  private async loadEdges(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.datasource.listForeignKeys(this.datasourceId);
      const list: FkEdge[] = res?.data?.foreignKeys ?? [];
      this.edgeByKey.clear();
      for (const e of list) this.edgeByKey.set(this.edgeKey(e), e);
      this.edges.set(list);
    } catch (e: any) {
      // No FKs / non-Postgres → silent; the advanced-SQL escape hatch covers it.
      this.edges.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private edgeKey(e: FkEdge): string {
    return `${e.schema}.${e.table}.${e.column}->${e.refSchema}.${e.refTable}.${e.refColumn}`;
  }

  /** Stable joinKey for a materialised QueryBuilderJoin. */
  private joinKeyFor(e: FkEdge): string {
    const norm = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '_');
    return `fk__${norm(e.table)}__${norm(e.refTable)}`;
  }

  async onEdgeChange(key: string): Promise<void> {
    this.selectedEdgeKey.set(key);
    this.selectedColumn.set(null);
    this.columns.set([]);
    const e = this.edgeByKey.get(key);
    if (!e) return;
    // Load the related table's columns so the admin picks the filter column.
    try {
      const res = await this.datasource.listTableColumns(
        {
          datasourceId: this.datasourceId,
          schemaName: e.refSchema,
          tableName: e.refTable,
        },
        true,
      );
      const cols: any[] = res?.data ?? [];
      this.columns.set(
        cols
          .map(c => c.column_name || c.COLUMN_NAME)
          .filter(Boolean)
          .map(name => ({ label: name, value: name })),
      );
    } catch {
      this.columns.set([]);
    }
  }

  onColumnChange(column: string): void {
    this.selectedColumn.set(column);
    const key = this.selectedEdgeKey();
    const e = key ? this.edgeByKey.get(key) : null;
    if (!e || !column) return;

    const baseAlias = this.baseAlias || this.baseTable || e.table;
    const targetAlias = e.refTable; // the reached table aliases to its own name
    const joinKey = this.joinKeyFor(e);
    const onClause = `${targetAlias}.${e.refColumn} = ${baseAlias}.${e.column}`;

    const edge: JoinEdgeDescriptor = {
      joinKey,
      joinType: 'LEFT',
      targetSchema: e.refSchema,
      targetTable: e.refTable,
      targetAlias,
      onClause,
      cardinality: 'to_one',
    };

    this.reached.emit({
      edge,
      columnExpr: `${targetAlias}.${column}`,
      targetSchema: e.refSchema,
      targetTable: e.refTable,
      column,
    });
  }

  clear(): void {
    this.selectedEdgeKey.set(null);
    this.selectedColumn.set(null);
    this.columns.set([]);
    this.cleared.emit();
  }
}
