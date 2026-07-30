/**
 * qb-filter-tree — root host over the normalized store. Renders the root group,
 * which recurses into conditions and nested groups.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { QueryBuilderStore } from '../../services/query-builder-store';

@Component({
  selector: 'qb-filter-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <qb-group-node
      *ngIf="rootId() as id"
      [nodeId]="id"
      [parentId]="''"
      [depth]="0" />
  `,
})
export class QbFilterTreeComponent {
  private readonly store = inject(QueryBuilderStore);
  readonly rootId = computed(() => this.store.root()?.id ?? '');
}
