import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';
import { DatasetRoutingModule } from './dataset-routing.module';
import { SaveDatasetDialogComponent } from './components/save-dataset-dialog/save-dataset-dialog.component';
import { EditDatasetFieldsDialogComponent } from './components/edit-dataset-fields-dialog/edit-dataset-fields-dialog.component';
import { AddCustomFieldDialogComponent } from './components/add-custom-field-dialog/add-custom-field-dialog.component';

@NgModule({
  declarations: [
    AddDatasetComponent,
    EditDatasetComponent,
    ViewDatasetComponent,
    ListDatasetComponent,
    SaveDatasetDialogComponent,
    EditDatasetFieldsDialogComponent,
    AddCustomFieldDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatasetRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class DatasetModule {}
