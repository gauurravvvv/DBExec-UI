import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';

const routes: Routes = [
  {
    path: '',
    component: ListDatasetComponent,
  },
  {
    path: 'add',
    component: AddDatasetComponent,
  },
  { path: 'edit/:orgId/:id', component: EditDatasetComponent },
  { path: 'view/:orgId/:id', component: ViewDatasetComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DatasetRoutingModule {}
