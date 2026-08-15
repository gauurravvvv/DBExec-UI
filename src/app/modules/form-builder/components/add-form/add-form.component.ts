import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';

@Component({
  selector: 'app-add-form',
  templateUrl: './add-form.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFormComponent implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return false;
  }
}
