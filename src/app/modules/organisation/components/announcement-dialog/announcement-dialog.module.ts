import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AnnouncementDialogComponent } from './announcement-dialog.component';

@NgModule({
  declarations: [AnnouncementDialogComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SharedModule,
  ],
  exports: [AnnouncementDialogComponent],
})
export class AnnouncementDialogModule {}
