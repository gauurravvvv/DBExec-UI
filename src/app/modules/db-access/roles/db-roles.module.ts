import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { AddDbRoleComponent } from './add-db-role/add-db-role.component';
import { EditDbRoleComponent } from './edit-db-role/edit-db-role.component';
import { ListDbRolesComponent } from './list-db-roles/list-db-roles.component';
import { ViewDbRoleComponent } from './view-db-role/view-db-role.component';

// Database Users & Roles section — its own list → add/edit/view module.
// A PG "user" and "role" are the same object (they differ only by
// canLogin), so this one module manages both; the list's Type filter
// slices login users from group roles. Static `new` before `:roleName`.
// The selected datasource travels via ?ds=.
const routes: Routes = [
  { path: '', component: ListDbRolesComponent },
  { path: 'new', component: AddDbRoleComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':roleName/edit', component: EditDbRoleComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':roleName', component: ViewDbRoleComponent },
];

@NgModule({
  declarations: [
    ListDbRolesComponent,
    AddDbRoleComponent,
    EditDbRoleComponent,
    ViewDbRoleComponent,
  ],
  imports: [DbAccessSharedModule, RouterModule.forChild(routes)],
})
export class DbRolesModule {}
