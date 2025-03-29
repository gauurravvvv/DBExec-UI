import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListPromptComponent } from './components/list-prompt/list-prompt.component';
import { AddPromptComponent } from './components/add-prompt/add-prompt.component';
import { ViewPromptComponent } from './components/view-prompt/view-prompt.component';
import { EditPromptComponent } from './components/edit-prompt/edit-prompt.component';

const routes: Routes = [
  {
    path: '',
    component: ListPromptComponent,
  },
  {
    path: 'add',
    component: AddPromptComponent,
  },
  { path: 'view/:orgId/:id', component: ViewPromptComponent },
  { path: 'edit/:orgId/:id', component: EditPromptComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PromptRoutingModule {}
