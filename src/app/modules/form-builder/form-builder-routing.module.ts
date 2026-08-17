import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddFormComponent } from './components/add-form/add-form.component';
import { FbComposeComponent } from './components/fb-compose/fb-compose.component';
import { FbDesignComponent } from './components/fb-design/fb-design.component';
import { ListFormComponent } from './components/list-form/list-form.component';
import { ListFormTemplatesComponent } from './components/list-form-templates/list-form-templates.component';
import { ViewFormComponent } from './components/view-form/view-form.component';

const routes: Routes = [
  { path: '', component: ListFormComponent },
  {
    path: 'new',
    component: AddFormComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  // Template gallery — a literal prefix, BEFORE ':id' so it isn't swallowed.
  { path: 'templates', component: ListFormTemplatesComponent },
  // Runtime composer (business user) — before ':id' so it isn't swallowed
  // (Phase 7 fleshes it out).
  { path: ':id/compose', component: FbComposeComponent },
  // 3-pane designer (admin) — before ':id'.
  {
    path: ':id/design',
    component: FbDesignComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewFormComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FormBuilderRoutingModule {}
