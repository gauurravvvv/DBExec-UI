import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
    path: 'system-admin',
    component: SystemAdminHomeComponent,
    canActivate: [roleGuard],
    data: { roles: ['SYSTEM-ADMIN'] },
  },
  {
    path: 'org',
    component: OrgHomeComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomeRoutingModule {}
