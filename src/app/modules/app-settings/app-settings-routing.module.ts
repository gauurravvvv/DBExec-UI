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
    // App Settings hub — Theme / Branding / Announcements. Gated on the
    // themeManagement LEAF, not APP_SETTINGS (the module header): the
    // permission tree gives `level` only to leaves, so canRead('appSettings')
    // is always false even for an admin holding every child — the guard would
    // block the page (this was the "can't open App Settings" bug). Gating on
    // a child leaf the org admin holds makes the guard pass, mirroring the
    // System Settings hub below (gated on ssoConfiguration).
    path: 'app',
    component: AppSettingsHubComponent,
    canActivate: [roleGuard],
    data: { permission: PERMISSIONS.THEME_MANAGEMENT, title: 'App Settings' },
  },
  {
    // System Settings hub — SSO / Email / Security Policy / AI Features.
    // Gated on SSO_CONFIGURATION (a child LEAF), NOT SYSTEM_SETTINGS (the
    // module header): PermissionService.canRead matches the node whose
    // `value` equals the argument and returns THAT node's `level`. Module
    // headers carry no `level`, so canRead('systemSettings') is always
    // false — even for an admin holding every child leaf. Gating on the
    // ssoConfiguration leaf (which the org admin holds) makes the guard
    // pass; the org-policy BE route already gates writes on the same leaf.
    path: 'system',
    component: SystemSettingsHubComponent,
    canActivate: [roleGuard],
    data: {
      permission: PERMISSIONS.SSO_CONFIGURATION,
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
