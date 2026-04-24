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
  @Input() dialogTitle = 'Edit Field';
  @Output() close = new EventEmitter<any>();

  editableField: any = null;
  originalField: any = null;
  isSaveEnabled = false;
  isSubmitting = false;
  analyticalTypes = ANALYTICAL_TYPES;
  nameError = '';

  readonly MIN_NAME_LENGTH = 1;
  readonly MAX_NAME_LENGTH = 128;

  saving = this.datasetService.saving;

  constructor(
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

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
      this.editableField = { ...this.field, dataType: normalizedType };
      this.originalField = { ...this.field, dataType: normalizedType };
      this.isSaveEnabled = false;
      this.isSubmitting = false;
    }
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

  onFieldChange() {
    this.validateName();
    // Enable save button if columnToView or dataType has changed and name is valid
    const nameChanged =
      this.editableField?.columnToView?.trim() !==
      this.originalField?.columnToView?.trim();
    const typeChanged =
      this.editableField?.dataType !== this.originalField?.dataType;
    this.isSaveEnabled = (nameChanged || typeChanged) && !this.nameError;
  }

  validateName() {
    const name = this.editableField?.columnToView?.trim() || '';
    if (!name) {
      this.nameError = 'Field name is required';
    } else if (name.length < this.MIN_NAME_LENGTH) {
      this.nameError = `Field name must be at least ${this.MIN_NAME_LENGTH} character`;
    } else if (name.length > this.MAX_NAME_LENGTH) {
      this.nameError = `Field name must not exceed ${this.MAX_NAME_LENGTH} characters`;
    } else {
      this.nameError = '';
    }
  }

  onDataTypeChange(value: string) {
    this.editableField.dataType = value;
    this.onFieldChange();
  }

  onSubmit() {
    if (!this.isSaveEnabled || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    const payload: any = {
      fieldId: this.editableField.id,
      datasetId: this.editableField.datasetId,
      columnNameToView: this.editableField.columnToView,
      organisation: this.editableField.organisationId,
    };

    // Include dataType if it changed
    if (this.editableField.dataType !== this.originalField.dataType) {
      payload.dataType = this.editableField.dataType;
    }

    this.datasetService.updateDatasetMapping(payload).then(response => {
      if (this.globalService.handleSuccessService(response, true)) {
        this.isSubmitting = false;
        this.close.emit({ field: this.editableField });
      } else {
        this.isSubmitting = false;
      }
      this.cdr.markForCheck();
    }).catch(() => {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    });
  }

  onCancel() {
    this.close.emit(null);
  }
}
