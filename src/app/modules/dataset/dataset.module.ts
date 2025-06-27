import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';
import { DatasetRoutingModule } from './dataset-routing.module';

@NgModule({
  declarations: [
    AddDatasetComponent,
    EditDatasetComponent,
    ViewDatasetComponent,
    ListDatasetComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatasetRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class DatasetModule {}
