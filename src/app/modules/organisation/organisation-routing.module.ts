import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddOrganisationComponent } from './components/add-organisation/add-organisation.component';
import { EditOrganisationComponent } from './components/edit-organisation/edit-organisation.component';
import { ListOrganisationComponent } from './components/list-organisation/list-organisation.component';
import { ViewOrganisationComponent } from './components/view-organisation/view-organisation.component';

const routes: Routes = [
  {
    path: '',
    component: ListOrganisationComponent,
  },
  {
    path: 'add',
    component: AddOrganisationComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:id', component: ViewOrganisationComponent },
  {
    path: 'edit/:id',
    component: EditOrganisationComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganisationRoutingModule {}
