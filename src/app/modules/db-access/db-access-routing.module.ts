import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DbAccessHomeComponent } from './components/db-access-home/db-access-home.component';
import { DbAccessWorkspaceComponent } from './components/db-access-workspace/db-access-workspace.component';

// Landing (datasource picker + capability banner) is the default route.
// `/:datasourceId` opens the per-datasource workspace shell that hosts the
// Users / Roles / Privileges / Effective / Mappings / Audit tabs.
const routes: Routes = [
  { path: '', component: DbAccessHomeComponent },
  { path: ':datasourceId', component: DbAccessWorkspaceComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DbAccessRoutingModule {}
