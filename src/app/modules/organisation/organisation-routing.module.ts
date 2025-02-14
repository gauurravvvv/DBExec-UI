import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
  },
  { path: 'view/:id', component: ViewOrganisationComponent },
  { path: 'edit/:id', component: EditOrganisationComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganisationRoutingModule {}
