import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { ChartRendererComponent } from './components/chart-renderer/chart-renderer.component';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { FilterDialogComponent } from './components/filter-dialog/filter-dialog.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { PublishDashboardDialogComponent } from './components/publish-dashboard-dialog/publish-dashboard-dialog.component';
import { TableVisualComponent } from './components/table-visual/table-visual.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';
import { VisualConfigSidebarComponent } from './components/visual-config-sidebar/visual-config-sidebar.component';
import { VisualsChartSidebarComponent } from './components/visuals-chart-sidebar/visuals-chart-sidebar.component';
import {
  addAnalysesReducer,
  ADD_ANALYSES_FEATURE_KEY,
  AnalysesFilterEffects,
  analysesFilterReducer,
  ANALYSES_FILTER_FEATURE_KEY,
} from './store';

@NgModule({
  declarations: [
    ChartRendererComponent,
    FilterDialogComponent,
    TableVisualComponent,
    VisualConfigSidebarComponent,
    VisualsChartSidebarComponent,
    EditAnalysesComponent,
    ViewAnalysesComponent,
    ListAnalysesComponent,
    PublishDashboardDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    AnalysesRoutingModule,
    SharedModule,
    SharedChartsModule,
    MenuModule,
    // Standalone — the shared unified list table + its projected-empty
    // directive. `UsGridCellDirective` stays: the table reuses it verbatim
    // for per-cell templates.
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
    // NgRx feature stores. Two slices — dataset cache + filter slice.
    StoreModule.forFeature(ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer),
    StoreModule.forFeature(ANALYSES_FILTER_FEATURE_KEY, analysesFilterReducer),
    EffectsModule.forFeature([AnalysesFilterEffects]),
  ],
})
export class AnalysesModule {}
