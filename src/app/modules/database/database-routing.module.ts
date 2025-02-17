import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListDatabaseComponent } from './components/list-database/list-database.component';
import { AddDatabaseComponent } from './components/add-database/add-database.component';
import { EditEnvironmentComponent } from '../environment/components/edit-environment/edit-environment.component';
import { ViewDatabaseComponent } from './components/view-database/view-database.component';

const routes: Routes = [
  {
    path: '',
    component: ListDatabaseComponent,
  },
  {
    path: 'add',
    component: AddDatabaseComponent,
  },
  { path: 'edit/:id', component: EditEnvironmentComponent },
  { path: 'view/:id', component: ViewDatabaseComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DatabaseRoutingModule {}
