import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListDashboardComponent } from './components/list-dashboard/list-dashboard.component';
import { ViewDashboardComponent } from './components/view-dashboard/view-dashboard.component';

const routes: Routes = [
  { path: '', component: ListDashboardComponent },
  { path: 'view/:orgId/:id', component: ViewDashboardComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
