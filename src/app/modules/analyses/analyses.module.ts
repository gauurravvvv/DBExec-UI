import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { AddAnalysesComponent } from './add-analyses/add-analyses.component';
import { EditAnalysesComponent } from './edit-analyses/edit-analyses.component';
import { ViewAnalysesComponent } from './view-analyses/view-analyses.component';
import { ListAnalysesComponent } from './list-analyses/list-analyses.component';

@NgModule({
  declarations: [
    AddAnalysesComponent,
    EditAnalysesComponent,
    ViewAnalysesComponent,
    ListAnalysesComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    AnalysesRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class AnalysesModule {}
