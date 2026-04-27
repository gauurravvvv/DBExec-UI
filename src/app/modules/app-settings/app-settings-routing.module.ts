import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UnsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { ListAnnouncementsComponent } from './components/list-announcements/list-announcements.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';

const routes: Routes = [
  { path: '', redirectTo: 'announcements', pathMatch: 'full' },
  {
    path: 'announcements',
    component: ListAnnouncementsComponent,
    data: { title: 'Announcements' },
  },
  {
    path: 'announcements/add',
    component: AddAnnouncementComponent,
    canDeactivate: [UnsavedChangesGuard],
    data: { title: 'Add Announcement' },
  },
  {
    path: 'announcements/view/:orgId/:id',
    component: ViewAnnouncementComponent,
    data: { title: 'Announcement Details' },
  },
  {
    path: 'announcements/edit/:orgId/:id',
    component: EditAnnouncementComponent,
    canDeactivate: [UnsavedChangesGuard],
    data: { title: 'Edit Announcement' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppSettingsRoutingModule {}
