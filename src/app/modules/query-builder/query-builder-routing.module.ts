import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { ConfigureQueryBuilderComponent } from './components/configure-query-builder/configure-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ExecuteQueryBuilderComponent } from './components/execute-query-builder/execute-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { RunQueryBuilderComponent } from './components/run-query-builder/run-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';

const routes: Routes = [
  {
    path: '',
    component: ListQueryBuilderComponent,
  },
  {
    path: 'new',
    component: AddQueryBuilderComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    // Query Builder v2 — the business-user composer (tree filters + run).
    // Placed before ':id' so it is not swallowed by the view route.
    path: ':id/compose',
    component: RunQueryBuilderComponent,
  },
  { path: ':id', component: ViewQueryBuilderComponent },
  {
    path: ':id/edit',
    component: EditQueryBuilderComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  // Action sub-routes nested under the resource — RESTful action shape.
  // Carrying :dbId in the URL is intentional: the QB is scoped to a
  // specific database, and the page needs both.
  {
    path: ':dbId/:id/configure',
    component: ConfigureQueryBuilderComponent,
  },
  {
    path: ':dbId/:queryBuilderId/run',
    component: ExecuteQueryBuilderComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QueryBuilderRoutingModule {}
