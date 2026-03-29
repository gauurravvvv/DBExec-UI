import { Component } from '@angular/core';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';

@Component({
  selector: 'app-edit-role',
  templateUrl: './edit-role.component.html',
  styleUrls: ['./edit-role.component.scss'],
})
export class EditRoleComponent implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return false;
  }
}
