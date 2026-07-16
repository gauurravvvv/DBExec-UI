import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  addCalculatedFieldSchema,
  CALC_FIELD_DATA_TYPE_VALUES,
  CalcFieldDataType,
  updateCalculatedFieldSchema,
  validateCalculatedFieldSchema,
} from 'src/app/shared/validators/calculatedFields';
import {
  CalculatedField,
  CalculatedFieldsService,
} from '../../services/calculated-fields.service';

/**
 * Calculated-field editor dialog.
 *
 * Reachable from the dataset field area. Lists the dataset's existing
 * calculated fields, lets the user add / edit one (name + expression +
 * optional declared data type), run a compile-only Validate against the
 * BE before saving, and delete. Hits the safe-expression REST surface
 * via CalculatedFieldsService; shape validation reuses the mirrored zod
 * schemas so the client rejects a bad name/expression before a round
 * trip, and the BE returns the same translation keys on a 400 so the
 * user sees a consistent message.
 *
 * Unlike the Monaco-backed custom-field builder (which targets the
 * dataset `/fields` subresource), this is a lightweight form for the
 * whitelisted expression grammar. On any successful mutation the dialog
 * emits `changed` so the host can re-fetch the dataset fields — the calc
 * fields surface back as usable fields in the analysis picker.
 */
@Component({
  selector: 'app-calculated-fields-dialog',
  templateUrl: './calculated-fields-dialog.component.html',
  styleUrls: ['./calculated-fields-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculatedFieldsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() datasetId = '';

  /** Fired when the dialog is dismissed. */
  @Output() close = new EventEmitter<void>();
  /** Fired after any successful add/update/delete so the host can refresh. */
  @Output() changed = new EventEmitter<void>();

  /** The dataset's existing calc fields. */
  fields: CalculatedField[] = [];
  listError: string | null = null;

  /** Data-type dropdown options (numeric/text/date/boolean + auto). */
  dataTypeOptions: { label: string; value: string }[] = [];

  // ── Editor form state ────────────────────────────────────────────
  showEditor = false;
  editingId: string | null = null;
  form: { name: string; expression: string; dataType: string } = {
    name: '',
    expression: '',
    dataType: '',
  };
  nameError: string | null = null;
  expressionError: string | null = null;

  // Validation preview (compile-only). Reset whenever the expression changes.
  isValidated = false;
  validationResult: { valid: boolean; message: string } | null = null;

  saving = this.calcFields.saving;
  validating = this.calcFields.validating;
  loading = this.calcFields.loading;

  /**
   * Helper text listing the allowed expression grammar — kept in one
   * place so it tracks whatever the BE compiler whitelists.
   */
  get expressionHelp(): string {
    return this.translate.instant('DATASET.CALC_FIELD_EXPRESSION_HELP');
  }

  constructor(
    private calcFields: CalculatedFieldsService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.buildDataTypeOptions();
      this.resetEditor();
      this.showEditor = false;
      this.listError = null;
      if (this.datasetId) this.loadFields();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (!this.visible) return;
    if (this.showEditor) {
      this.closeEditor();
      return;
    }
    this.requestClose();
  }

  private buildDataTypeOptions(): void {
    this.dataTypeOptions = [
      { label: this.translate.instant('DATASET.CALC_FIELD_TYPE_AUTO'), value: '' },
      ...CALC_FIELD_DATA_TYPE_VALUES.map((v: CalcFieldDataType) => ({
        label: this.translate.instant(
          'DATASET.CALC_FIELD_TYPE_' + v.toUpperCase(),
        ),
        value: v,
      })),
    ];
  }

  // ── List ───────────────────────────────────────────────────────────

  loadFields(): void {
    this.listError = null;
    this.calcFields
      .listForDataset(this.datasetId)
      .then((response: any) => {
        if (response && response.code === 200) {
          const data = response.data;
          this.fields = Array.isArray(data)
            ? data
            : Array.isArray(data?.items)
              ? data.items
              : [];
        } else {
          this.fields = [];
          this.listError =
            response?.message ||
            this.translate.instant('DATASET.CALC_FIELD_LIST_FAILED');
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.fields = [];
        this.listError = this.translate.instant(
          'DATASET.CALC_FIELD_LIST_FAILED',
        );
        this.cdr.markForCheck();
      });
  }

  // ── Editor open/close ───────────────────────────────────────────────

  openAdd(): void {
    this.resetEditor();
    this.editingId = null;
    this.showEditor = true;
    this.cdr.markForCheck();
  }

  openEdit(field: CalculatedField): void {
    this.resetEditor();
    this.editingId = field.id;
    this.form = {
      name: field.name || '',
      expression: field.expression || '',
      dataType: (field.dataType as string) || '',
    };
    this.showEditor = true;
    this.cdr.markForCheck();
  }

  closeEditor(): void {
    this.showEditor = false;
    this.resetEditor();
    this.cdr.markForCheck();
  }

  private resetEditor(): void {
    this.editingId = null;
    this.form = { name: '', expression: '', dataType: '' };
    this.nameError = null;
    this.expressionError = null;
    this.isValidated = false;
    this.validationResult = null;
  }

  get isEditMode(): boolean {
    return this.editingId !== null;
  }

  // ── Field-level change handlers ─────────────────────────────────────

  onNameChange(): void {
    // Re-run the shape check for the name only (reuse the add schema's
    // per-field parse via the composite schema on submit; here we just
    // clear the inline error as the user types).
    this.nameError = null;
  }

  onExpressionChange(): void {
    // Any expression edit invalidates a prior compile preview.
    this.isValidated = false;
    this.validationResult = null;
    this.expressionError = null;
  }

  // ── Validate (compile-only preview) ─────────────────────────────────

  onValidate(): void {
    if (this.validating()) return;
    const parsed = validateCalculatedFieldSchema.safeParse({
      datasetId: this.datasetId,
      expression: this.form.expression,
    });
    if (!parsed.success) {
      const key =
        parsed.error.issues[0]?.message ?? 'DATASET.CALC_FIELD_VALIDATION_FAILED';
      this.expressionError = this.translate.instant(key);
      this.cdr.markForCheck();
      return;
    }

    this.validationResult = null;
    this.isValidated = false;
    this.calcFields
      .validate(parsed.data)
      .then((response: any) => {
        if (response && response.code === 200) {
          this.isValidated = true;
          this.validationResult = {
            valid: true,
            message:
              response.message ||
              this.translate.instant('DATASET.CALC_FIELD_VALIDATED'),
          };
        } else {
          this.isValidated = false;
          this.validationResult = {
            valid: false,
            message:
              response?.message ||
              this.translate.instant('DATASET.CALC_FIELD_VALIDATION_FAILED'),
          };
        }
        this.cdr.markForCheck();
      })
      .catch((error: any) => {
        this.isValidated = false;
        this.validationResult = {
          valid: false,
          message:
            error?.error?.message ||
            this.translate.instant('DATASET.CALC_FIELD_VALIDATION_FAILED'),
        };
        this.cdr.markForCheck();
      });
  }

  // ── Save (add / update) ─────────────────────────────────────────────

  get canSave(): boolean {
    return (
      !!this.form.name?.trim() &&
      !!this.form.expression?.trim() &&
      !this.saving()
    );
  }

  onSave(): void {
    if (this.saving()) return;
    this.nameError = null;
    this.expressionError = null;

    const base = {
      datasetId: this.datasetId,
      name: this.form.name,
      expression: this.form.expression,
      dataType: this.form.dataType || undefined,
    };

    if (this.isEditMode) {
      const parsed = updateCalculatedFieldSchema.safeParse({
        ...base,
        id: this.editingId,
      });
      if (!parsed.success) {
        this.applyZodErrors(parsed.error.issues);
        return;
      }
      this.calcFields
        .update(parsed.data)
        .then((response: any) => this.afterMutation(response))
        .catch(() => this.cdr.markForCheck());
    } else {
      const parsed = addCalculatedFieldSchema.safeParse(base);
      if (!parsed.success) {
        this.applyZodErrors(parsed.error.issues);
        return;
      }
      this.calcFields
        .add(parsed.data)
        .then((response: any) => this.afterMutation(response))
        .catch(() => this.cdr.markForCheck());
    }
  }

  private applyZodErrors(
    issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  ): void {
    for (const issue of issues) {
      const field = issue.path[0];
      const msg = this.translate.instant(issue.message);
      if (field === 'name') this.nameError = msg;
      else if (field === 'expression') this.expressionError = msg;
    }
    this.cdr.markForCheck();
  }

  private afterMutation(response: any): void {
    if (this.globalService.handleSuccessService(response, true)) {
      this.showEditor = false;
      this.resetEditor();
      this.loadFields();
      this.changed.emit();
    }
    this.cdr.markForCheck();
  }

  // ── Delete ───────────────────────────────────────────────────────────

  isDeleting(id: string): boolean {
    return this.calcFields.isDeleting(id);
  }

  confirmDeleteId: string | null = null;

  askDelete(field: CalculatedField): void {
    this.confirmDeleteId = field.id;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
    this.cdr.markForCheck();
  }

  doDelete(): void {
    const id = this.confirmDeleteId;
    if (!id) return;
    this.calcFields
      .delete(id)
      .then((response: any) => {
        this.confirmDeleteId = null;
        if (this.globalService.handleSuccessService(response, true)) {
          this.loadFields();
          this.changed.emit();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.confirmDeleteId = null;
        this.cdr.markForCheck();
      });
  }

  // ── Dialog dismiss ────────────────────────────────────────────────────

  requestClose(): void {
    this.close.emit();
  }

  trackById(_: number, item: CalculatedField): string {
    return item.id;
  }
}
