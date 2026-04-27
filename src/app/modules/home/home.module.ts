import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EmptyRootComponent } from './empty-root/empty-root.component';
import { HomeRoutingModule } from './home-routing.module';
import { OrgHomeComponent } from './org-home/org-home.component';
import { SuperAdminHomeComponent } from './super-admin-home/super-admin-home.component';

@NgModule({
  declarations: [EmptyRootComponent, SuperAdminHomeComponent, OrgHomeComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HomeRoutingModule],
})
export class HomeModule {}
