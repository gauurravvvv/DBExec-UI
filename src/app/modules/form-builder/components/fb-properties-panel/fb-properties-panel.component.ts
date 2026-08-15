import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import {
  FormBuilderStore,
  SelectedElement,
} from '../../services/form-builder-store';

/**
 * Design view of the inspector — switches on the selected kind and delegates to
 * a small per-kind child form (tab / section / field placement).
 */
@Component({
  selector: 'fb-properties-panel',
  templateUrl: './fb-properties-panel.component.html',
  styleUrls: ['./fb-properties-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPropertiesPanelComponent {
  @Input() selected: SelectedElement = null;
  readonly store = inject(FormBuilderStore);
}
