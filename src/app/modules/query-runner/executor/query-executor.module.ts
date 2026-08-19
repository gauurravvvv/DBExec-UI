import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QueryExecutorComponent } from './query-executor.component';

/**
 * QueryExecutorModule — hosts the standalone executor route. Loaded
 * lazily OUTSIDE the app shell (see app-routing: path 'sql/exec')
 * so a browser tab opens as a focused, full-screen SQL workspace with no
 * sidebar/topbar. The component itself is standalone and imports its own
 * heavy deps (CodeMirror, AG Grid), so nothing leaks into the main bundle.
 */
const routes: Routes = [{ path: '', component: QueryExecutorComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), QueryExecutorComponent],
})
export class QueryExecutorModule {}
