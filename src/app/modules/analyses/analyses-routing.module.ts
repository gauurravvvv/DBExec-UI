import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddAnalysesComponent } from './add-analyses/add-analyses.component';
import { EditAnalysesComponent } from './edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './view-analyses/view-analyses.component';

const routes: Routes = [
  {
    path: '',
    component: ListAnalysesComponent,
  },
  {
    path: 'add',
    component: AddAnalysesComponent,
  },
  { path: 'edit/:orgId/:id', component: EditAnalysesComponent },
  { path: 'view/:orgId/:id', component: ViewAnalysesComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalysesRoutingModule {}
