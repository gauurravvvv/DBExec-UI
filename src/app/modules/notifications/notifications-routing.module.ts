import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListNotificationsComponent } from './components/list-notifications/list-notifications.component';

const routes: Routes = [
  {
    path: '',
    component: ListNotificationsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NotificationsRoutingModule {}
