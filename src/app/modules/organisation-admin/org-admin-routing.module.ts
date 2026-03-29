import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
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
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewOrgAdminComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditOrgAdminComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgAdminRoutingModule {}
