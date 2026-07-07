import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
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
const routes: Routes = [
  { path: '', component: LauncherComponent },
  { path: 'connections', component: ListConnectionsComponent },
  {
    path: 'connections/new',
    component: AddConnectionComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'connections/:id/edit',
    component: AddConnectionComponent,
    canDeactivate: [unsavedChangesGuard],
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
    RouterModule.forChild(routes),
  ],
})
export class QueryRunnerModule {}
