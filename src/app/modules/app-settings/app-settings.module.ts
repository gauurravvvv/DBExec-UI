import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AppSettingsRoutingModule } from './app-settings-routing.module';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { AppSettingsHubComponent } from './components/app-settings-hub/app-settings-hub.component';
import { BrandingSettingsComponent } from './components/branding-settings/branding-settings.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { EmailConfigurationComponent } from './components/email-configuration/email-configuration.component';
import { ListAnnouncementsComponent } from './components/list-announcements/list-announcements.component';
import { SecurityPolicyComponent } from './components/security-policy/security-policy.component';
import { ThemeSettingsComponent } from './components/theme-settings/theme-settings.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';

@NgModule({
  declarations: [
    AppSettingsHubComponent,
    ListAnnouncementsComponent,
    AddAnnouncementComponent,
    EditAnnouncementComponent,
    ViewAnnouncementComponent,
    ThemeSettingsComponent,
    BrandingSettingsComponent,
    SecurityPolicyComponent,
    EmailConfigurationComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SharedModule,
    AppSettingsRoutingModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class AppSettingsModule {}
