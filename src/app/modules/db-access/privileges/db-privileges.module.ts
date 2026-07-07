import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { PrivilegesAccessComponent } from './privileges-access/privileges-access.component';

// Privileges & Access section — the merged composer + effective filter
// screen. The selected datasource travels via ?ds=. Fully stateless:
// pick a role, view its live effective privileges, compose access rules,
// and Apply a live change-set. No saved privilege sets.
const routes: Routes = [
  { path: '', component: PrivilegesAccessComponent },
];

@NgModule({
  declarations: [PrivilegesAccessComponent],
  imports: [DbAccessSharedModule, RouterModule.forChild(routes)],
})
export class DbPrivilegesModule {}
