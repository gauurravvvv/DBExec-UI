import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { roleGuard } from 'src/app/core/guards/role.guard';
import { EmptyRootComponent } from './components/empty-root/empty-root.component';
import { OrgHomeComponent } from './components/org-home/org-home.component';
import { SystemAdminHomeComponent } from './components/system-admin-home/system-admin-home.component';

const routes: Routes = [
  {
    path: '',
    component: EmptyRootComponent,
  },
  {
    // Platform System Admin's home — guarded on the systemAdmin
    // permission (only that role carries it).
    path: 'system-admin',
    component: SystemAdminHomeComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.SYSTEM_ADMIN },
  },
  {
    // Org user's home — `home` is the GLOBAL mandatory permission,
    // granted to every authenticated user. No additional guard needed.
    path: 'org',
    component: OrgHomeComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomeRoutingModule {}
