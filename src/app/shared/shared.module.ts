import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AnalysisFilterBarComponent } from '../modules/analyses/components/analysis-filter-bar/analysis-filter-bar.component';
import { SaveAnalysesDialogComponent } from '../modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AddCustomFieldDialogComponent } from '../modules/dataset/components/add-custom-field-dialog/add-custom-field-dialog.component';
import { DatasetPickerDialogComponent } from '../modules/dataset/components/dataset-picker-dialog/dataset-picker-dialog.component';
import { ChangePasswordDialogComponent } from './components/change-password-dialog/change-password-dialog.component';
import { ConfirmLeaveDialogComponent } from './components/confirm-leave-dialog/confirm-leave-dialog.component';
import { CustomAccordionComponent } from './components/custom-accordion/custom-accordion.component';
import { CustomBinaryCheckboxComponent } from './components/custom-binary-checkbox/custom-binary-checkbox.component';
import { CustomCalendarComponent } from './components/custom-calendar/custom-calendar.component';
import { CustomCheckboxComponent } from './components/custom-checkbox/custom-checkbox.component';
import { CustomDaterangeComponent } from './components/custom-daterange/custom-daterange.component';
import { CustomDropdownComponent } from './components/custom-dropdown/custom-dropdown.component';
import { CustomInputComponent } from './components/custom-input/custom-input.component';
import { CustomMultiselectComponent } from './components/custom-multiselect/custom-multiselect.component';
import { CustomNumberComponent } from './components/custom-number/custom-number.component';
import { CustomRadioComponent } from './components/custom-radio/custom-radio.component';
import { CustomRangesliderComponent } from './components/custom-rangeslider/custom-rangeslider.component';
import { CustomTextareaComponent } from './components/custom-textarea/custom-textarea.component';
import { CustomToggleComponent } from './components/custom-toggle/custom-toggle.component';
import { CommandModalComponent } from './components/command-modal/command-modal.component';
import { GlobalSearchComponent } from './components/global-search/global-search.component';
import { NotificationModalComponent } from './components/notification-modal/notification-modal.component';
import { AppPrimeNGModule } from './modules/app-primeng.module';
import { FileSizePipe } from './pipes/file-size.pipe';
import {
  FilterSchemasPipe,
  FilterTablesPipe,
} from './pipes/filter-schemas.pipe';
import { SkeletonTableRowsComponent } from './components/skeleton/skeleton-table.component';
import { ContentLoaderComponent } from './components/content-loader/content-loader.component';
import { BrandingWatermarkComponent } from './components/branding-watermark/branding-watermark.component';
import { HasPermissionDirective } from './directives/has-permission.directive';
import { RelativeTimePipe } from './pipes/relative-time.pipe';
import { ReplaceUnderscoresPipe } from './pipes/replace-underscores.pipe';

@NgModule({
  declarations: [
    ChangePasswordDialogComponent,
    ConfirmLeaveDialogComponent,
    CustomCalendarComponent,
    CustomCheckboxComponent,
    CustomDaterangeComponent,
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomNumberComponent,
    CustomRadioComponent,
    CustomRangesliderComponent,
    CustomTextareaComponent,
    CustomToggleComponent,
    CommandModalComponent,
    GlobalSearchComponent,
    NotificationModalComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
    DatasetPickerDialogComponent,
    AnalysisFilterBarComponent,
    CustomAccordionComponent,
    CustomBinaryCheckboxComponent,
    FileSizePipe,
    FilterSchemasPipe,
    FilterTablesPipe,
    RelativeTimePipe,
    ReplaceUnderscoresPipe,
    SkeletonTableRowsComponent,
    ContentLoaderComponent,
    BrandingWatermarkComponent,
    HasPermissionDirective,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    TranslateModule,
  ],
  exports: [
    ChangePasswordDialogComponent,
    ConfirmLeaveDialogComponent,
    CustomCalendarComponent,
    CustomCheckboxComponent,
    CustomDaterangeComponent,
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomNumberComponent,
    CustomRadioComponent,
    CustomRangesliderComponent,
    CustomTextareaComponent,
    CustomToggleComponent,
    CommandModalComponent,
    GlobalSearchComponent,
    NotificationModalComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
    DatasetPickerDialogComponent,
    AnalysisFilterBarComponent,
    CustomAccordionComponent,
    CustomBinaryCheckboxComponent,
    FileSizePipe,
    FilterSchemasPipe,
    FilterTablesPipe,
    RelativeTimePipe,
    ReplaceUnderscoresPipe,
    SkeletonTableRowsComponent,
    ContentLoaderComponent,
    BrandingWatermarkComponent,
    HasPermissionDirective,
    TranslateModule,
  ],
})
export class SharedModule {}
