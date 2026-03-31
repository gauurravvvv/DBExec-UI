import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HomeRoutingModule } from './home-routing.module';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { SuperAdminHomeComponent } from './super-admin-home/super-admin-home.component';
import { OrgHomeComponent } from './org-home/org-home.component';

@NgModule({
  declarations: [EmptyRootComponent, SuperAdminHomeComponent, OrgHomeComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HomeRoutingModule],
})
export class HomeModule {}
