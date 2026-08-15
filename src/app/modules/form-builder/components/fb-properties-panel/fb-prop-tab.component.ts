import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedTab } from '../../services/fb-types';

/** Tab property form (§5.1). */
@Component({
  selector: 'fb-prop-tab',
  templateUrl: './fb-prop-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPropTabComponent {
  @Input({ required: true }) tab!: ResolvedTab;
  readonly store = inject(FormBuilderStore);

  onName(v: string): void {
    this.store.updateTab(this.tab.id, { name: v });
  }
  onIcon(v: string): void {
    this.store.updateTab(this.tab.id, { icon: v });
  }
  onActive(checked: boolean): void {
    this.store.updateTab(this.tab.id, { isActive: checked });
  }
}
