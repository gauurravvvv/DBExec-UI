import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListCredentialsComponent } from './components/list-credentials/list-credentials.component';
import { AddCredentialsComponent } from './components/add-credentials/add-credentials.component';
import { EditCredentialsComponent } from './components/edit-credentials/edit-credentials.component';
import { ViewCredentialsComponent } from './components/view-credentials/view-credentials.component';

const routes: Routes = [
  {
    path: '',
    component: ListCredentialsComponent,
  },
  {
    path: 'add',
    component: AddCredentialsComponent,
  },
  { path: 'edit/:orgId/:id', component: EditCredentialsComponent },
  { path: 'view/:orgId/:id', component: ViewCredentialsComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CredentialsRoutingModule {}
