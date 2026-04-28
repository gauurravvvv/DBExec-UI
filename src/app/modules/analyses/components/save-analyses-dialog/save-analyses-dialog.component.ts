import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/constants/regex.constant';

export interface AnalysisFormData {
  name: string;
  description: string;
  justification?: string;
}

@Component({
  selector: 'app-save-analyses-dialog',
  templateUrl: './save-analyses-dialog.component.html',
  styleUrls: ['./save-analyses-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAnalysesDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() initialName = '';
  @Input() initialDescription = '';
  @Input() dialogTitle = '';
  @Input() showJustification = false;
  @Output() close = new EventEmitter<AnalysisFormData | null>();

  analysisForm!: FormGroup;
  saveJustification = '';

  constructor(private fb: FormBuilder, private translate: TranslateService) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnInit() {
    if (!this.dialogTitle) {
      this.dialogTitle = this.translate.instant('ANALYSES.SAVE_ANALYSIS');
    }
    this.initForm();
  }

  ngOnChanges() {
    if (this.visible && this.analysisForm) {
      this.analysisForm.patchValue({
        name: this.initialName,
        description: this.initialDescription,
      });
      this.saveJustification = '';
    }
  }

  initForm() {
    this.analysisForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: ['', [Validators.maxLength(500)]],
    });
  }

  getNameError(): string {
    const control = this.analysisForm.get('name');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.ANALYSIS_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_MIN_LENGTH', { length: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_MAX_LENGTH', { length: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_PATTERN');
    return '';
  }

  onSubmit() {
    const justificationValid =
      !this.showJustification || this.saveJustification.trim();
    if (this.analysisForm.valid && justificationValid) {
      const formData: AnalysisFormData = {
        name: this.analysisForm.get('name')?.value.trim(),
        description: this.analysisForm.get('description')?.value.trim(),
      };
      if (this.showJustification) {
        formData.justification = this.saveJustification.trim();
      }
      this.close.emit(formData);
      this.analysisForm.reset();
      this.saveJustification = '';
    }
  }

  onCancel() {
    this.analysisForm.reset();
    this.saveJustification = '';
    this.close.emit(null);
  }
}
