import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard/super-admin-dashboard.component';
import { OrgDashboardComponent } from './org-dashboard/org-dashboard.component';
import { RoleGuard } from 'src/app/core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: EmptyRootComponent,
  },
  {
    path: 'super-admin',
    component: SuperAdminDashboardComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER-ADMIN'] },
  },
  {
    path: 'org-admin',
    component: OrgDashboardComponent,
    canActivate: [RoleGuard],
    data: { roles: ['ORG-ADMIN'] },
  },
  {
    path: 'org-user',
    component: OrgDashboardComponent,
    canActivate: [RoleGuard],
    data: { roles: ['ORG-USER'] },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
