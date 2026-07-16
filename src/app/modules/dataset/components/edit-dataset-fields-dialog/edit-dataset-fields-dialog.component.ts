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
import { DatasetService } from '../../services/dataset.service';

export interface DatasetFieldsData {
  fields: any[];
}

export const ANALYTICAL_TYPES = [
  { label: 'Text', value: 'text', icon: 'pi pi-align-left' },
  { label: 'Integer', value: 'integer', icon: 'pi pi-hashtag' },
  { label: 'Decimal', value: 'numeric', icon: 'pi pi-hashtag' },
  { label: 'Boolean', value: 'boolean', icon: 'pi pi-check-square' },
  { label: 'Date', value: 'date', icon: 'pi pi-calendar' },
  { label: 'Date & Time', value: 'timestamp', icon: 'pi pi-calendar' },
  { label: 'JSON', value: 'json', icon: 'pi pi-code' },
];

/**
 * Column-metadata editor (slice 1).
 *
 * Extends the single-field edit dialog into a full metadata editor. In
 * addition to the display name + data type it exposes the per-field
 * analytical metadata the BE now persists: description, role
 * (dimension|measure), defaultAggregation (measure-only), formatHint
 * ({kind, decimals?, thousands?, currencyCode?, dateFormat?}), isVisible,
 * and typeOverride. Every changed key is forwarded through
 * DatasetService.updateDatasetMapping on Save.
 *
 * The dialog is single-field (opened per row from view-dataset), so "Save
 * all" here means "persist every changed metadata key for this field".
 */
@Component({
  selector: 'app-edit-dataset-fields-dialog',
  templateUrl: './edit-dataset-fields-dialog.component.html',
  styleUrls: ['./edit-dataset-fields-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDatasetFieldsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() field: any = null; // Now receives the full field data from API
  @Input() fieldIndex: number = -1;
  @Input() dialogTitle = '';
  @Output() close = new EventEmitter<any>();

  editableField: any = null;
  originalField: any = null;
  isSaveEnabled = false;
  isSubmitting = false;
  analyticalTypes = ANALYTICAL_TYPES;
  nameError = '';

  // ── Metadata option lists ────────────────────────────────────────────
  // Labels are i18n keys resolved in the template via the `translate` pipe
  // (dropdowns bind optionLabel to the pre-translated string below).
  roleOptions = [
    { labelKey: 'DATASET.FIELD.DIMENSION', value: 'dimension' },
    { labelKey: 'DATASET.FIELD.MEASURE', value: 'measure' },
  ];

  aggregationOptions = [
    { labelKey: 'DATASET.FIELD.AGG_SUM', value: 'sum' },
    { labelKey: 'DATASET.FIELD.AGG_AVG', value: 'avg' },
    { labelKey: 'DATASET.FIELD.AGG_COUNT', value: 'count' },
    { labelKey: 'DATASET.FIELD.AGG_COUNT_DISTINCT', value: 'countDistinct' },
    { labelKey: 'DATASET.FIELD.AGG_MIN', value: 'min' },
    { labelKey: 'DATASET.FIELD.AGG_MAX', value: 'max' },
    { labelKey: 'DATASET.FIELD.AGG_NONE', value: 'none' },
  ];

  formatKindOptions = [
    { labelKey: 'DATASET.FIELD.FORMAT_NUMBER', value: 'number' },
    { labelKey: 'DATASET.FIELD.FORMAT_CURRENCY', value: 'currency' },
    { labelKey: 'DATASET.FIELD.FORMAT_PERCENT', value: 'percent' },
    { labelKey: 'DATASET.FIELD.FORMAT_DATE', value: 'date' },
    { labelKey: 'DATASET.FIELD.FORMAT_DATETIME', value: 'datetime' },
    { labelKey: 'DATASET.FIELD.FORMAT_TEXT', value: 'text' },
  ];

  // Resolved (translated) option lists — rebuilt on init + language change
  // so app-custom-dropdown gets plain-string labels.
  roleOptionsResolved: { label: string; value: string }[] = [];
  aggregationOptionsResolved: { label: string; value: string }[] = [];
  formatKindOptionsResolved: { label: string; value: string }[] = [];

  readonly MIN_NAME_LENGTH = 1;
  readonly MAX_NAME_LENGTH = 128;
  readonly MAX_DESCRIPTION_LENGTH = 1024;
  readonly MAX_DECIMALS = 10;

  saving = this.datasetService.saving;

  constructor(
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.dialogTitle = this.translate.instant('DATASET.EDIT_FIELD');
    this.resolveOptionLabels();
    this.translate.onLangChange.subscribe(() => {
      this.resolveOptionLabels();
      this.cdr.markForCheck();
    });
  }

  private resolveOptionLabels(): void {
    this.roleOptionsResolved = this.roleOptions.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
    this.aggregationOptionsResolved = this.aggregationOptions.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
    this.formatKindOptionsResolved = this.formatKindOptions.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && this.field) {
      // Normalize dataType to match analytical types
      const normalizedType = this.normalizeDataType(this.field.dataType);
      // Seed a normalized, fully-populated editable copy so every control
      // has a defined value to bind against (BE may omit metadata for
      // legacy fields).
      const normalized = this.normalizeField({
        ...this.field,
        dataType: normalizedType,
      });
      this.editableField = normalized;
      // Deep-ish clone: formatHint is a nested object so clone it too, or a
      // change to editableField.formatHint would also mutate originalField
      // and defeat the dirty check.
      this.originalField = {
        ...normalized,
        formatHint: { ...normalized.formatHint },
      };
      this.isSaveEnabled = false;
      this.isSubmitting = false;
    }
  }

  /**
   * Fill in defaults for the metadata keys so the controls always have a
   * defined value. Keeps formatHint as a normalized object.
   */
  private normalizeField(field: any): any {
    const fh = field.formatHint || {};
    return {
      ...field,
      description: field.description ?? '',
      role: field.role ?? 'dimension',
      defaultAggregation: field.defaultAggregation ?? 'none',
      isVisible: field.isVisible ?? true,
      typeOverride: field.typeOverride ?? '',
      formatHint: {
        kind: fh.kind ?? 'text',
        decimals: fh.decimals ?? null,
        currencyCode: fh.currencyCode ?? '',
        dateFormat: fh.dateFormat ?? '',
        thousands: fh.thousands ?? false,
      },
    };
  }

  /**
   * Map raw postgres types to our simplified analytical types.
   */
  normalizeDataType(rawType: string): string {
    if (!rawType) return 'text';
    const t = rawType.toLowerCase();
    if (t.includes('int') || t.includes('serial')) return 'integer';
    if (
      t.includes('numeric') ||
      t.includes('decimal') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('real') ||
      t.includes('money')
    )
      return 'numeric';
    if (t.includes('bool')) return 'boolean';
    if (t.includes('timestamp')) return 'timestamp';
    if (t.includes('date') || t.includes('time') || t.includes('interval'))
      return 'date';
    if (t.includes('json')) return 'json';
    if (
      t.includes('char') ||
      t.includes('text') ||
      t.includes('string') ||
      t.includes('citext') ||
      t.includes('name')
    )
      return 'text';
    return 'text';
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ── Derived flags for conditional controls ───────────────────────────
  get isMeasure(): boolean {
    return this.editableField?.role === 'measure';
  }

  /** number / currency / percent share the decimals + thousands controls. */
  get isNumericFormat(): boolean {
    const kind = this.editableField?.formatHint?.kind;
    return kind === 'number' || kind === 'currency' || kind === 'percent';
  }

  get isCurrencyFormat(): boolean {
    return this.editableField?.formatHint?.kind === 'currency';
  }

  get isDateFormat(): boolean {
    const kind = this.editableField?.formatHint?.kind;
    return kind === 'date' || kind === 'datetime';
  }

  onFieldChange() {
    this.validateName();
    this.isSaveEnabled = this.hasChanges() && !this.nameError;
    this.cdr.markForCheck();
  }

  /** Compare current editable metadata against the original snapshot. */
  private hasChanges(): boolean {
    const e = this.editableField;
    const o = this.originalField;
    if (!e || !o) return false;

    if ((e.columnToView ?? '').trim() !== (o.columnToView ?? '').trim())
      return true;
    if (e.dataType !== o.dataType) return true;
    if ((e.description ?? '') !== (o.description ?? '')) return true;
    if (e.role !== o.role) return true;
    if (e.defaultAggregation !== o.defaultAggregation) return true;
    if (!!e.isVisible !== !!o.isVisible) return true;
    if ((e.typeOverride ?? '') !== (o.typeOverride ?? '')) return true;

    const ef = e.formatHint || {};
    const of = o.formatHint || {};
    if (ef.kind !== of.kind) return true;
    if ((ef.decimals ?? null) !== (of.decimals ?? null)) return true;
    if ((ef.currencyCode ?? '') !== (of.currencyCode ?? '')) return true;
    if ((ef.dateFormat ?? '') !== (of.dateFormat ?? '')) return true;
    if (!!ef.thousands !== !!of.thousands) return true;

    return false;
  }

  validateName() {
    const name = this.editableField?.columnToView?.trim() || '';
    if (!name) {
      this.nameError = this.translate.instant('VALIDATION.FIELD_NAME_REQUIRED');
    } else if (name.length < this.MIN_NAME_LENGTH) {
      this.nameError = this.translate.instant(
        'VALIDATION.FIELD_NAME_MIN_LENGTH',
        { length: this.MIN_NAME_LENGTH },
      );
    } else if (name.length > this.MAX_NAME_LENGTH) {
      this.nameError = this.translate.instant(
        'VALIDATION.FIELD_NAME_MAX_LENGTH',
        { length: this.MAX_NAME_LENGTH },
      );
    } else {
      this.nameError = '';
    }
  }

  onDataTypeChange(value: string) {
    this.editableField.dataType = value;
    this.onFieldChange();
  }

  onRoleChange(value: string) {
    this.editableField.role = value;
    // Aggregation only applies to measures — reset to 'none' when the field
    // is switched back to a dimension so we don't persist a stale agg.
    if (value !== 'measure') {
      this.editableField.defaultAggregation = 'none';
    }
    this.onFieldChange();
  }

  onAggregationChange(value: string) {
    this.editableField.defaultAggregation = value;
    this.onFieldChange();
  }

  onFormatKindChange(value: string) {
    this.editableField.formatHint = {
      ...this.editableField.formatHint,
      kind: value,
    };
    this.onFieldChange();
  }

  onDecimalsChange(value: number | null) {
    this.editableField.formatHint = {
      ...this.editableField.formatHint,
      decimals: value,
    };
    this.onFieldChange();
  }

  onThousandsChange(checked: boolean) {
    this.editableField.formatHint = {
      ...this.editableField.formatHint,
      thousands: checked,
    };
    this.onFieldChange();
  }

  onTypeOverrideChange(value: string) {
    this.editableField.typeOverride = value;
    this.onFieldChange();
  }

  onVisibleChange(checked: boolean) {
    this.editableField.isVisible = checked;
    this.onFieldChange();
  }

  /**
   * Assemble a formatHint object carrying only the keys relevant to the
   * selected kind, so we don't persist e.g. a currencyCode for a percent
   * format.
   */
  private buildFormatHint(): any {
    const fh = this.editableField.formatHint || {};
    const kind = fh.kind || 'text';
    const out: any = { kind };
    if (kind === 'number' || kind === 'currency' || kind === 'percent') {
      if (fh.decimals !== null && fh.decimals !== undefined) {
        out.decimals = fh.decimals;
      }
      out.thousands = !!fh.thousands;
    }
    if (kind === 'currency' && fh.currencyCode) {
      out.currencyCode = fh.currencyCode;
    }
    if ((kind === 'date' || kind === 'datetime') && fh.dateFormat) {
      out.dateFormat = fh.dateFormat;
    }
    return out;
  }

  onSubmit() {
    if (!this.isSaveEnabled || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    const e = this.editableField;
    const o = this.originalField;

    const payload: any = {
      fieldId: e.id,
      datasetId: e.datasetId,
      columnNameToView: e.columnToView,
    };

    // Only forward keys that actually changed so the write stays minimal.
    if (e.dataType !== o.dataType) {
      payload.dataType = e.dataType;
    }
    if ((e.description ?? '') !== (o.description ?? '')) {
      payload.description = e.description;
    }
    if (e.role !== o.role) {
      payload.role = e.role;
    }
    if (e.defaultAggregation !== o.defaultAggregation) {
      payload.defaultAggregation = e.defaultAggregation;
    }
    if (!!e.isVisible !== !!o.isVisible) {
      payload.isVisible = !!e.isVisible;
    }
    if ((e.typeOverride ?? '') !== (o.typeOverride ?? '')) {
      payload.typeOverride = e.typeOverride;
    }

    const ef = e.formatHint || {};
    const of = o.formatHint || {};
    const formatChanged =
      ef.kind !== of.kind ||
      (ef.decimals ?? null) !== (of.decimals ?? null) ||
      (ef.currencyCode ?? '') !== (of.currencyCode ?? '') ||
      (ef.dateFormat ?? '') !== (of.dateFormat ?? '') ||
      !!ef.thousands !== !!of.thousands;
    if (formatChanged) {
      payload.formatHint = this.buildFormatHint();
    }

    this.datasetService
      .updateDatasetMapping(payload)
      .then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.isSubmitting = false;
          this.close.emit({ field: this.editableField });
        } else {
          this.isSubmitting = false;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isSubmitting = false;
        this.cdr.markForCheck();
      });
  }

  onCancel() {
    this.close.emit(null);
  }
}
