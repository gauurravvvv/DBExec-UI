import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AppSettingsRoutingModule } from './app-settings-routing.module';
import { ListAnnouncementsComponent } from './components/list-announcements/list-announcements.component';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';

@NgModule({
  declarations: [
    ListAnnouncementsComponent,
    AddAnnouncementComponent,
    EditAnnouncementComponent,
    ViewAnnouncementComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SharedModule,
    AppSettingsRoutingModule,
  ],
})
export class AppSettingsModule {}
