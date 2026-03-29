import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddGroupComponent } from './components/add-group/add-group.component';
import { EditGroupComponent } from './components/edit-group/edit-group.component';
import { ListGroupComponent } from './components/list-group/list-group.component';
import { ViewGroupComponent } from './components/view-group/view-group.component';

const routes: Routes = [
  {
    path: '',
    component: ListGroupComponent,
  },
  {
    path: 'add',
    component: AddGroupComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewGroupComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditGroupComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroupRoutingModule {}
