import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
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
    path: 'new',
    component: AddOrganisationComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewOrganisationComponent },
  {
    path: ':id/edit',
    component: EditOrganisationComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganisationRoutingModule {}
