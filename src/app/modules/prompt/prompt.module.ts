import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { StoreModule } from '@ngrx/store';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { SharedModule } from 'src/app/shared';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddPromptComponent } from './components/add-prompt/add-prompt.component';
import { ConfigPromptComponent } from './components/config-prompt/config-prompt.component';
import { EditPromptComponent } from './components/edit-prompt/edit-prompt.component';
import { ListPromptComponent } from './components/list-prompt/list-prompt.component';
import { PromptAppearanceFormComponent } from './components/prompt-appearance-form/prompt-appearance-form.component';
import { PromptValueSourceComponent } from './components/prompt-value-source/prompt-value-source.component';
import { SqlQueryDialogComponent } from './components/sql-query-dialog/sql-query-dialog.component';
import { ViewPromptComponent } from './components/view-prompt/view-prompt.component';
import { PromptRoutingModule } from './prompt-routing.module';
import { configPromptReducer, CONFIG_PROMPT_FEATURE_KEY } from './store';

@NgModule({
  declarations: [
    AddPromptComponent,
    EditPromptComponent,
    ListPromptComponent,
    ViewPromptComponent,
    ConfigPromptComponent,
    SqlQueryDialogComponent,
    // Prompt-level config editors (appearance + operators, value source) —
    // relocated from the query-builder module; this is now the single home
    // for all prompt configuration.
    PromptAppearanceFormComponent,
    PromptValueSourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
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
    AccordionModule,
    InputNumberModule,
    InputSwitchModule,
    SkeletonModule,
    // Standalone shared components (SharedModule does not re-export them).
    ButtonComponent,
    ChipComponent,
    StoreModule.forFeature(CONFIG_PROMPT_FEATURE_KEY, configPromptReducer),
  ],
})
export class PromptModule {}
