import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';

const routes: Routes = [
  {
    path: '',
    component: ListAnalysesComponent,
  },
  { path: 'edit/:orgId/:id', component: EditAnalysesComponent },
  { path: 'view/:orgId/:id', component: ViewAnalysesComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalysesRoutingModule {}
