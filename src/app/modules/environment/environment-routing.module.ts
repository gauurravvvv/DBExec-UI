import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddEnvironmentComponent } from './components/add-environment/add-environment.component';
import { EditEnvironmentComponent } from './components/edit-environment/edit-environment.component';
import { ListEnvironmentComponent } from './components/list-environment/list-environment.component';

const routes: Routes = [
  {
    path: '',
    component: ListEnvironmentComponent,
  },
  {
    path: 'add',
    component: AddEnvironmentComponent,
  },
  { path: 'edit/:orgId/:id', component: EditEnvironmentComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EnvironmentRoutingModule {}
