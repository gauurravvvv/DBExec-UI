import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddUserComponent } from './components/add-user/add-user.component';
import { EditUserComponent } from './components/edit-user/edit-user.component';
import { ListUserComponent } from './components/list-user/list-user.component';
import { ViewUserComponent } from './components/view-user/view-user.component';

const routes: Routes = [
  {
    path: '',
    component: ListUserComponent,
  },
  {
    path: 'add',
    component: AddUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewUserComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsersRoutingModule {}
