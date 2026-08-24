import { Injectable, computed, inject, signal } from '@angular/core';
import { PromptService } from './prompt.service';
import { buildFilterExpr } from '../helpers/prompt-config-helpers';
import { isChoiceType } from '../constants/prompt.constant';
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

/** Per-type input bounds (choice widgets have none). Shape by dataType family. */
export interface InputConstraints {
  minLen?: number | null;
  maxLen?: number | null;
  pattern?: string | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  earliest?: string | null;
  latest?: string | null;
}

/**
 * PromptConfigService — signal state for the single-page config builder.
 * Provided per config-prompt instance (see the shell's `providers`), NOT root,
 * so each open editor keeps its own draft.
 *
 * 2026-08-21 rebuild: the 4-step wizard was replaced by one scrollable page
 * with a live-preview rail, so the step machinery is gone. This service now
 * also owns `dataType` (drives operator applicability), `inputConstraints`
 * (free-input widgets), and a client-side `previewSql` computed. `type` is the
 * runtime widget (read-only in config); `isChoice` gates Values vs Constraints.
 */
@Injectable()
export class PromptConfigService {
  private readonly prompts = inject(PromptService);

  /** Datasource that owns the prompt — feeds schema/table/column + joins. */
  readonly datasourceId = signal<string>('');

  /** The prompt's runtime widget type (read-only here) + its logical dataType. */
  readonly promptType = signal<string>('');
  readonly dataType = signal<string>('');
  /** 'auto' = re-infer dataType from the source column; 'override' = admin-set. */
  readonly dataTypeMode = signal<'auto' | 'override'>('auto');

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
  readonly inputConstraints = signal<InputConstraints>({});

  /** True when the widget offers a value LIST (dropdown/multiselect/radio/checkbox). */
  readonly isChoice = computed(() => isChoiceType(this.promptType()));

  /** Per-field validity (no step gating anymore — just overall). */
  readonly valid = computed<boolean>(() => {
    const s = this.source();
    const cf = this.columnFilter();
    const hasSource = !!s.schema && !!s.table;
    // A filter is optional; when present it must be complete (col + op) or raw.
    const filterOk =
      (!cf.filterColumn && !cf.useRaw) ||
      (cf.useRaw ? !!cf.rawFilterSql : !!cf.filterColumn && !!cf.operator);
    return hasSource && filterOk;
  });
  readonly canSave = computed(() => this.dirty() && this.valid());

  /**
   * Live, client-side SQL preview. Mirrors the compiler's SELECT/FROM/JOIN/
   * WHERE shape from the structured state — NOT authoritative (the server
   * compiler builds the final query); labeled as a preview in the UI.
   */
  readonly previewSql = computed<string>(() => {
    const s = this.source();
    const j = this.joins();
    const cf = this.columnFilter();
    if (!s.schema || !s.table) return '';
    const alias = s.alias || s.table;
    const selectCol = cf.selectExpr || `${alias}.*`;
    const lines: string[] = [];
    lines.push(`SELECT DISTINCT ${selectCol}`);
    lines.push(`FROM ${s.schema}.${s.table} ${alias}`);
    // Joins: structured edges (preferred) or a raw fragment.
    if (!j.useRaw) {
      for (const e of j.edges ?? []) {
        const jt = (e.joinType || 'LEFT').toUpperCase();
        lines.push(
          `${jt} JOIN ${e.targetSchema}.${e.targetTable} ${e.targetAlias} ON ${e.onClause}`,
        );
      }
    } else if (j.rawSql?.trim()) {
      lines.push(j.rawSql.trim());
    }
    // Where: raw or structured.
    const where = cf.useRaw
      ? cf.rawFilterSql?.trim()
      : buildFilterExpr({
          filterColumn: cf.filterColumn,
          operator: cf.operator,
          filterValue: cf.filterValue,
          useRaw: cf.useRaw,
          rawFilterSql: cf.rawFilterSql,
        });
    if (where) lines.push(`WHERE ${where}`);
    return lines.join('\n');
  });

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
  patchConstraints(p: Partial<InputConstraints>): void {
    this.inputConstraints.update(v => ({ ...v, ...p }));
    this.markDirty();
  }

  /** Set dataType from an explicit admin choice (flips to override mode). */
  setDataTypeOverride(dt: string): void {
    this.dataType.set(dt || '');
    this.dataTypeMode.set('override');
    this.markDirty();
  }
  /** Re-infer dataType from a source column's DB type (auto mode only). */
  inferDataType(dt: string): void {
    if (this.dataTypeMode() === 'override') return;
    if (dt && dt !== this.dataType()) {
      this.dataType.set(dt);
      this.markDirty();
    }
  }

  async load(promptId: string): Promise<void> {
    const res = await this.prompts.getConfig(promptId);
    // BE getPromptConfiguration returns NESTED { prompt, configuration, values }.
    // (The old flat `res.data.prompt_schema` read never re-hydrated source/filter
    // — fixed here to read `configuration.*` + `prompt.*`.)
    const data = res?.data ?? {};
    const cfg = data.configuration ?? {};
    const prompt = data.prompt ?? {};

    this.promptType.set(prompt.type ?? '');
    this.dataType.set(prompt.dataType ?? '');
    this.dataTypeMode.set(prompt.dataType ? 'override' : 'auto');

    this.source.set({
      schema: cfg.prompt_schema ?? '',
      table: (cfg.prompt_table ?? '').split(',')[0] ?? '',
      alias: cfg.select_alias ?? '',
    });
    this.joins.set({
      edges: cfg.join_edges ?? [],
      rawSql: cfg.prompt_join ?? '',
      useRaw: !!cfg.prompt_join && !(cfg.join_edges?.length),
    });
    this.columnFilter.set({
      selectExpr: cfg.select_expr ?? '',
      selectAlias: cfg.select_alias ?? '',
      filterColumn: cfg.filter_expr ?? '',
      operator: cfg.filter_operator ?? '',
      filterValue: '',
      rawFilterSql: cfg.prompt_where ?? '',
      useRaw: !!cfg.prompt_where && !cfg.filter_expr,
    });
    this.inputConstraints.set((cfg.input_constraints as InputConstraints) ?? {});
    this.dirty.set(false);
  }

  buildConfigPayload(promptId: string): Record<string, unknown> {
    const s = this.source();
    const j = this.joins();
    const cf = this.columnFilter();
    const choice = this.isChoice();
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
      // Persist the operator code (source of truth for the dropdown on reopen).
      filterOperator: cf.useRaw ? null : cf.operator || null,
      promptWhere: cf.useRaw ? cf.rawFilterSql : buildFilterExpr(cf),
      filterStrategy: cf.useRaw ? 'raw' : 'structured',
      // dataType drives operator applicability server-side.
      dataType: this.dataType() || undefined,
      // Input constraints only for free-input widgets (choice types use a list).
      inputConstraints: choice ? null : this.inputConstraints(),
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
