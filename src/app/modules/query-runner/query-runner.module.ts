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

/**
 * QueryRunnerModule — the in-shell part of Query Runner: the launcher
 * (datasource → connection → open) at the module root and the private
 * connection profiles CRUD under /connections. The standalone executor
 * lives in its own lazy module (query-executor.module) mounted OUTSIDE
 * the app shell, so a browser tab opens as a focused full-screen tool.
 */
// Each route guards on ITS OWN permission: the launcher needs
// queryRunner, the connection screens need connectionManager. A user
// granted only one of the two still reaches the screens they can use.
const routes: Routes = [
  {
    path: '',
    component: LauncherComponent,
    canActivate: [roleGuard],
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
