import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';

const routes: Routes = [
  {
    path: '',
    component: ListAnalysesComponent,
  },
  {
    path: 'edit/:orgId/:id',
    component: EditAnalysesComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewAnalysesComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalysesRoutingModule {}
