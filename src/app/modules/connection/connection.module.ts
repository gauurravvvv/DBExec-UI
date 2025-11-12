import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddConnectionComponent } from './components/add-connection/add-connection.component';
import { ListConnectionComponent } from './components/list-connection/list-connection.component';
import { EditConnectionComponent } from './components/edit-connection/edit-connection.component';
import { ViewConnectionComponent } from './components/view-connection/view-connection.component';
import { ConnectionsRoutingModule } from './connection-routing.module';

@NgModule({
  declarations: [
    AddConnectionComponent,
    ListConnectionComponent,
    EditConnectionComponent,
    ViewConnectionComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    ConnectionsRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class ConnectionsModule {}
