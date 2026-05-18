import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddDatasourceComponent } from './components/add-datasource/add-datasource.component';
import { EditDatasourceComponent } from './components/edit-datasource/edit-datasource.component';
import { ListDatasourceComponent } from './components/list-datasource/list-datasource.component';
import { ViewDatasourceComponent } from './components/view-datasource/view-datasource.component';

// REST-shaped routes. Static segments (`new`) come BEFORE
// `:orgId/:id` so the router doesn't capture the word "new" as an
// orgId param.
const routes: Routes = [
  { path: '', component: ListDatasourceComponent },
  {
    path: 'new',
    component: AddDatasourceComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':orgId/:id', component: ViewDatasourceComponent },
  {
    path: ':orgId/:id/edit',
    component: EditDatasourceComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DatasourceRoutingModule {}
