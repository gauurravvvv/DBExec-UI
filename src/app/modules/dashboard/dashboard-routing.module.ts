import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard/super-admin-dashboard.component';

const routes: Routes = [
  {
    path: '',
    component: EmptyRootComponent,
  },
  {
    path: 'super-admin',
    component: SuperAdminDashboardComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
