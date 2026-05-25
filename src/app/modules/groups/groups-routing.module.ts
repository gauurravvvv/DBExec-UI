import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
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
    path: 'new',
    component: AddGroupComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewGroupComponent },
  {
    path: ':id/edit',
    component: EditGroupComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroupsRoutingModule {}
