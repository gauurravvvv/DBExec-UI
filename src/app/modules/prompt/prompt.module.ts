import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddPromptComponent } from './components/add-prompt/add-prompt.component';
import { EditPromptComponent } from './components/edit-prompt/edit-prompt.component';
import { ListPromptComponent } from './components/list-prompt/list-prompt.component';
import { ViewPromptComponent } from './components/view-prompt/view-prompt.component';
import { PromptRoutingModule } from './prompt-routing.module';
import { ConfigPromptComponent } from './components/config-prompt/config-prompt.component';

@NgModule({
  declarations: [
    AddPromptComponent,
    EditPromptComponent,
    ListPromptComponent,
    ViewPromptComponent,
    ConfigPromptComponent,
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
    PromptRoutingModule,
  ],
})
export class PromptModule {}
