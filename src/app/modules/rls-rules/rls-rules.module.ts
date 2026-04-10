import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { RlsRulesRoutingModule } from './rls-rules-routing.module';
import { ListRlsRulesComponent } from './components/list-rls-rules/list-rls-rules.component';
import { AddRlsRuleComponent } from './components/add-rls-rule/add-rls-rule.component';
import { EditRlsRuleComponent } from './components/edit-rls-rule/edit-rls-rule.component';
import { ViewRlsRuleComponent } from './components/view-rls-rule/view-rls-rule.component';
import { ManageRlsAssignmentsComponent } from './components/manage-rls-assignments/manage-rls-assignments.component';

@NgModule({
  declarations: [
    ListRlsRulesComponent,
    AddRlsRuleComponent,
    EditRlsRuleComponent,
    ViewRlsRuleComponent,
    ManageRlsAssignmentsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    RlsRulesRoutingModule,
    SharedModule,
  ],
})
export class RlsRulesModule {}
