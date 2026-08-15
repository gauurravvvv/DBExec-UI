import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
} from '@angular/core';
import { SelectedElement } from '../../services/form-builder-store';

type InspectorView = 'design' | 'rules' | 'access' | 'preview';

/**
 * Right pane — a p-selectButton view switch (Design | Rules | Access | Preview).
 * Only Design renders live this phase; Rules/Access/Preview show a "coming soon"
 * placeholder (Phases 5/6/7). The view snaps back to Design on every selection
 * change (§4.4).
 */
@Component({
  selector: 'fb-inspector',
  templateUrl: './fb-inspector.component.html',
  styleUrls: ['./fb-inspector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbInspectorComponent {
  /** Signal input so effect() tracks selection changes cleanly (§4.4). */
  selected = input.required<SelectedElement>();

  readonly view = signal<InspectorView>('design');
  readonly viewOptions = [
    { label: 'FORM_BUILDER.INSPECTOR.DESIGN', value: 'design' },
    { label: 'FORM_BUILDER.INSPECTOR.RULES', value: 'rules' },
    { label: 'FORM_BUILDER.INSPECTOR.ACCESS', value: 'access' },
    { label: 'FORM_BUILDER.INSPECTOR.PREVIEW', value: 'preview' },
  ];

  constructor() {
    // Snap the view back to Design on every selection change (§4.4).
    effect(() => {
      this.selected();
      this.view.set('design');
    });
  }
}
