import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GrantAccessComponent } from './components/grant-access/grant-access.component';

const routes: Routes = [
  {
    path: '',
    component: GrantAccessComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccessRoutingModule {}
