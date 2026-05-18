import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
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
    path: 'announcements/new',
    component: AddAnnouncementComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'New Announcement' },
  },
  {
    path: 'announcements/:orgId/:id',
    component: ViewAnnouncementComponent,
    data: { title: 'Announcement Details' },
  },
  {
    path: 'announcements/:orgId/:id/edit',
    component: EditAnnouncementComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Edit Announcement' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppSettingsRoutingModule {}
