import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddConnectorComponent } from './components/add-connector/add-connector.component';
import { EditConnectorComponent } from './components/edit-connector/edit-connector.component';
import { ListConnectorComponent } from './components/list-connector/list-connector.component';
import { ViewConnectorComponent } from './components/view-connector/view-connector.component';

// REST-shaped routes. Static segments (`new`) come BEFORE
// `:id` so the router doesn't capture the word "new" as an id param.
const routes: Routes = [
  { path: '', component: ListConnectorComponent },
  {
    path: 'new',
    component: AddConnectorComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewConnectorComponent },
  {
    path: ':id/edit',
    component: EditConnectorComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConnectorRoutingModule {}
