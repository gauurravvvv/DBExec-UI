import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { ListConnectionComponent } from './components/list-connection/list-connection.component';
import { AddConnectionComponent } from './components/add-connection/add-connection.component';
import { ViewConnectionComponent } from './components/view-connection/view-connection.component';
import { EditConnectionComponent } from './components/edit-connection/edit-connection.component';

const routes: Routes = [
  {
    path: '',
    component: ListConnectionComponent,
  },
  {
    path: 'add',
    component: AddConnectionComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewConnectionComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditConnectionComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConnectionsRoutingModule {}
