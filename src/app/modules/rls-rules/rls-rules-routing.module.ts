import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddRlsRuleComponent } from './components/add-rls-rule/add-rls-rule.component';
import { EditRlsRuleComponent } from './components/edit-rls-rule/edit-rls-rule.component';
import { ListRlsRuleComponent } from './components/list-rls-rule/list-rls-rule.component';
import { ViewRlsRuleComponent } from './components/view-rls-rule/view-rls-rule.component';

const routes: Routes = [
  { path: '', component: ListRlsRuleComponent },
  {
    path: 'add',
    component: AddRlsRuleComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewRlsRuleComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditRlsRuleComponent,
    canDeactivate: [UnsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RlsRulesRoutingModule {}
