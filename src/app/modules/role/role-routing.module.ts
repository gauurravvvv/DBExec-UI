import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddRoleComponent } from './components/add-role/add-role.component';
import { ViewRoleComponent } from './components/view-role/view-role.component';
import { EditRoleComponent } from './components/edit-role/edit-role.component';
import { ListRoleComponent } from './components/list-role/list-role.component';

const routes: Routes = [
  {
    path: '',
    component: ListRoleComponent,
  },
  {
    path: 'add',
    component: AddRoleComponent,
  },
  { path: 'view/:orgId/:id', component: ViewRoleComponent },
  { path: 'edit/:orgId/:id', component: EditRoleComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RoleRoutingModule {}
