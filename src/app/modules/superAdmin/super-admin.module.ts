import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { ListSuperAdminComponent } from './components/list-super-admin/list-super-admin.component';

@NgModule({
  declarations: [ListSuperAdminComponent],
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    RippleModule,
    TagModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    InputTextModule,
  ],
})
export class SuperAdminModule {}
