import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddDbRoleComponent } from './components/add-db-role/add-db-role.component';
import { AddDbUserComponent } from './components/add-db-user/add-db-user.component';
import { DbAccessHomeComponent } from './components/db-access-home/db-access-home.component';
import { DbAccessWorkspaceComponent } from './components/db-access-workspace/db-access-workspace.component';
import { EditDbRoleComponent } from './components/edit-db-role/edit-db-role.component';
import { EditDbUserComponent } from './components/edit-db-user/edit-db-user.component';
import { ViewDbRoleComponent } from './components/view-db-role/view-db-role.component';
import { ViewDbUserComponent } from './components/view-db-user/view-db-user.component';

// Canonical list → add → edit → view shape, mirroring datasource-routing.
// The home picker lands at ''. Everything else nests under :datasourceId.
// Static segments (users/new, roles/new) come BEFORE the :roleName capture
// so the router doesn't grab the word "new" as a role name.
const routes: Routes = [
  { path: '', component: DbAccessHomeComponent },
  {
    path: ':datasourceId/users/new',
    component: AddDbUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':datasourceId/users/:roleName/edit',
    component: EditDbUserComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':datasourceId/users/:roleName', component: ViewDbUserComponent },
  {
    path: ':datasourceId/roles/new',
    component: AddDbRoleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':datasourceId/roles/:roleName/edit',
    component: EditDbRoleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':datasourceId/roles/:roleName', component: ViewDbRoleComponent },
  // Workspace shell (tabbed listings) is the datasource landing.
  { path: ':datasourceId', component: DbAccessWorkspaceComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DbAccessRoutingModule {}
