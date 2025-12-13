import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddAnalysesComponent } from './add-analyses/add-analyses.component';
import { AnalysesRoutingModule } from './analyses-routing.module';
import { EditAnalysesComponent } from './edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './view-analyses/view-analyses.component';

@NgModule({
  declarations: [
    AddAnalysesComponent,
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
    MenuModule,
  ],
})
export class AnalysesModule {}
