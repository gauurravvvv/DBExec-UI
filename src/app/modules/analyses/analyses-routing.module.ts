import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';

// REST-shaped routes:
//   ''                 -> list
//   ':orgId/:id'       -> detail (view)
//   ':orgId/:id/edit'  -> edit
const routes: Routes = [
  { path: '', component: ListAnalysesComponent },
  { path: ':orgId/:id', component: ViewAnalysesComponent },
  {
    path: ':orgId/:id/edit',
    component: EditAnalysesComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalysesRoutingModule {}
