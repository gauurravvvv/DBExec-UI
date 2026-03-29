import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddUsersComponent } from './components/add-users/add-users.component';
import { EditUsersComponent } from './components/edit-users/edit-users.component';
import { ListUsersComponent } from './components/list-users/list-users.component';
import { ViewUsersComponent } from './components/view-users/view-users.component';

const routes: Routes = [
  {
    path: '',
    component: ListUsersComponent,
  },
  {
    path: 'add',
    component: AddUsersComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewUsersComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditUsersComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsersRoutingModule {}
