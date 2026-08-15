import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedField } from '../../services/fb-types';
import { operatorOptionsForDataType } from '../../helpers/fb-operator-catalog';
import { isLayoutType } from '../../helpers/fb-prompt-type-icons';

/**
 * Placement property form (§5.3) — ALL presentation lives here: label/help/
 * placeholder overrides, mandatory/visible/read-only/locked flags, colSpan
 * (1–4, capped by the section columns), and the Allowed-operators multiselect
 * (filtered by the prompt's dataType). Layout blocks show content + colSpan only.
 */
@Component({
  selector: 'fb-prop-field',
  templateUrl: './fb-prop-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPropFieldComponent {
  @Input({ required: true }) field!: ResolvedField;
  readonly store = inject(FormBuilderStore);

  get isLayout(): boolean {
    return !!this.field.blockType && isLayoutType(this.field.type);
  }
  get operatorOptions() {
    return operatorOptionsForDataType(this.field.dataType);
  }
  get colSpanOptions() {
    const max = this.store.selectedSection()?.columns ?? 4;
    return Array.from({ length: max }, (_, i) => ({
      label: `${i + 1}`,
      value: i + 1,
    }));
  }

  patch(p: Partial<ResolvedField>): void {
    this.store.updatePlacement(this.field.formFieldId, p);
  }
}
