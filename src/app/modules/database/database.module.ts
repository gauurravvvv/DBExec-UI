import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatabaseComponent } from './components/add-database/add-database.component';
import { EditDatabaseComponent } from './components/edit-database/edit-database.component';
import { ListDatabaseComponent } from './components/list-database/list-database.component';
import { ViewDatabaseComponent } from './components/view-database/view-database.component';
import { DatabaseRoutingModule } from './database-routing.module';

@NgModule({
  declarations: [
    AddDatabaseComponent,
    EditDatabaseComponent,
    ListDatabaseComponent,
    ViewDatabaseComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatabaseRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class DatabaseModule {}
