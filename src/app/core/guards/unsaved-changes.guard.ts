import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { HasUnsavedChanges } from '../interfaces/has-unsaved-changes';
import { UnsavedChangesService } from '../services/unsaved-changes.service';

@Injectable({
  providedIn: 'root',
})
export class UnsavedChangesGuard implements CanDeactivate<HasUnsavedChanges> {
  constructor(private unsavedChangesService: UnsavedChangesService) {}

  async canDeactivate(component: HasUnsavedChanges): Promise<boolean> {
    if (component?.hasUnsavedChanges?.()) {
      return this.unsavedChangesService.confirm();
    }
    return true;
  }
}
