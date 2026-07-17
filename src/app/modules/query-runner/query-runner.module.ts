import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { roleGuard } from 'src/app/core/guards/role.guard';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AddConnectionComponent } from './connections/add-connection/add-connection.component';
import { ListConnectionsComponent } from './connections/list-connections/list-connections.component';
import { LauncherComponent } from './launcher/launcher.component';
import { ListSavedQueriesComponent } from './saved-queries/list-saved-queries/list-saved-queries.component';
import { NewQueryDialogComponent } from './saved-queries/new-query-dialog/new-query-dialog.component';
import { AddSavedQueryComponent } from './saved-queries/add-saved-query/add-saved-query.component';
import { EditSavedQueryComponent } from './saved-queries/edit-saved-query/edit-saved-query.component';
import { ViewSavedQueryComponent } from './saved-queries/view-saved-query/view-saved-query.component';

/**
 * QueryRunnerModule — the in-shell part of Query Runner. The module root
 * now lands on the SAVED QUERIES list (the new Query Executor home; the
 * old launcher page is retired as the landing — its datasource→connection
 * logic lives in the New-Query popup). Below the root: saved-query CRUD
 * and the private connection profiles CRUD under /connections. The
 * standalone executor lives in its own lazy module (query-executor.module)
 * mounted OUTSIDE the app shell.
 */
// Each route guards on ITS OWN permission: the saved-queries screens need
// queryRunner, the connection screens need connectionManager. A user
// granted only one of the two still reaches the screens they can use.
const routes: Routes = [
  {
    path: '',
    component: ListSavedQueriesComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.QUERY_RUNNER },
  },
  {
    path: 'saved-queries/new',
    component: AddSavedQueryComponent,
    canActivate: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: PERMISSIONS.QUERY_RUNNER },
  },
  {
    path: 'saved-queries/:id',
    component: ViewSavedQueryComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.QUERY_RUNNER },
  },
  {
    path: 'saved-queries/:id/edit',
    component: EditSavedQueryComponent,
    canActivate: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: PERMISSIONS.QUERY_RUNNER },
  },
  {
    path: 'connections',
    component: ListConnectionsComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.CONNECTION_MANAGER },
  },
  {
    path: 'connections/new',
    component: AddConnectionComponent,
    canActivate: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: PERMISSIONS.CONNECTION_MANAGER },
  },
  {
    path: 'connections/:id/edit',
    component: AddConnectionComponent,
    canActivate: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: PERMISSIONS.CONNECTION_MANAGER },
  },
];

@NgModule({
  declarations: [
    LauncherComponent,
    ListConnectionsComponent,
    AddConnectionComponent,
    ListSavedQueriesComponent,
    NewQueryDialogComponent,
    AddSavedQueryComponent,
    EditSavedQueryComponent,
    ViewSavedQueryComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    AppPrimeNGModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
    RouterModule.forChild(routes),
  ],
})
export class QueryRunnerModule {}
