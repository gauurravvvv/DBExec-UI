import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddSystemUserComponent } from './components/add-system-user/add-system-user.component';
import { BulkAddSystemUserComponent } from './components/bulk-add-system-user/bulk-add-system-user.component';
import { EditSystemUserComponent } from './components/edit-system-user/edit-system-user.component';
import { ListSystemUserComponent } from './components/list-system-user/list-system-user.component';
import { ViewSystemUserComponent } from './components/view-system-user/view-system-user.component';

const routes: Routes = [
  {
    path: '',
    component: ListSystemUserComponent,
  },
  {
    path: 'new',
    component: AddSystemUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'bulk-add',
    component: BulkAddSystemUserComponent,
  },
  { path: ':id', component: ViewSystemUserComponent },
  {
    path: ':id/edit',
    component: EditSystemUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SystemUsersRoutingModule {}
