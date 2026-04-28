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

export interface DatasetFormData {
  name: string;
  description: string;
  justification?: string;
}

@Component({
  selector: 'app-save-dataset-dialog',
  templateUrl: './save-dataset-dialog.component.html',
  styleUrls: ['./save-dataset-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveDatasetDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() initialName = '';
  @Input() initialDescription = '';
  @Input() dialogTitle = '';
  @Input() showJustification = false;
  @Output() close = new EventEmitter<DatasetFormData | null>();

  datasetForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private translate: TranslateService,
  ) {
    this.dialogTitle = this.translate.instant('DATASET.SAVE_AS_DATASET');
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnInit() {
    this.initForm();
  }

  ngOnChanges() {
    if (this.visible && this.datasetForm) {
      this.datasetForm.patchValue({
        name: this.initialName,
        description: this.initialDescription,
        justification: '',
      });

      const justificationControl = this.datasetForm.get('justification');
      if (this.showJustification) {
        justificationControl?.setValidators([
          Validators.required,
          Validators.maxLength(500),
        ]);
      } else {
        justificationControl?.clearValidators();
      }
      justificationControl?.updateValueAndValidity();
    }
  }

  initForm() {
    this.datasetForm = this.fb.group({
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
      justification: ['', [Validators.maxLength(500)]],
    });
  }

  getNameError(): string {
    const control = this.datasetForm.get('name');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.DATASET_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.DATASET_NAME_MIN_LENGTH', { length: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.DATASET_NAME_MAX_LENGTH', { length: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.DATASET_NAME_PATTERN');
    return '';
  }

  onSubmit() {
    if (this.datasetForm.valid) {
      const formData: DatasetFormData = {
        name: this.datasetForm.get('name')?.value.trim(),
        description: this.datasetForm.get('description')?.value.trim(),
      };
      if (this.showJustification) {
        formData.justification = this.datasetForm
          .get('justification')
          ?.value.trim();
      }
      this.close.emit(formData);
      this.datasetForm.reset();
    }
  }

  onCancel() {
    this.datasetForm.reset();
    this.close.emit(null);
  }
}
