import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { roleGuard } from 'src/app/core/guards/role.guard';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { AppSettingsHubComponent } from './components/app-settings-hub/app-settings-hub.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';

// Settings is now two tabbed hubs:
//   /app/settings/app     → App Settings hub (Theme / Branding / Announcements)
//   /app/settings/system  → System Settings hub (added in the System-Settings slice)
// The former per-screen routes (theme, branding, security-policy,
// email-configuration) are gone — those screens are TABS inside the hubs.
// Each hub gates on its OWN parent permission (holding it unlocks all tabs).
// Announcement CRUD keeps its own leaf routes so deep links still work.
const routes: Routes = [
  { path: '', redirectTo: 'app', pathMatch: 'full' },
  {
    path: 'app',
    component: AppSettingsHubComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.APP_SETTINGS, title: 'App Settings' },
  },
  {
    path: 'announcements/new',
    component: AddAnnouncementComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'New Announcement' },
  },
  {
    path: 'announcements/:id',
    component: ViewAnnouncementComponent,
    data: { title: 'Announcement Details' },
  },
  {
    path: 'announcements/:id/edit',
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
