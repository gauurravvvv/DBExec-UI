import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { AddAnalysesComponent } from './components/add-analyses/add-analyses.component';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { SaveAnalysesDialogComponent } from './components/save-analyses-dialog/save-analyses-dialog.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';
import { ADD_ANALYSES_FEATURE_KEY, addAnalysesReducer } from './store';

@NgModule({
  declarations: [
    AddAnalysesComponent,
    EditAnalysesComponent,
    ViewAnalysesComponent,
    ListAnalysesComponent,
    SaveAnalysesDialogComponent,
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
