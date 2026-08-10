import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddSystemRoleComponent } from './components/add-system-role/add-system-role.component';
import { EditSystemRoleComponent } from './components/edit-system-role/edit-system-role.component';
import { ListSystemRoleComponent } from './components/list-system-role/list-system-role.component';
import { ViewSystemRoleComponent } from './components/view-system-role/view-system-role.component';

const routes: Routes = [
  {
    path: '',
    component: ListSystemRoleComponent,
  },
  {
    path: 'new',
    component: AddSystemRoleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewSystemRoleComponent },
  {
    path: ':id/edit',
    component: EditSystemRoleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SystemRoleRoutingModule {}
