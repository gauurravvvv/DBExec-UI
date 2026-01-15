import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { TooltipModule } from 'primeng/tooltip';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddPromptComponent } from './components/add-prompt/add-prompt.component';
import { ConfigPromptComponent } from './components/config-prompt/config-prompt.component';
import { CONFIG_PROMPT_FEATURE_KEY, configPromptReducer } from './store';
import { EditPromptComponent } from './components/edit-prompt/edit-prompt.component';
import { ListPromptComponent } from './components/list-prompt/list-prompt.component';
import { ViewPromptComponent } from './components/view-prompt/view-prompt.component';
import { PromptRoutingModule } from './prompt-routing.module';
import { SqlQueryDialogComponent } from './components/dialogs/sql-query-dialog/sql-query-dialog.component';
import { DropdownConfigDialogComponent } from './components/dialogs/dropdown-config-dialog/dropdown-config-dialog.component';
import { MultiselectConfigDialogComponent } from './components/dialogs/multiselect-config-dialog/multiselect-config-dialog.component';
import { CheckboxConfigDialogComponent } from './components/dialogs/checkbox-config-dialog/checkbox-config-dialog.component';
import { RadioConfigDialogComponent } from './components/dialogs/radio-config-dialog/radio-config-dialog.component';
import { TextConfigDialogComponent } from './components/dialogs/text-config-dialog/text-config-dialog.component';
import { NumberConfigDialogComponent } from './components/dialogs/number-config-dialog/number-config-dialog.component';
import { DateConfigDialogComponent } from './components/dialogs/date-config-dialog/date-config-dialog.component';
import { DateRangeConfigDialogComponent } from './components/dialogs/daterange-config-dialog/daterange-config-dialog.component';
import { CalendarConfigDialogComponent } from './components/dialogs/calendar-config-dialog/calendar-config-dialog.component';
import { RangeSliderConfigDialogComponent } from './components/dialogs/rangeslider-config-dialog/rangeslider-config-dialog.component';
import { SharedModule } from 'src/app/shared';

@NgModule({
  declarations: [
    AddPromptComponent,
    EditPromptComponent,
    ListPromptComponent,
    ViewPromptComponent,
    ConfigPromptComponent,
    SqlQueryDialogComponent,
    DropdownConfigDialogComponent,
    MultiselectConfigDialogComponent,
    CheckboxConfigDialogComponent,
    RadioConfigDialogComponent,
    TextConfigDialogComponent,
    NumberConfigDialogComponent,
    DateConfigDialogComponent,
    DateRangeConfigDialogComponent,
    CalendarConfigDialogComponent,
    RangeSliderConfigDialogComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    AppPrimeNGModule,
    SharedModule,
    PromptRoutingModule,
    TooltipModule,
    StoreModule.forFeature(CONFIG_PROMPT_FEATURE_KEY, configPromptReducer),
  ],
})
export class PromptModule {}
