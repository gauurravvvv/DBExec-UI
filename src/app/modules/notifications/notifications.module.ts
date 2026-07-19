import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListNotificationsComponent } from './components/list-notifications/list-notifications.component';
import { NotificationsRoutingModule } from './notifications-routing.module';

@NgModule({
  declarations: [ListNotificationsComponent],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    SharedModule,
    // Standalone canonical button (SharedModule imports but does not
    // re-export it, so pull it in directly).
    ButtonComponent,
    NotificationsRoutingModule,
  ],
})
export class NotificationsModule {}
