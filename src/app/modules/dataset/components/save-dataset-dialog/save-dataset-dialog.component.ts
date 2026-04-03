import {
  Component,
  OnInit,
  OnChanges,
  Output,
  EventEmitter,
  Input,
  HostListener,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
})
export class SaveDatasetDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() initialName = '';
  @Input() initialDescription = '';
  @Input() dialogTitle = 'Save as Dataset';
  @Input() showJustification = false;
  @Output() close = new EventEmitter<DatasetFormData | null>();

  datasetForm!: FormGroup;

  constructor(private fb: FormBuilder) {}

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
        justificationControl?.setValidators([Validators.required, Validators.maxLength(500)]);
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
    if (control?.errors?.['required']) return 'Dataset name is required';
    if (control?.errors?.['minlength'])
      return `Dataset name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Dataset name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Dataset name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  onSubmit() {
    if (this.datasetForm.valid) {
      const formData: DatasetFormData = {
        name: this.datasetForm.get('name')?.value.trim(),
        description: this.datasetForm.get('description')?.value.trim(),
      };
      if (this.showJustification) {
        formData.justification = this.datasetForm.get('justification')?.value.trim();
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
