/**
 * qb-summary — plain-English rendering of the condition tree.
 *
 * Business users trust this more than SQL and it catches logic mistakes SQL
 * hides. Reads the store, skips empty (not-applied) conditions, and renders
 * "Field is any of A, B AND Field2 equals X — OR — Field3 equals Y".
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  QueryBuilderStore,
  StoreConditionNode,
  StoreGroupNode,
} from '../../services/query-builder-store';

@Component({
  selector: 'qb-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-summary.component.html',
  styleUrls: ['./qb-summary.component.scss'],
})
export class QbSummaryComponent {
  private readonly store = inject(QueryBuilderStore);

  readonly text = computed(() => {
    const root = this.store.root();
    if (!root) return '';
    const s = this.renderGroup(root, true);
    return s || '';
  });

  private promptName(promptId: string): string {
    return (
      this.store
        .schema()
        ?.groups.flatMap(g => g.prompts)
        .find(p => p.promptId === promptId)?.displayName ?? promptId
    );
  }

  private operatorLabel(promptId: string, code: string): string {
    return (
      this.store
        .schema()
        ?.groups.flatMap(g => g.prompts)
        .find(p => p.promptId === promptId)
        ?.operators.find(o => o.code === code)?.label ?? code
    ).toLowerCase();
  }

  private renderCondition(n: StoreConditionNode): string | null {
    const arity = this.store.operatorMeta(n.promptId, n.operatorCode).arity;
    const name = this.promptName(n.promptId);
    const op = this.operatorLabel(n.promptId, n.operatorCode);
    if (arity === 'none') {
      return `${name} ${op}`;
    }
    const empty =
      arity === 'two'
        ? n.values.length < 2 || n.values[0] == null || n.values[1] == null
        : n.values.length === 0 || n.values[0] == null || n.values[0] === '';
    if (empty) return null; // skipped
    const vals =
      arity === 'two'
        ? `${n.values[0]} and ${n.values[1]}`
        : n.values.join(', ');
    const base = `${name} ${op} ${vals}`;
    return n.negate ? `NOT (${base})` : base;
  }

  private renderGroup(g: StoreGroupNode, isRoot = false): string | null {
    const store = this.store;
    const parts = g.childIds
      .map(id => {
        const node = store.nodeById(id)();
        if (!node) return null;
        return node.kind === 'group'
          ? this.renderGroup(node)
          : this.renderCondition(node);
      })
      .filter((p): p is string => !!p);
    if (!parts.length) return null;
    const sep = g.op === 'AND' ? ' AND ' : ' — OR — ';
    const joined = parts.length === 1 ? parts[0] : parts.join(sep);
    const wrapped = isRoot || parts.length === 1 ? joined : `(${joined})`;
    return g.negate ? `NOT ${wrapped}` : wrapped;
  }
}
