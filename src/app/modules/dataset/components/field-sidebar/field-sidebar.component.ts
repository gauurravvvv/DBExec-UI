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
   * Tier label for a formula field. Null for a plain column and for a formula
   * whose tier has not been resolved yet (a legacy row saved before the engine
   * recorded it), so the badge simply does not render rather than guessing.
   */
  tierKey(field: DatasetFieldVm): string | null {
    if (!field.isCustom || field.pushdownable === null) return null;
    return field.pushdownable
      ? 'DATASET.FORMULA_AT_SOURCE'
      : 'DATASET.FORMULA_AFTER_QUERY';
  }

  tierIcon(field: DatasetFieldVm): string {
    return field.pushdownable ? 'pi pi-database' : 'pi pi-calculator';
  }

  trackById(_index: number, field: DatasetFieldVm): string {
    return field.id || field.name;
  }
}
