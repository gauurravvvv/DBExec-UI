import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ViewGroupComponent } from './components/view-group/view-group.component';
import { AddGroupComponent } from './components/add-group/add-group.component';
import { EditGroupComponent } from './components/edit-group/edit-group.component';
import { ListGroupComponent } from './components/list-group/list-group.component';
import { GroupRoutingModule } from './group-routing.module';

@NgModule({
  declarations: [
    AddGroupComponent,
    EditGroupComponent,
    ListGroupComponent,
    ViewGroupComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    GroupRoutingModule,
    SharedModule,
  ],
})
export class GroupModule {}
