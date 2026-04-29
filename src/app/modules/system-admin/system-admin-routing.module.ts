import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddSystemAdminComponent } from './components/add-system-admin/add-system-admin.component';
import { EditSystemAdminComponent } from './components/edit-system-admin/edit-system-admin.component';
import { ListSystemAdminComponent } from './components/list-system-admin/list-system-admin.component';
import { ViewSystemAdminComponent } from './components/view-system-admin/view-system-admin.component';

const routes: Routes = [
  {
    path: '',
    component: ListSystemAdminComponent,
  },
  {
    path: 'add',
    component: AddSystemAdminComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'view/:id', component: ViewSystemAdminComponent },
  {
    path: 'edit/:id',
    component: EditSystemAdminComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SystemAdminRoutingModule {}
