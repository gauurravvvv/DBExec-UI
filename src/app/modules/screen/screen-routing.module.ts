import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddScreenComponent } from './components/add-screen/add-screen.component';
import { EditScreenComponent } from './components/edit-screen/edit-screen.component';
import { ListScreenComponent } from './components/list-screen/list-screen.component';
import { ViewScreenComponent } from './components/view-screen/view-screen.component';
import { ConfigureScreenComponent } from './components/configure-screen/configure-screen.component';
import { ExecuteScreenComponent } from './components/execute-screen/execute-screen.component';

const routes: Routes = [
  {
    path: '',
    component: ListScreenComponent,
  },
  {
    path: 'add',
    component: AddScreenComponent,
  },
  { path: 'view/:orgId/:id', component: ViewScreenComponent },
  { path: 'edit/:orgId/:id', component: EditScreenComponent },
  { path: 'config/:orgId/:dbId/:id', component: ConfigureScreenComponent },
  { path: 'execute/:orgId/:dbId/:screenId', component: ExecuteScreenComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ScreenRoutingModule {}
