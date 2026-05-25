import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddRlsRuleComponent } from './components/add-rls-rule/add-rls-rule.component';
import { EditRlsRuleComponent } from './components/edit-rls-rule/edit-rls-rule.component';
import { ListRlsRuleComponent } from './components/list-rls-rule/list-rls-rule.component';
import { ViewRlsRuleComponent } from './components/view-rls-rule/view-rls-rule.component';

const routes: Routes = [
  { path: '', component: ListRlsRuleComponent },
  {
    path: 'new',
    component: AddRlsRuleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: ':id', component: ViewRlsRuleComponent },
  {
    path: ':id/edit',
    component: EditRlsRuleComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RlsRulesRoutingModule {}
