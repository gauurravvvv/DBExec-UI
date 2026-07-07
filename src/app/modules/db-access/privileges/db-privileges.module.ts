import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { PrivilegesAccessComponent } from './privileges-access/privileges-access.component';
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
  { path: '', component: PrivilegesAccessComponent },
  { path: 'sessions', component: SessionsComponent },
];

@NgModule({
  declarations: [PrivilegesAccessComponent, SessionsComponent],
  imports: [DbAccessSharedModule, RouterModule.forChild(routes)],
})
export class DbPrivilegesModule {}
