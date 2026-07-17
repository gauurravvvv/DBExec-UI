import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AddSavedQueryComponent } from '../add-saved-query/add-saved-query.component';

/**
 * EditSavedQueryComponent — the edit route for a saved query. Shares
 * AddSavedQueryComponent's template + logic verbatim; `isEdit` is derived
 * from the presence of the :id route param in ngOnInit, so no override is
 * needed. A distinct component class exists only so the route can name it.
 */
@Component({
  selector: 'app-edit-saved-query',
  templateUrl: '../add-saved-query/add-saved-query.component.html',
  styleUrls: ['../add-saved-query/add-saved-query.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSavedQueryComponent extends AddSavedQueryComponent {}
