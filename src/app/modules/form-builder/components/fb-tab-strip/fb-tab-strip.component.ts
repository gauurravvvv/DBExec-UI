import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedTab } from '../../services/fb-types';

/**
 * Horizontal reorderable tab bar. Click activates + toggles selection; +Tab
 * appends; the trash icon deletes (stopPropagation so it doesn't select).
 */
@Component({
  selector: 'fb-tab-strip',
  templateUrl: './fb-tab-strip.component.html',
  styleUrls: ['./fb-tab-strip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbTabStripComponent {
  readonly store = inject(FormBuilderStore);

  onTabClick(id: string): void {
    this.store.setActiveTab(id); // activation
    this.store.selectTab(id); // selection (toggle)
  }
  onDeleteTab(ev: Event, id: string): void {
    ev.stopPropagation();
    this.store.removeTab(id);
  }
  onDrop(event: CdkDragDrop<ResolvedTab[]>): void {
    this.store.reorderTabs(event.previousIndex, event.currentIndex);
  }
  isSelected(id: string): boolean {
    const s = this.store.selected();
    return s?.kind === 'tab' && s.id === id;
  }
  trackByTab = (_: number, t: ResolvedTab) => t.id;
}
