import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { HasUnsavedChanges } from '../models/has-unsaved-changes.model';
import { UnsavedChangesService } from '../services/unsaved-changes.service';

export const unsavedChangesGuard: CanDeactivateFn<
  HasUnsavedChanges
> = component => {
  if (component?.hasUnsavedChanges?.()) {
    const unsavedChangesService = inject(UnsavedChangesService);
    return unsavedChangesService.confirm();
  }
  return true;
};
