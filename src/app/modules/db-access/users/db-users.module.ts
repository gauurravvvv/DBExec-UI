import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { DbAccessSharedModule } from '../db-access-shared.module';
import { AddDbUserComponent } from './add-db-user/add-db-user.component';
import { EditDbUserComponent } from './edit-db-user/edit-db-user.component';
import { ListDbUsersComponent } from './list-db-users/list-db-users.component';
import { ViewDbUserComponent } from './view-db-user/view-db-user.component';

// Database Users section — its own list → add/edit/view module (like
// datasource). Static `new` before `:roleName` so the router doesn't grab
// "new" as a role name. The selected datasource travels via ?ds=.
const routes: Routes = [
  { path: '', component: ListDbUsersComponent },
  { path: 'new', component: AddDbUserComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':roleName/edit', component: EditDbUserComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':roleName', component: ViewDbUserComponent },
];

@NgModule({
  declarations: [
    ListDbUsersComponent,
    AddDbUserComponent,
    EditDbUserComponent,
    ViewDbUserComponent,
  ],
  imports: [DbAccessSharedModule, RouterModule.forChild(routes)],
})
export class DbUsersModule {}
