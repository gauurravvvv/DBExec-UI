import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddDatasourceComponent } from './components/add-datasource/add-datasource.component';
import { EditDatasourceComponent } from './components/edit-datasource/edit-datasource.component';
import { ListDatasourceComponent } from './components/list-datasource/list-datasource.component';
import { ViewDatasourceComponent } from './components/view-datasource/view-datasource.component';

const routes: Routes = [
  {
    path: '',
    component: ListDatasourceComponent,
  },
  {
    path: 'add',
    component: AddDatasourceComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  {
    path: 'edit/:orgId/:id',
    component: EditDatasourceComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewDatasourceComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DatasourceRoutingModule {}
