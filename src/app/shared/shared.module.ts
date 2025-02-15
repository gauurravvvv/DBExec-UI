import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from './modules/app-primeng.module';
import { ChangePasswordDialogComponent } from './components/change-password-dialog/change-password-dialog.component';

@NgModule({
  declarations: [ChangePasswordDialogComponent],
  imports: [CommonModule, ReactiveFormsModule, AppPrimeNGModule],
  exports: [ChangePasswordDialogComponent],
})
export class SharedModule {}
