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
  DATASET_CACHE_TTL_LIMITS,
  datasetCacheTtlSecondsSchema,
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
  // Result-cache config. `cacheTtlSeconds` is null when caching is off
  // or the user left the TTL blank (server falls back to its default).
  cacheEnabled: boolean;
  cacheTtlSeconds: number | null;
  // Track F: free-form organizational tags (string[]).
  tags: string[];
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
  // Result-cache initial state — parent passes the loaded dataset's
  // values on edit; both default to "off / server default" on create.
  @Input() initialCacheEnabled = false;
  @Input() initialCacheTtlSeconds: number | null = null;
  // Track F: initial tags on edit; empty on create.
  @Input() initialTags: string[] = [];
  // Drives the confirm button's spinner — parent passes the
  // datasetService.saving signal (or any boolean) so the dialog can
  // show progress while the POST/PUT runs without the global blocker.
  @Input() saving = false;
  @Output() close = new EventEmitter<DatasetFormData | null>();

  datasetForm!: FormGroup;

  // Advisory TTL bounds surfaced to the number control (BE clamps too).
  readonly cacheTtlMin = DATASET_CACHE_TTL_LIMITS.MIN_SECONDS;
  readonly cacheTtlMax = DATASET_CACHE_TTL_LIMITS.MAX_SECONDS;

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
        cacheEnabled: !!this.initialCacheEnabled,
        cacheTtlSeconds: this.initialCacheTtlSeconds ?? null,
        tags: this.initialTags ?? [],
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
      // Result-cache config. The toggle is a plain boolean; the TTL is
      // validated against the SAME shared schema the BE uses so an
      // out-of-range value is caught here first.
      cacheEnabled: [false],
      cacheTtlSeconds: [
        null,
        [zodValidator(datasetCacheTtlSecondsSchema)],
      ],
      // Track F: organizational tags.
      tags: [[] as string[]],
    });
  }

  /** True when the cache toggle is on — drives the TTL field's *ngIf. */
  get cacheEnabled(): boolean {
    return !!this.datasetForm?.get('cacheEnabled')?.value;
  }

  getCacheTtlError(): string {
    return this.fieldError('cacheTtlSeconds');
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
      const cacheEnabled = !!this.datasetForm.get('cacheEnabled')?.value;
      const rawTtl = this.datasetForm.get('cacheTtlSeconds')?.value;
      const formData: DatasetFormData = {
        name: this.datasetForm.get('name')?.value.trim(),
        description: this.datasetForm.get('description')?.value.trim(),
        cacheEnabled,
        // Only send a TTL when caching is on AND a value was entered;
        // otherwise null so the server uses its default.
        cacheTtlSeconds:
          cacheEnabled && rawTtl !== null && rawTtl !== '' && rawTtl !== undefined
            ? Number(rawTtl)
            : null,
        tags: this.datasetForm.get('tags')?.value ?? [],
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
