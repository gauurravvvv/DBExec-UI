import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedSection } from '../../services/fb-types';

/**
 * Centre pane — the tab strip + a CDK drop-list of the active tab's sections.
 */
@Component({
  selector: 'fb-canvas',
  templateUrl: './fb-canvas.component.html',
  styleUrls: ['./fb-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbCanvasComponent {
  readonly store = inject(FormBuilderStore);

  onSectionDrop(event: CdkDragDrop<ResolvedSection[]>): void {
    this.store.onSectionDrop(event);
  }
  trackBySection = (_: number, s: ResolvedSection) => s.id;
}
