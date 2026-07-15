import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddAlertComponent } from './components/add-alert/add-alert.component';
import { EditAlertComponent } from './components/edit-alert/edit-alert.component';
import { ListAlertComponent } from './components/list-alert/list-alert.component';
import { ViewAlertComponent } from './components/view-alert/view-alert.component';

const routes: Routes = [
  { path: '', component: ListAlertComponent },
  {
    path: 'new',
    component: AddAlertComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewAlertComponent },
  {
    path: ':id/edit',
    component: EditAlertComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AlertsRoutingModule {}
