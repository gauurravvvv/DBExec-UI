import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { EditDatasetFieldsDialogComponent } from './components/edit-dataset-fields-dialog/edit-dataset-fields-dialog.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { SaveDatasetDialogComponent } from './components/save-dataset-dialog/save-dataset-dialog.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';
import { DatasetRoutingModule } from './dataset-routing.module';
import { addDatasetReducer, ADD_DATASET_FEATURE_KEY } from './store';

@NgModule({
  declarations: [
    AddDatasetComponent,
    EditDatasetComponent,
    ViewDatasetComponent,
    ListDatasetComponent,
    SaveDatasetDialogComponent,
    EditDatasetFieldsDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatasetRoutingModule,
    SharedModule,
    MenuModule,
    // NgRx Feature Store
    StoreModule.forFeature(ADD_DATASET_FEATURE_KEY, addDatasetReducer),
  ],
})
export class DatasetModule {}
