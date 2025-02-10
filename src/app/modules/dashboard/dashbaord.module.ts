import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard/super-admin-dashboard.component';

@NgModule({
  declarations: [EmptyRootComponent, SuperAdminDashboardComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DashboardRoutingModule,
  ],
})
export class DashboardModule {}
