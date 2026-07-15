import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmbedDashboardComponent } from './embed-dashboard.component';

/**
 * EmbedDashboardModule — hosts the PUBLIC dashboard embed route. Loaded
 * lazily OUTSIDE the /app shell (see app-routing: path 'embed/dashboard/
 * :token') so an embedded/opened link renders full-screen with NO
 * sidebar/topbar and NO auth requirement. The component is standalone and
 * imports only what it needs to render a read-only dashboard snapshot.
 */
const routes: Routes = [{ path: '', component: EmbedDashboardComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), EmbedDashboardComponent],
})
export class EmbedDashboardModule {}
