import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddTabComponent } from './components/add-tab/add-tab.component';
import { EditTabComponent } from './components/edit-tab/edit-tab.component';
import { ListTabComponent } from './components/list-tab/list-tab.component';
import { ViewTabComponent } from './components/view-tab/view-tab.component';

const routes: Routes = [
  {
    path: '',
    component: ListTabComponent,
  },
  {
    path: 'add',
    component: AddTabComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewTabComponent },
  { path: 'edit/:orgId/:id', component: EditTabComponent, canDeactivate: [UnsavedChangesGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabRoutingModule {}
