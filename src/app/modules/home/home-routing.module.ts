import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { SuperAdminHomeComponent } from './super-admin-home/super-admin-home.component';
import { OrgHomeComponent } from './org-home/org-home.component';
import { RoleGuard } from 'src/app/core/guards/role.guard';

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
