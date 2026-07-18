import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { AnalysisParameterBarComponent } from './components/analysis-parameter-bar/analysis-parameter-bar.component';
import { AnalysisWidgetEditorComponent } from './components/analysis-widget-editor/analysis-widget-editor.component';
import { ChartRendererComponent } from './components/chart-renderer/chart-renderer.component';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { KpiCardComponent } from './components/kpi-card/kpi-card.component';
import { FilterDialogComponent } from './components/filter-dialog/filter-dialog.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { PublishDashboardDialogComponent } from './components/publish-dashboard-dialog/publish-dashboard-dialog.component';
import { TableVisualComponent } from './components/table-visual/table-visual.component';
import { TypedValueInputComponent } from './components/typed-value-input/typed-value-input.component';
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
    // Advanced-interaction surfaces (Slice 4): the analysis parameter
    // bar + the shared typed-value input that drives parameter (and,
    // later, filter/alert) value controls from a field's dataType.
    AnalysisParameterBarComponent,
    TypedValueInputComponent,
    // Track E3 — canvas widget (text / KPI) authoring dialog.
    AnalysisWidgetEditorComponent,
    // Slice B — KPI tile with big number + sparkline + delta badge.
    KpiCardComponent,
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
    // Wave 7 authoring UX: CDK drag-drop powers tab-strip reorder + canvas
    // visual reposition. Installed dep (@angular/cdk), no new package.
    DragDropModule,
    // Standalone — the shared unified list table + its projected-empty
    // directive. `UsGridCellDirective` stays: the table reuses it verbatim
    // for per-cell templates.
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
    // Canonical shared chip / status-pill / count / tag / filter element.
    ChipComponent,
    // Canonical shared button — used for the Slice F authoring actions
    // (duplicate visual/tab, export PNG/CSV, focus).
    ButtonComponent,
    // NgRx feature stores. Two slices — dataset cache + filter slice.
    StoreModule.forFeature(ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer),
    StoreModule.forFeature(ANALYSES_FILTER_FEATURE_KEY, analysesFilterReducer),
    EffectsModule.forFeature([AnalysesFilterEffects]),
  ],
})
export class AnalysesModule {}
