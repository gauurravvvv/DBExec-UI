/**
 * FieldSidebarComponent — the live field list.
 *
 * Reads DatasetFieldsStore directly, so it re-renders the moment a field is
 * saved without anyone refetching the dataset. That is what makes the
 * create -> pick -> create loop seamless: save a formula field, see it appear
 * here, and reference it in the next formula straight away.
 *
 * Purely presentational otherwise — it emits intent and lets the host screen own
 * the dialog, so the same component drops into the dataset editor, the dataset
 * detail view and both analyses screens without change.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
} from '@angular/core';
import { DatasetFieldsStore, DatasetFieldVm } from '../../services/dataset-fields.store';

@Component({
  selector: 'app-field-sidebar',
  templateUrl: './field-sidebar.component.html',
  styleUrls: ['./field-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldSidebarComponent {
  /** Hides the "New field" action where the user lacks write access. */
  @Input() canEdit = true;

  /** Optional heading override; defaults to the shared Fields label. */
  @Input() titleKey = 'DATASET.FIELDS_TITLE';

  @Output() createRequested = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<DatasetFieldVm>();

  readonly fields = this.store.fields;
  readonly baseFields = this.store.baseFields;
  readonly customFields = this.store.customFields;

  readonly total = computed(() => this.fields().length);

  constructor(private store: DatasetFieldsStore) {}

  /**
   * Calculation-kind label for a formula field. Null for a plain column, and for
   * a formula whose stage was never recorded (a legacy row saved before the
   * engine tracked it) — the badge simply does not render rather than guessing.
   */
  stageKey(field: DatasetFieldVm): string | null {
    if (!field.isCustom || !field.stage) return null;
    switch (field.stage) {
      case 'AGG':
        return 'DATASET.STAGE_AGGREGATE';
      case 'WINDOW':
        return 'DATASET.STAGE_WINDOW';
      default:
        return 'DATASET.STAGE_ROW';
    }
  }

  stageIcon(field: DatasetFieldVm): string {
    if (field.stage === 'AGG') return 'pi pi-chart-bar';
    if (field.stage === 'WINDOW') return 'pi pi-sort-amount-down';
    return 'pi pi-list';
  }

  /**
   * Short label for the badge. The row is narrow, so the full wording lives in
   * the tooltip — but an icon alone is not readable, so the abbreviation is
   * rendered as text.
   */
  stageShortKey(field: DatasetFieldVm): string | null {
    if (!field.isCustom || !field.stage) return null;
    switch (field.stage) {
      case 'AGG':
        return 'DATASET.STAGE_AGGREGATE_SHORT';
      case 'WINDOW':
        return 'DATASET.STAGE_WINDOW_SHORT';
      default:
        return 'DATASET.STAGE_ROW_SHORT';
    }
  }

  trackById(_index: number, field: DatasetFieldVm): string {
    return field.id || field.name;
  }
}
