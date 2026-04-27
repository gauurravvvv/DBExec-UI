import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SaveAnalysesDialogComponent } from '../modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AddCustomFieldDialogComponent } from '../modules/dataset/components/add-custom-field-dialog/add-custom-field-dialog.component';
import { AnalysisFilterBarComponent } from './components/analysis-filter-bar/analysis-filter-bar.component';
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
import { GlobalSearchComponent } from './components/global-search/global-search.component';
import { AppPrimeNGModule } from './modules/app-primeng.module';
import { FileSizePipe } from './pipes/file-size.pipe';
import {
  FilterSchemasPipe,
  FilterTablesPipe,
} from './pipes/filter-schemas.pipe';
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
    GlobalSearchComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
    AnalysisFilterBarComponent,
    CustomAccordionComponent,
    CustomBinaryCheckboxComponent,
    FileSizePipe,
    FilterSchemasPipe,
    FilterTablesPipe,
    ReplaceUnderscoresPipe,
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AppPrimeNGModule],
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
    GlobalSearchComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
    AnalysisFilterBarComponent,
    CustomAccordionComponent,
    CustomBinaryCheckboxComponent,
    FileSizePipe,
    FilterSchemasPipe,
    FilterTablesPipe,
    ReplaceUnderscoresPipe,
  ],
})
export class SharedModule {}
