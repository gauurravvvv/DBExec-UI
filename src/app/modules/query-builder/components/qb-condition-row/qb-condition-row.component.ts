/**
 * qb-condition-row — one condition: prompt · operator · value control · remove.
 *
 * Reads and writes the QueryBuilderStore by node id, so it holds no local copy
 * of the condition. An empty value greys the row ("not applied"); a validation
 * error pins a red border and message.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { QueryBuilderStore } from '../../services/query-builder-store';

@Component({
  selector: 'qb-condition-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-condition-row.component.html',
  styleUrls: ['./qb-condition-row.component.scss'],
})
export class QbConditionRowComponent {
  @Input({ required: true }) nodeId!: string;
  @Input({ required: true }) parentId!: string;

  private readonly store = inject(QueryBuilderStore);
  private readonly translate = inject(TranslateService);

  readonly node = computed(() => this.store.conditionById(this.nodeId)());
  readonly errors = computed(() => this.store.errorsForNode(this.nodeId)());

  /** The hydrated prompt for this condition. */
  readonly prompt = computed(() => {
    const n = this.node();
    if (!n) return null;
    return (
      this.store
        .schema()
        ?.groups.flatMap(g => g.prompts)
        .find(p => p.promptId === n.promptId) ?? null
    );
  });

  /** Prompt options for the prompt picker (filterable). */
  readonly promptOptions = computed(() =>
    (this.store.schema()?.groups ?? [])
      .flatMap(g => g.prompts)
      .filter(p => p.isFilterable)
      .map(p => ({ label: p.displayName, value: p.promptId })),
  );

  readonly operatorOptions = computed(() =>
    (this.prompt()?.operators ?? []).map(o => ({
      // Localize via QUERY_BUILDER.OPERATORS.<CODE>; fall back to the catalog
      // label when a locale is missing the key (never show a raw key).
      label: this.operatorLabel(o.code, o.label),
      value: o.code,
    })),
  );

  private operatorLabel(code: string, fallback: string): string {
    const key = `QUERY_BUILDER.OPERATORS.${code.toUpperCase()}`;
    const t = this.translate.instant(key);
    return t === key ? fallback : t;
  }

  readonly arity = computed(() => {
    const n = this.node();
    if (!n) return 'one' as const;
    const op = this.prompt()?.operators.find(o => o.code === n.operatorCode);
    return (op?.arity as any) ?? 'one';
  });

  /**
   * Parent selections for a cascading lookup: for each promptId this prompt's
   * value source depends on, the values currently entered elsewhere in the tree.
   */
  readonly dependsOnValues = computed<Record<string, string[]>>(() => {
    const vs = this.prompt()?.valueSource as any;
    const parents: string[] =
      vs && vs.kind === 'lookup' && Array.isArray(vs.dependsOn)
        ? vs.dependsOn
        : [];
    const out: Record<string, string[]> = {};
    for (const parentId of parents) {
      out[parentId] = this.store.valuesForPrompt(parentId);
    }
    return out;
  });

  /** Empty and not mandatory -> the condition is skipped. */
  readonly isSkipped = computed(() => {
    const n = this.node();
    if (!n) return false;
    const a = this.arity();
    if (a === 'none') return false;
    const empty =
      a === 'two'
        ? n.values.length < 2 || n.values[0] == null || n.values[1] == null
        : n.values.length === 0 || n.values[0] == null || n.values[0] === '';
    return empty && !this.prompt()?.isMandatory;
  });

  onPromptChange(promptId: string): void {
    this.store.setPrompt(this.nodeId, promptId);
  }
  onOperatorChange(code: string): void {
    this.store.setOperator(this.nodeId, code);
  }
  onValuesChange(values: any[]): void {
    this.store.setValues(this.nodeId, values);
  }
  onNegateToggle(): void {
    const n = this.node();
    if (n) this.store.setConditionNegate(this.nodeId, !n.negate);
  }
  remove(): void {
    this.store.removeNode(this.parentId, this.nodeId);
  }
}
