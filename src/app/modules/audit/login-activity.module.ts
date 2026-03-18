import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListLoginActivityComponent } from './components/list-login-activity/list-login-activity.component';

const routes: Routes = [
  { path: '', component: ListLoginActivityComponent },
];

@NgModule({
  declarations: [ListLoginActivityComponent],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    SharedModule,
    RouterModule.forChild(routes),
  ],
})
export class LoginActivityModule {}
