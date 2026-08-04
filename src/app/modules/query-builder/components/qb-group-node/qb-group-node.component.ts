/**
 * qb-group-node — a recursive AND/OR group.
 *
 * Renders a Match ALL / Match ANY toggle, its children (conditions and nested
 * groups, self-recursively), and add / negate / remove controls. Reads and
 * writes the store by node id.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
} from '@angular/core';
import { QueryBuilderStore, StoreNode } from '../../services/query-builder-store';

@Component({
  selector: 'qb-group-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-group-node.component.html',
  styleUrls: ['./qb-group-node.component.scss'],
})
export class QbGroupNodeComponent {
  @Input({ required: true }) nodeId!: string;
  /** Empty for the root group (which cannot be removed). */
  @Input() parentId = '';
  @Input() depth = 0;

  private readonly store = inject(QueryBuilderStore);

  readonly node = computed(() => this.store.groupById(this.nodeId)());

  readonly children = computed<StoreNode[]>(() => {
    const g = this.node();
    if (!g) return [];
    const map = this.store;
    return g.childIds
      .map(id => (map.nodeById(id) as any)())
      .filter(Boolean) as StoreNode[];
  });

  readonly canDelete = computed(() => !!this.parentId);

  /** For the toggle: true = AND (Match ALL), false = OR (Match ANY). */
  readonly isAll = computed(() => this.node()?.op === 'AND');

  setOp(all: boolean): void {
    this.store.setGroupOp(this.nodeId, all ? 'AND' : 'OR');
  }
  addCondition(): void {
    this.store.addCondition(this.nodeId);
  }
  addGroup(): void {
    this.store.addGroup(this.nodeId);
  }
  toggleNegate(): void {
    const g = this.node();
    if (g) this.store.setGroupNegate(this.nodeId, !g.negate);
  }
  remove(): void {
    if (this.parentId) this.store.removeNode(this.parentId, this.nodeId);
  }

  trackById = (_: number, n: StoreNode) => n.id;
}
