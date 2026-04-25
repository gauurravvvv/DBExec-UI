import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { ChartRendererComponent } from './components/chart-renderer/chart-renderer.component';
import { FilterDialogComponent } from './components/filter-dialog/filter-dialog.component';
import { VisualConfigSidebarComponent } from './components/visual-config-sidebar/visual-config-sidebar.component';
import { VisualsChartSidebarComponent } from './components/visuals-chart-sidebar/visuals-chart-sidebar.component';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';
import { ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer } from './store';

@NgModule({
  declarations: [
    ChartRendererComponent,
    FilterDialogComponent,
    VisualConfigSidebarComponent,
    VisualsChartSidebarComponent,
    EditAnalysesComponent,
    ViewAnalysesComponent,
    ListAnalysesComponent,
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
    // NgRx Feature Store
    StoreModule.forFeature(ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer),
  ],
})
export class AnalysesModule {}
