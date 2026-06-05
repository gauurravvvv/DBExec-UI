import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { BrandingSettingsComponent } from './components/branding-settings/branding-settings.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { EmailConfigurationComponent } from './components/email-configuration/email-configuration.component';
import { ListAnnouncementsComponent } from './components/list-announcements/list-announcements.component';
import { SecurityPolicyComponent } from './components/security-policy/security-policy.component';
import { ThemeSettingsComponent } from './components/theme-settings/theme-settings.component';
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
  {
    path: 'theme',
    component: ThemeSettingsComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Theme' },
  },
  {
    path: 'branding',
    component: BrandingSettingsComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Branding' },
  },
  {
    path: 'security-policy',
    component: SecurityPolicyComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Security Policy' },
  },
  {
    path: 'email-configuration',
    component: EmailConfigurationComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Email Configuration' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppSettingsRoutingModule {}
