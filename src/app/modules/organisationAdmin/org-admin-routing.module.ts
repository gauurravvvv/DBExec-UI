import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddOrgAdminComponent } from './components/add-org-admin/add-org-admin.component';
import { EditOrgAdminComponent } from './components/edit-org-admin/edit-org-admin.component';
import { ListOrgAdminComponent } from './components/list-org-admin/list-org-admin.component';
import { ViewOrgAdminComponent } from './components/view-org-admin/view-org-admin.component';

const routes: Routes = [
  {
    path: '',
    component: ListOrgAdminComponent,
  },
  {
    path: 'add',
    component: AddOrgAdminComponent,
  },
  { path: 'view/:id', component: ViewOrgAdminComponent },
  { path: 'edit/:id', component: EditOrgAdminComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgAdminRoutingModule {}
