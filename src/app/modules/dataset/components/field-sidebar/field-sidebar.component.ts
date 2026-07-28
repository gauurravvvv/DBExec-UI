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
import { dataTypeIcon } from 'src/app/shared/helpers/data-type-icon';

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

  /**
   * Icon for a field row, from its data type.
   *
   * This used to be `pi-table` for every non-computed field, so a list of
   * twenty-six columns showed the same glyph twenty-six times and the icon column
   * carried no information at all. It now uses the app-wide data-type vocabulary,
   * so an integer, a date and a text column are distinguishable at a glance —
   * matching the dataset details page and the object explorers.
   *
   * A computed field keeps `pi-code`: what matters about it is that it is a
   * formula, not what the formula returns.
   */
  fieldIcon(field: DatasetFieldVm): string {
    if (field.isCustom) return 'pi-code';
    return dataTypeIcon(field.dataType ?? '');
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
