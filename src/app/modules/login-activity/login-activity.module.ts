import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListLoginActivityComponent } from './components/list-login-activity/list-login-activity.component';

const routes: Routes = [{ path: '', component: ListLoginActivityComponent }];

@NgModule({
  declarations: [ListLoginActivityComponent],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    SharedModule,
    RouterModule.forChild(routes),
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class LoginActivityModule {}
