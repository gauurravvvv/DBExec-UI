import { ChangeDetectionStrategy, Component,
  OnInit,
  OnChanges,
  Output,
  EventEmitter,
  Input,
  HostListener, } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  @Input() dialogTitle = 'Save Analysis';
  @Input() showJustification = false;
  @Output() close = new EventEmitter<AnalysisFormData | null>();

  analysisForm!: FormGroup;
  saveJustification = '';

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
    if (control?.errors?.['required']) return 'Analysis name is required';
    if (control?.errors?.['minlength'])
      return `Analysis name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Analysis name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Analysis name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
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
