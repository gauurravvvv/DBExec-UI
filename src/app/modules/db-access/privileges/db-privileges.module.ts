import { ScrollingModule } from '@angular/cdk/scrolling';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { TabsComponent } from 'src/app/shared/components/tabs/tabs.component';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { EditDbTemplateComponent } from './templates/edit-db-template/edit-db-template.component';
import { ListDbTemplatesComponent } from './templates/list-db-templates/list-db-templates.component';
import { PrivilegesAccessComponent } from './privileges-access/privileges-access.component';
import { PrivilegesHubComponent } from './privileges-hub/privileges-hub.component';
import { SessionsComponent } from './sessions/sessions.component';

// Privileges & Access section — the merged composer + effective filter
// screen. The selected datasource travels via ?ds=. Fully stateless:
// pick a role, view its live effective privileges, compose access rules,
// and Apply a live change-set. No saved privilege sets.
//
// Active Sessions lives here too (privilege-admin concern, gated on the
// same dbPrivileges permission) as a child route `sessions`, reached from
// the Privileges header. It is a live pg_stat_activity viewer with
// cancel-query + terminate-connection actions.
const routes: Routes = [
  // Tabbed hub (default landing) — owns the header, ONE shared datasource
  // picker, and the tab strip (Compose / Effective / Sessions / Templates),
  // each rendered inline via [ngSwitch]. The standalone routes below remain
  // so deep links + the templates sub-pages still resolve directly.
  { path: '', component: PrivilegesHubComponent },
  { path: 'sessions', component: SessionsComponent },
  // Templates (PDM D10) — static paths BEFORE any param route.
  { path: 'templates', component: ListDbTemplatesComponent },
  {
    path: 'templates/new',
    component: EditDbTemplateComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'templates/:id/edit',
    component: EditDbTemplateComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  declarations: [
    PrivilegesHubComponent,
    PrivilegesAccessComponent,
    SessionsComponent,
    ListDbTemplatesComponent,
    EditDbTemplateComponent,
  ],
  imports: [
    DbAccessSharedModule,
    ScrollingModule,
    TabsComponent,
    RouterModule.forChild(routes),
  ],
})
export class DbPrivilegesModule {}
