import { Injectable, computed, inject, signal } from '@angular/core';
import { PromptService } from './prompt.service';
import { buildFilterExpr } from '../helpers/prompt-config-helpers';
// Type-only import — the visual builder owns the persisted edge shape
// (joinKey / targetSchema / onClause / …). Re-exported so the steps that read
// svc.joins().edges share one type.
import type { JoinEdge } from '../components/prompt-join-builder/prompt-join-builder.component';

export type { JoinEdge };

interface SourceState {
  schema: string;
  table: string;
  alias: string;
}
interface JoinsState {
  edges: JoinEdge[];
  rawSql: string;
  useRaw: boolean;
}
interface ColumnFilterState {
  selectExpr: string;
  selectAlias: string;
  filterColumn: string;
  operator: string;
  filterValue: string;
  rawFilterSql: string;
  useRaw: boolean;
}

/**
 * PromptConfigService — signal state for the config-prompt 4-step stepper.
 * Provided per config-prompt instance (see the shell's `providers`), NOT root,
 * so each open editor keeps its own draft. Loads the SQL-only PromptConfig,
 * assembles the /config payload, and posts it. Value rows persist via the
 * value-source PUT/upload in the Values step, not through this payload.
 */
@Injectable()
export class PromptConfigService {
  private readonly prompts = inject(PromptService);

  /** Datasource that owns the prompt — feeds schema/table/column + joins. */
  readonly connectorId = signal<string>('');

  readonly currentStep = signal(0);
  readonly dirty = signal(false);
  readonly saving = this.prompts.saving;

  readonly source = signal<SourceState>({ schema: '', table: '', alias: '' });
  readonly joins = signal<JoinsState>({ edges: [], rawSql: '', useRaw: false });
  readonly columnFilter = signal<ColumnFilterState>({
    selectExpr: '',
    selectAlias: '',
    filterColumn: '',
    operator: '',
    filterValue: '',
    rawFilterSql: '',
    useRaw: false,
  });

  readonly stepValid = computed<boolean[]>(() => {
    const s = this.source();
    const cf = this.columnFilter();
    return [
      !!s.schema && !!s.table, // source
      true, // joins optional
      !!cf.selectExpr && (cf.useRaw ? !!cf.rawFilterSql : !!cf.operator || !cf.filterColumn),
      true, // values (value-source editor gates its own save)
    ];
  });
  readonly canSave = computed(
    () => this.dirty() && this.stepValid().every(Boolean),
  );

  next(): void {
    if (this.currentStep() < 3) this.currentStep.update(i => i + 1);
  }
  back(): void {
    if (this.currentStep() > 0) this.currentStep.update(i => i - 1);
  }
  goto(i: number): void {
    if (i >= 0 && i <= 3) this.currentStep.set(i);
  }
  markDirty(): void {
    this.dirty.set(true);
  }

  patchSource(p: Partial<SourceState>): void {
    this.source.update(v => ({ ...v, ...p }));
    this.markDirty();
  }
  patchJoins(p: Partial<JoinsState>): void {
    this.joins.update(v => ({ ...v, ...p }));
    this.markDirty();
  }
  patchColumnFilter(p: Partial<ColumnFilterState>): void {
    this.columnFilter.update(v => ({ ...v, ...p }));
    this.markDirty();
  }

  async load(promptId: string): Promise<void> {
    const res = await this.prompts.getConfig(promptId);
    const d = res?.data ?? {};
    this.source.set({
      schema: d.prompt_schema ?? '',
      table: (d.prompt_table ?? '').split(',')[0] ?? '',
      alias: d.select_alias ?? '',
    });
    this.joins.set({
      edges: d.join_edges ?? [],
      rawSql: d.prompt_join ?? '',
      useRaw: !!d.prompt_join && !(d.join_edges?.length),
    });
    this.columnFilter.set({
      selectExpr: d.select_expr ?? '',
      selectAlias: d.select_alias ?? '',
      filterColumn: d.filter_expr ?? '',
      operator: '',
      filterValue: '',
      rawFilterSql: d.prompt_where ?? '',
      useRaw: !!d.prompt_where && !d.filter_expr,
    });
    this.dirty.set(false);
  }

  buildConfigPayload(promptId: string): Record<string, unknown> {
    const s = this.source();
    const j = this.joins();
    const cf = this.columnFilter();
    return {
      id: promptId,
      schema: s.schema,
      tables: s.table,
      columns: cf.selectExpr,
      selectExpr: cf.selectExpr,
      selectAlias: cf.selectAlias || s.alias,
      promptJoin: j.useRaw ? j.rawSql : '',
      joinEdges: j.useRaw ? [] : j.edges,
      requiredJoins: j.useRaw ? null : j.edges,
      filterExpr: cf.useRaw ? null : cf.filterColumn,
      promptWhere: cf.useRaw ? cf.rawFilterSql : buildFilterExpr(cf),
      filterStrategy: cf.useRaw ? 'raw' : 'structured',
      promptSql: '',
      promptValues: [], // value rows persist via the value-source PUT/upload
      promptValueSQL: null,
    };
  }

  async save(promptId: string, justification?: string): Promise<any> {
    const payload = this.buildConfigPayload(promptId);
    if (justification) (payload as any).justification = justification;
    const res = await this.prompts.configPrompt(payload);
    if (res?.status) this.dirty.set(false);
    return res;
  }
}
