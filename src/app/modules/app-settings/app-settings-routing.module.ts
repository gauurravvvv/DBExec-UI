import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { roleGuard } from 'src/app/core/guards/role.guard';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { AppSettingsHubComponent } from './components/app-settings-hub/app-settings-hub.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { SystemSettingsHubComponent } from './components/system-settings-hub/system-settings-hub.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';
import { AddThemeComponent } from './components/add-theme/add-theme.component';
import { AddBrandingComponent } from './components/add-branding/add-branding.component';

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
    // App hub — Theme / Branding / Announcements. Gated on APP_SETTINGS,
    // which is now a GRANTABLE LEAF (a screen under the `settings` parent),
    // so an org admin holding it passes the guard. The former per-tab leaf
    // grants (themeManagement, …) were dropped from the catalog — one grant
    // per hub unlocks all its tabs.
    path: 'app',
    component: AppSettingsHubComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.APP_SETTINGS, title: 'App Settings' },
  },
  {
    // System hub — SSO / Email / Security Policy / AI Features. Gated on
    // SYSTEM_SETTINGS, now a grantable leaf under the `settings` parent
    // (see the App hub above). One grant unlocks every System tab.
    path: 'system',
    component: SystemSettingsHubComponent,
    canActivate: [roleGuard],
    data: {
      permission: PERMISSIONS.SYSTEM_SETTINGS,
      title: 'System Settings',
    },
  },
  {
    path: 'announcements/new',
    component: AddAnnouncementComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'New Announcement' },
  },
  // Theme presets — add/edit/view as routed pages (list stays a hub tab),
  // same shape as announcements. AddThemeComponent serves all three modes.
  {
    path: 'themes/new',
    component: AddThemeComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'New Theme' },
  },
  {
    path: 'themes/:id/edit',
    component: AddThemeComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Edit Theme' },
  },
  {
    path: 'themes/:id',
    component: AddThemeComponent,
    data: { title: 'Theme Details' },
  },
  // Branding presets — add/edit/view routed pages (list stays a hub tab).
  {
    path: 'branding-presets/new',
    component: AddBrandingComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'New Branding' },
  },
  {
    path: 'branding-presets/:id/edit',
    component: AddBrandingComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Edit Branding' },
  },
  {
    path: 'branding-presets/:id',
    component: AddBrandingComponent,
    data: { title: 'Branding Details' },
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
