import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';

const routes: Routes = [
  {
    path: '',
    component: ListDatasetComponent,
  },
  {
    path: 'add',
    component: AddDatasetComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  {
    path: 'edit/:orgId/:id',
    component: EditDatasetComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewDatasetComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DatasetRoutingModule {}
