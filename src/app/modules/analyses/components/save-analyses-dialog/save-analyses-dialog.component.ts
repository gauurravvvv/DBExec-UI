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
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  analysisDescriptionSchema,
  analysisNameSchema,
} from 'src/app/shared/validators/analyses';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

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
  // Drives the Save button's spinner. Parent passes
  // analysesService.saving so the dialog shows in-progress without
  // the global blocker.
  @Input() saving = false;
  @Output() close = new EventEmitter<AnalysisFormData | null>();

  analysisForm!: FormGroup;
  saveJustification = '';

  constructor(
    private fb: FormBuilder,
    private translate: TranslateService,
  ) {}

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

    // Mirror the parent's saving state onto the form so its fields
    // lock in lockstep with the Save button's spinner.
    if (this.analysisForm) {
      if (this.saving && this.analysisForm.enabled) {
        this.analysisForm.disable({ emitEvent: false });
      } else if (!this.saving && this.analysisForm.disabled) {
        this.analysisForm.enable({ emitEvent: false });
      }
    }
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema.
    this.analysisForm = this.fb.group({
      name: ['', [zodValidator(analysisNameSchema)]],
      description: ['', [zodValidator(analysisDescriptionSchema)]],
    });
  }

  fieldError(fieldName: string): string {
    const control = this.analysisForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
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
