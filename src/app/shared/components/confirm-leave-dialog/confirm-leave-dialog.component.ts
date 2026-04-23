import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UnsavedChangesService } from 'src/app/core/services/unsaved-changes.service';

@Component({
  selector: 'app-confirm-leave-dialog',
  templateUrl: './confirm-leave-dialog.component.html',
  styleUrls: ['./confirm-leave-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmLeaveDialogComponent {
  constructor(public unsavedChangesService: UnsavedChangesService) {}

  stay(): void {
    this.unsavedChangesService.respond(false);
  }

  leave(): void {
    this.unsavedChangesService.respond(true);
  }
}
