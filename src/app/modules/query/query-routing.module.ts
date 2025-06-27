import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RunQueryComponent } from './components/run-query/run-query.component';

const routes: Routes = [
  {
    path: '',
    component: RunQueryComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class QueryRoutingModule {}
