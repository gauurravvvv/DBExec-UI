import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { ConfigureQueryBuilderComponent } from './components/configure-query-builder/configure-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ExecuteQueryBuilderComponent } from './components/execute-query-builder/execute-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';

const routes: Routes = [
  {
    path: '',
    component: ListQueryBuilderComponent,
  },
  {
    path: 'add',
    component: AddQueryBuilderComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewQueryBuilderComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditQueryBuilderComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'config/:orgId/:dbId/:id',
    component: ConfigureQueryBuilderComponent,
  },
  {
    path: 'execute/:orgId/:dbId/:queryBuilderId',
    component: ExecuteQueryBuilderComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QueryBuilderRoutingModule {}
