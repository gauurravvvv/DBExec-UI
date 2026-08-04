import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { QbDesignComponent } from './components/qb-design/qb-design.component';
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
  {
    // Query Builder v2 — admin design shell (form / joins / columns / settings).
    path: ':id/design',
    component: QbDesignComponent,
  },
  { path: ':id', component: ViewQueryBuilderComponent },
  {
    path: ':id/edit',
    component: EditQueryBuilderComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QueryBuilderRoutingModule {}
