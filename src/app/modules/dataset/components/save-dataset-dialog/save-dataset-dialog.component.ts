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
  datasetDescriptionSchema,
  datasetJustificationRequiredSchema,
  datasetJustificationSchema,
  datasetNameSchema,
} from 'src/app/shared/validators/datasets';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

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
  // Drives the confirm button's spinner — parent passes the
  // datasetService.saving signal (or any boolean) so the dialog can
  // show progress while the POST/PUT runs without the global blocker.
  @Input() saving = false;
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
      // Toggle between the optional and required-justification Zod
      // schemas so the audit-log gate ("why are you changing this?")
      // only fires on update flows.
      justificationControl?.setValidators(
        this.showJustification
          ? zodValidator(datasetJustificationRequiredSchema)
          : zodValidator(datasetJustificationSchema),
      );
      justificationControl?.updateValueAndValidity();
    }

    // Mirror the parent's saving state onto the form so its fields
    // lock in lockstep with the Save button's spinner. Without this
    // the user could keep typing in the dialog while the parent's
    // POST/PUT is in flight.
    if (this.datasetForm) {
      if (this.saving && this.datasetForm.enabled) {
        this.datasetForm.disable({ emitEvent: false });
      } else if (!this.saving && this.datasetForm.disabled) {
        this.datasetForm.enable({ emitEvent: false });
      }
    }
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema.
    this.datasetForm = this.fb.group({
      name: ['', [zodValidator(datasetNameSchema)]],
      description: ['', [zodValidator(datasetDescriptionSchema)]],
      justification: ['', [zodValidator(datasetJustificationSchema)]],
    });
  }

  fieldError(fieldName: string): string {
    const control = this.datasetForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
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
