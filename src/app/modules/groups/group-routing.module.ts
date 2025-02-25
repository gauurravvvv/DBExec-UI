import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
  },
  { path: 'view/:orgId/:id', component: ViewGroupComponent },
  { path: 'edit/:orgId/:id', component: EditGroupComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroupRoutingModule {}
