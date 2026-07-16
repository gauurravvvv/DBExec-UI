import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { FolderTreeComponent } from 'src/app/shared/components/folder-tree/folder-tree.component';
import { AssetExplorerComponent } from 'src/app/shared/components/asset-explorer/asset-explorer.component';
import { FolderLocationFieldComponent } from 'src/app/shared/components/folder-location-field/folder-location-field.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatasetComponent } from './components/add-dataset/add-dataset.component';
import { DatasetParamsPanelComponent } from './components/dataset-params-panel/dataset-params-panel.component';
import { EditDatasetFieldsDialogComponent } from './components/edit-dataset-fields-dialog/edit-dataset-fields-dialog.component';
import { EditDatasetComponent } from './components/edit-dataset/edit-dataset.component';
import { ListDatasetComponent } from './components/list-dataset/list-dataset.component';
import { SaveDatasetDialogComponent } from './components/save-dataset-dialog/save-dataset-dialog.component';
import { ViewDatasetComponent } from './components/view-dataset/view-dataset.component';
import { DatasetRoutingModule } from './dataset-routing.module';
import { CellFormatPipe } from './pipes/cell-format.pipe';
import { addDatasetReducer, ADD_DATASET_FEATURE_KEY } from './store';

@NgModule({
  declarations: [
    AddDatasetComponent,
    EditDatasetComponent,
    ViewDatasetComponent,
    ListDatasetComponent,
    SaveDatasetDialogComponent,
    EditDatasetFieldsDialogComponent,
    CellFormatPipe,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatasetRoutingModule,
    SharedModule,
    MenuModule,
    // Standalone — the shared unified list table + its projected-empty
    // directive. `UsGridCellDirective` stays: the table reuses it verbatim
    // for per-cell templates.
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
    // Standalone shared folder-tree rail (Track F).
    FolderTreeComponent,
    // Folder-first explorer shell + save-location field (folder-explorer).
    AssetExplorerComponent,
    FolderLocationFieldComponent,
    // Canonical shared chip / status-pill / count / tag element.
    ChipComponent,
    // Standalone {{name}} query-parameters panel (embedded in add/edit).
    DatasetParamsPanelComponent,
    // NgRx Feature Store
    StoreModule.forFeature(ADD_DATASET_FEATURE_KEY, addDatasetReducer),
  ],
})
export class DatasetModule {}
