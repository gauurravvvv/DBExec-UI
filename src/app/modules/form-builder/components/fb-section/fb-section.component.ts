import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedField, ResolvedSection } from '../../services/fb-types';

/**
 * One section: a drag-handle head (label / collapse / N-col badge / delete) and
 * a CDK drop-list of field cards laid out on a 1–4 column CSS grid.
 */
@Component({
  selector: 'fb-section',
  templateUrl: './fb-section.component.html',
  styleUrls: ['./fb-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbSectionComponent {
  @Input({ required: true }) section!: ResolvedSection;
  readonly store = inject(FormBuilderStore);
  readonly collapsed = signal(false);

  get dropId(): string {
    return this.store.dropId(this.section.id);
  }

  isSelected = computed(() => {
    const s = this.store.selected();
    return s?.kind === 'section' && s.id === this.section.id;
  });

  onHeadClick(): void {
    this.store.selectSection(this.section.id);
  }
  onDelete(ev: Event): void {
    ev.stopPropagation();
    this.store.removeSection(this.section.id);
  }
  onFieldDrop(event: CdkDragDrop<ResolvedField[]>): void {
    this.store.onFieldDrop(event, this.section);
  }
  toggleCollapse(ev: Event): void {
    ev.stopPropagation();
    this.collapsed.set(!this.collapsed());
  }
  trackByPlacement = (_: number, p: ResolvedField) => p.formFieldId;
}
