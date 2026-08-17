import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from 'src/app/shared/shared.module';
import { DashboardWidgetsModule } from 'src/app/shared/components/dashboard/dashboard-widgets.module';
import { EmptyRootComponent } from './components/empty-root/empty-root.component';
import { OrgHomeComponent } from './components/org-home/org-home.component';
import { SystemAdminHomeComponent } from './components/system-admin-home/system-admin-home.component';
import { HomeRoutingModule } from './home-routing.module';

@NgModule({
  declarations: [
    EmptyRootComponent,
    SystemAdminHomeComponent,
    OrgHomeComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HomeRoutingModule,
    SharedModule,
    DashboardWidgetsModule,
  ],
})
export class HomeModule {}
