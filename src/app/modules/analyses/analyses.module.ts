import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { ChartConfigSidebarComponent } from './components/chart-config-sidebar/chart-config-sidebar.component';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';
import { AnalysisFilterBarComponent } from './components/analysis-filter-bar/analysis-filter-bar.component';
import { FieldsPanelComponent } from './components/fields-panel/fields-panel.component';
import { FilterConfigDialogComponent } from './components/filter-config-dialog/filter-config-dialog.component';
import { ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer } from './store';

@NgModule({
  declarations: [
    ChartConfigSidebarComponent,
    EditAnalysesComponent,
    ViewAnalysesComponent,
    ListAnalysesComponent,
    AnalysisFilterBarComponent,
    FieldsPanelComponent,
    FilterConfigDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    AnalysesRoutingModule,
    SharedModule,
    MenuModule,
    // NgRx Feature Store
    StoreModule.forFeature(ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer),
  ],
})
export class AnalysesModule {}
