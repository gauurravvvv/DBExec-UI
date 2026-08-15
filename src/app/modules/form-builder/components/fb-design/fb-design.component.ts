import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';

@Component({
  selector: 'app-fb-design',
  templateUrl: './fb-design.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbDesignComponent implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return false;
  }
}
