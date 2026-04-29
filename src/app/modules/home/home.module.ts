import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EmptyRootComponent } from './components/empty-root/empty-root.component';
import { HomeRoutingModule } from './home-routing.module';
import { OrgHomeComponent } from './components/org-home/org-home.component';
import { SystemAdminHomeComponent } from './components/system-admin-home/system-admin-home.component';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  declarations: [EmptyRootComponent, SystemAdminHomeComponent, OrgHomeComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HomeRoutingModule, SharedModule],
})
export class HomeModule {}
