import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { EditAnalysesComponent } from './components/edit-analyses/edit-analyses.component';
import { ListAnalysesComponent } from './components/list-analyses/list-analyses.component';
import { ViewAnalysesComponent } from './components/view-analyses/view-analyses.component';

// REST-shaped routes:
//   ''           -> list
//   ':id'        -> detail (view)
//   ':id/edit'   -> edit
const routes: Routes = [
  { path: '', component: ListAnalysesComponent },
  { path: ':id', component: ViewAnalysesComponent },
  {
    path: ':id/edit',
    component: EditAnalysesComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnalysesRoutingModule {}
