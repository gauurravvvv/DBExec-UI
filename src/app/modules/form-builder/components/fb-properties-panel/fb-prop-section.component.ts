import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedSection } from '../../services/fb-types';

/** Section property form (§5.2). Changing columns clamps oversized colSpans. */
@Component({
  selector: 'fb-prop-section',
  templateUrl: './fb-prop-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPropSectionComponent {
  @Input({ required: true }) section!: ResolvedSection;
  readonly store = inject(FormBuilderStore);

  readonly columnOptions = [1, 2, 3, 4].map(n => ({ label: `${n}`, value: n }));

  onName(v: string): void {
    this.store.updateSection(this.section.id, { name: v });
  }
  onColumns(v: number): void {
    this.store.updateSection(this.section.id, {
      columns: v as 1 | 2 | 3 | 4,
    });
  }
  onCollapsible(checked: boolean): void {
    this.store.updateSection(this.section.id, { collapsible: checked });
  }
}
