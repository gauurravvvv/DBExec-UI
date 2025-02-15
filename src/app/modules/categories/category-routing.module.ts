import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListCategoryComponent } from './components/list-category/list-category.component';
import { AddCategoryComponent } from './components/add-category/add-category.component';
import { EditCategoryComponent } from './components/edit-category/edit-category.component';
import { ViewCategoryComponent } from './components/view-category/view-category.component';

const routes: Routes = [
  {
    path: '',
    component: ListCategoryComponent,
  },
  {
    path: 'add',
    component: AddCategoryComponent,
  },
  { path: 'view/:id', component: ViewCategoryComponent },
  { path: 'edit/:id', component: EditCategoryComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CategoryRoutingModule {}
