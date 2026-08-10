import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddSystemGroupComponent } from './components/add-system-group/add-system-group.component';
import { EditSystemGroupComponent } from './components/edit-system-group/edit-system-group.component';
import { ListSystemGroupComponent } from './components/list-system-group/list-system-group.component';
import { ViewSystemGroupComponent } from './components/view-system-group/view-system-group.component';

const routes: Routes = [
  {
    path: '',
    component: ListSystemGroupComponent,
  },
  {
    path: 'new',
    component: AddSystemGroupComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewSystemGroupComponent },
  {
    path: ':id/edit',
    component: EditSystemGroupComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SystemGroupsRoutingModule {}
