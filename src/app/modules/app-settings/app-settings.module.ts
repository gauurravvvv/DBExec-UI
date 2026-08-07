import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AppSettingsRoutingModule } from './app-settings-routing.module';
import { AddAnnouncementComponent } from './components/add-announcement/add-announcement.component';
import { AiFeaturesComponent } from './components/ai-features/ai-features.component';
import { AppSettingsHubComponent } from './components/app-settings-hub/app-settings-hub.component';
import { BrandingSettingsComponent } from './components/branding-settings/branding-settings.component';
import { EditAnnouncementComponent } from './components/edit-announcement/edit-announcement.component';
import { EmailConfigurationComponent } from './components/email-configuration/email-configuration.component';
import { ListAnnouncementsComponent } from './components/list-announcements/list-announcements.component';
import { SecurityPolicyComponent } from './components/security-policy/security-policy.component';
import { SsoSettingsComponent } from './components/sso-settings/sso-settings.component';
import { SystemSettingsHubComponent } from './components/system-settings-hub/system-settings-hub.component';
import { ListThemesComponent } from './components/list-themes/list-themes.component';
import { AddThemeComponent } from './components/add-theme/add-theme.component';
import { ViewAnnouncementComponent } from './components/view-announcement/view-announcement.component';

@NgModule({
  declarations: [
    AppSettingsHubComponent,
    ListAnnouncementsComponent,
    AddAnnouncementComponent,
    EditAnnouncementComponent,
    ViewAnnouncementComponent,
    ListThemesComponent,
    AddThemeComponent,
    BrandingSettingsComponent,
    SecurityPolicyComponent,
    EmailConfigurationComponent,
    SystemSettingsHubComponent,
    SsoSettingsComponent,
    AiFeaturesComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SharedModule,
    AppSettingsRoutingModule,
    UsGridCellDirective,
    ButtonComponent,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class AppSettingsModule {}
