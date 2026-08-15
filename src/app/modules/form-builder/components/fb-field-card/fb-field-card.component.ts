import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
} from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedField } from '../../services/fb-types';
import {
  isLayoutType,
  promptTypeIcon,
} from '../../helpers/fb-prompt-type-icons';

/**
 * One placement chip on the section grid. Select-only (all editing is in the
 * inspector); layout blocks render a distinct compact card.
 */
@Component({
  selector: 'fb-field-card',
  templateUrl: './fb-field-card.component.html',
  styleUrls: ['./fb-field-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbFieldCardComponent {
  @Input({ required: true }) placement!: ResolvedField;
  readonly store = inject(FormBuilderStore);
  readonly icon = promptTypeIcon;

  get isLayout(): boolean {
    return !!this.placement.blockType && isLayoutType(this.placement.type);
  }

  isSelected = computed(() => {
    const s = this.store.selected();
    return s?.kind === 'field' && s.id === this.placement.formFieldId;
  });

  onClick(): void {
    this.store.selectField(this.placement.formFieldId);
  }
}
