import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { PrivilegesAccessComponent } from './privileges-access/privileges-access.component';
import { ViewPrivilegeSetComponent } from './view-privilege-set/view-privilege-set.component';

// Privileges & Access section — the merged composer + effective filter +
// saved-sets screen at '', plus a read-only saved-set detail at ':id'.
// The selected datasource travels via ?ds=.
const routes: Routes = [
  { path: '', component: PrivilegesAccessComponent },
  { path: ':id', component: ViewPrivilegeSetComponent },
];

@NgModule({
  declarations: [PrivilegesAccessComponent, ViewPrivilegeSetComponent],
  imports: [DbAccessSharedModule, RouterModule.forChild(routes)],
})
export class DbPrivilegesModule {}
