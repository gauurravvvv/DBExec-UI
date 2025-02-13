import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddSuperAdminComponent } from './components/add-super-admin/add-super-admin.component';
import { EditSuperAdminComponent } from './components/edit-super-admin/edit-super-admin.component';
import { ListSuperAdminComponent } from './components/list-super-admin/list-super-admin.component';
import { ViewSuperAdminComponent } from './components/view-super-admin/view-super-admin.component';

const routes: Routes = [
  {
    path: '',
    component: ListSuperAdminComponent,
  },
  {
    path: 'add',
    component: AddSuperAdminComponent,
  },
  { path: 'view/:id', component: ViewSuperAdminComponent },
  { path: 'edit/:id', component: EditSuperAdminComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SuperAdminRoutingModule {}
