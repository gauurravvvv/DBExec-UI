import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { OrgHomeComponent } from './org-home/org-home.component';
import { SuperAdminHomeComponent } from './super-admin-home/super-admin-home.component';

const routes: Routes = [
  {
    path: '',
    component: EmptyRootComponent,
  },
  {
    path: 'super-admin',
    component: SuperAdminHomeComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER-ADMIN'] },
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
