import { ClipboardModule } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    AppPrimeNGModule,
    FormsModule,
    ReactiveFormsModule,
    ClipboardModule,
  ],
  exports: [
    AppPrimeNGModule,
    FormsModule,
    ReactiveFormsModule,
    ClipboardModule,
  ],
})
export class AppSharedModule {}
