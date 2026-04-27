import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddPromptComponent } from './components/add-prompt/add-prompt.component';
import { ConfigPromptComponent } from './components/config-prompt/config-prompt.component';
import { EditPromptComponent } from './components/edit-prompt/edit-prompt.component';
import { ListPromptComponent } from './components/list-prompt/list-prompt.component';
import { ViewPromptComponent } from './components/view-prompt/view-prompt.component';

const routes: Routes = [
  {
    path: '',
    component: ListPromptComponent,
  },
  {
    path: 'add',
    component: AddPromptComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewPromptComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditPromptComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'config/:orgId/:id', component: ConfigPromptComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PromptRoutingModule {}
