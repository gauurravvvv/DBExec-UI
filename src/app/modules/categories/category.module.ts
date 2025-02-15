import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddCategoryComponent } from './components/add-category/add-category.component';
import { EditCategoryComponent } from './components/edit-category/edit-category.component';
import { ListCategoryComponent } from './components/list-category/list-category.component';
import { ViewCategoryComponent } from './components/view-category/view-category.component';
import { CategoryRoutingModule } from './category-routing.module';

@NgModule({
  declarations: [
    AddCategoryComponent,
    EditCategoryComponent,
    ViewCategoryComponent,
    ListCategoryComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    CategoryRoutingModule,
    SharedModule,
  ],
})
export class CategoryModule {}
