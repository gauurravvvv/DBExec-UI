import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { AnalysesService } from '../../services/analyses.service';

export interface ConfiguredFilter {
  tempId: string;
  name: string;
  columnName: string;
  filterType: string;
  controlType: string;
  config: any;
  nullOption: string;
  isEnabled: boolean;
  isMandatory: boolean;
  sequence: number;
}

export const FILTER_OPERATOR_KEYS: Record<
  string,
  { labelKey: string; value: string }[]
> = {
  category: [
    { labelKey: 'ANALYSES.OPERATOR_EQUALS', value: 'EQUALS' },
    { labelKey: 'ANALYSES.OPERATOR_DOES_NOT_EQUAL', value: 'DOES_NOT_EQUAL' },
    { labelKey: 'ANALYSES.OPERATOR_CONTAINS', value: 'CONTAINS' },
    {
      labelKey: 'ANALYSES.OPERATOR_DOES_NOT_CONTAIN',
      value: 'DOES_NOT_CONTAIN',
    },
    { labelKey: 'ANALYSES.OPERATOR_STARTS_WITH', value: 'STARTS_WITH' },
    { labelKey: 'ANALYSES.OPERATOR_ENDS_WITH', value: 'ENDS_WITH' },
  ],
  numeric_equality: [
    { labelKey: 'ANALYSES.OPERATOR_EQUALS', value: 'EQUALS' },
    { labelKey: 'ANALYSES.OPERATOR_NOT_EQUALS', value: 'NOT_EQUALS' },
    { labelKey: 'ANALYSES.OPERATOR_GREATER_THAN', value: 'GREATER_THAN' },
    {
      labelKey: 'ANALYSES.OPERATOR_GREATER_THAN_OR_EQUAL',
      value: 'GREATER_THAN_OR_EQUAL',
    },
    { labelKey: 'ANALYSES.OPERATOR_LESS_THAN', value: 'LESS_THAN' },
    {
      labelKey: 'ANALYSES.OPERATOR_LESS_THAN_OR_EQUAL',
      value: 'LESS_THAN_OR_EQUAL',
    },
  ],
  numeric_range: [{ labelKey: 'ANALYSES.OPERATOR_BETWEEN', value: 'BETWEEN' }],
  time_equality: [
    { labelKey: 'ANALYSES.OPERATOR_EQUALS', value: 'EQUALS' },
    { labelKey: 'ANALYSES.OPERATOR_BEFORE', value: 'BEFORE' },
    { labelKey: 'ANALYSES.OPERATOR_AFTER', value: 'AFTER' },
  ],
  time_range: [{ labelKey: 'ANALYSES.OPERATOR_BETWEEN', value: 'BETWEEN' }],
};

export const NULL_OPTION_KEYS = [
  { labelKey: 'ANALYSES.NULL_ALL_VALUES', value: 'ALL_VALUES' },
  { labelKey: 'ANALYSES.NULL_NON_NULLS_ONLY', value: 'NON_NULLS_ONLY' },
  { labelKey: 'ANALYSES.NULL_NULLS_ONLY', value: 'NULLS_ONLY' },
];

export const DATE_FORMAT_OPTIONS = [
  { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
  { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
  { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
  { label: 'DD-MM-YYYY', value: 'dd-mm-yy' },
  { label: 'MM-DD-YYYY', value: 'mm-dd-yy' },
  { label: 'YYYY/MM/DD', value: 'yy/mm/dd' },
  { label: 'DD.MM.YYYY', value: 'dd.mm.yy' },
];

@Component({
  selector: 'app-filter-dialog',
  templateUrl: './filter-dialog.component.html',
  // Each child component owns its own stylesheet. The dialog renders
  // through PrimeNG's overlay (attached to <body>), so the SCSS uses
  // :host ::ng-deep scoped to .filter-config-dialog to reach the
  // overlay DOM without leaking to other dialogs.
  styleUrls: ['./filter-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterDialogComponent implements OnChanges {
  @Input() visible: boolean = false;
  @Input() editingFilter: ConfiguredFilter | null = null;
  @Input() datasetFields: any[] = [];
  @Input() datasetId: string = '';
  @Input() orgId: string = '';
  @Input() analysisId: string = '';
  @Input() configuredFiltersCount: number = 0;

  @Output() visibleChange = new EventEmitter<boolean>();
  /**
   * Emits the saved filter row so the parent can dispatch a precise
   * store update (filterSaved) instead of refetching the whole list.
   * Old void-event consumers still work — they'll just ignore the
   * payload.
   */
  @Output() saved = new EventEmitter<any>();

  // Form fields
  filterDialogColumn: any = null;
  filterDialogType: string = '';
  filterDialogControl: string = '';
  filterDialogName: string = '';
  filterDialogEnabled: boolean = true;
  filterDialogMandatory: boolean = false;
  filterDialogOperator: string = '';
  filterDialogNullOption: string = 'ALL_VALUES';
  filterDialogDefaultValue: any = null;
  filterDialogPlaceholder: string = '';
  filterDialogIncludeTime: boolean = false;
  filterDialogDateFormat: string = 'yy-mm-dd';
  filterDialogCategoryValues: any[] = [];
  /**
   * Saved default values that are NOT in the freshly-loaded
   * filterDialogCategoryValues. Populated by recomputeStaleDefaults()
   * after the picker options resolve. Rendered as a warning row above
   * the multiselect so the user knows what's about to be re-saved as
   * stale.
   *
   * Stored as the raw saved values (strings/numbers) for direct render;
   * comparison is case- and whitespace-insensitive against the live
   * option labels.
   */
  filterDialogStaleDefaults: string[] = [];
  isLoadingFilterValues: boolean = false;
  isSavingFilter: boolean = false;

  /**
   * Save is disabled when any required field is missing OR while a
   * save is in flight. Exposed as a getter so the template can both
   * bind it to [disabled] and use it to decide whether the
   * "why is this disabled" tooltip should show.
   */
  get isSaveDisabled(): boolean {
    return (
      !this.filterDialogColumn ||
      !this.filterDialogType ||
      !this.filterDialogControl ||
      this.isSavingFilter
    );
  }

  /**
   * Tooltip body shown over the disabled Save button. Empty string
   * during in-flight save (no need to nag the user — they can see
   * the spinner). The hint surfaces the same three requirements
   * encoded in the disabled-binding above, so the user never has to
   * guess why the button is greyed out.
   */
  get saveDisabledHint(): string {
    if (this.isSavingFilter) return '';
    return this.translate.instant('ANALYSES.FILTER_SAVE_DISABLED_HINT');
  }

  // Dropdown options
  filterTypeOptions: { label: string; value: string }[] = [];
  controlTypeOptions: { label: string; value: string }[] = [];
  operatorOptions: { label: string; value: string }[] = [];
  nullOptions: { label: string; value: string }[] = [];
  dateFormatOptions = DATE_FORMAT_OPTIONS;

  private columnValuesCache: {
    [columnName: string]: { label: string; value: string }[];
  } = {};

  constructor(
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private datasetService: DatasetService,
    private translate: TranslateService,
  ) {
    this.filterTypeOptions = [
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_CATEGORY'),
        value: 'category',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_EXACT'),
        value: 'numeric_equality',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_RANGE'),
        value: 'numeric_range',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_EXACT'),
        value: 'time_equality',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_RANGE'),
        value: 'time_range',
      },
    ];
    this.nullOptions = NULL_OPTION_KEYS.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.editingFilter) {
        this.populateFromFilter(this.editingFilter);
      } else {
        this.resetForm();
      }
    }
  }

  private populateFromFilter(filter: ConfiguredFilter): void {
    this.filterDialogColumn =
      this.datasetFields?.find(
        (f: any) =>
          f.columnName === filter.columnName ||
          f.columnToView === filter.columnName ||
          f.columnToUse === filter.columnName,
      ) || null;
    this.filterDialogType = filter.filterType;
    this.filterDialogControl = filter.controlType;
    this.filterDialogName = filter.name;
    this.filterDialogEnabled = filter.isEnabled;
    this.filterDialogMandatory = filter.isMandatory;

    const config = filter.config || {};
    this.filterDialogOperator = config.matchOperator || '';
    this.filterDialogNullOption = filter.nullOption || 'ALL_VALUES';
    this.filterDialogPlaceholder = config.placeholder || '';
    this.filterDialogIncludeTime = config.includeTime || false;
    this.filterDialogDateFormat = config.dateFormat || 'yy-mm-dd';
    this.filterDialogDefaultValue = this.extractDefaultValue(
      config,
      filter.filterType,
    );

    this.updateControlTypeOptions();
    this.updateOperatorOptions();

    if (filter.filterType === 'category') {
      this.loadColumnDistinctValues();
    }
  }

  private resetForm(): void {
    this.filterDialogColumn = null;
    this.filterDialogType = '';
    this.filterDialogControl = '';
    this.filterDialogName = '';
    this.filterDialogEnabled = true;
    this.filterDialogMandatory = false;
    this.filterDialogOperator = '';
    this.filterDialogNullOption = 'ALL_VALUES';
    this.filterDialogDefaultValue = null;
    this.filterDialogPlaceholder = '';
    this.filterDialogIncludeTime = false;
    this.filterDialogDateFormat = 'yy-mm-dd';
    this.filterDialogCategoryValues = [];
    this.filterDialogStaleDefaults = [];
    this.isLoadingFilterValues = false;
    this.controlTypeOptions = [];
    this.operatorOptions = [];
  }

  onDialogHide(): void {
    this.visibleChange.emit(false);
  }

  cancel(): void {
    this.visibleChange.emit(false);
  }

  async save(): Promise<void> {
    if (
      !this.filterDialogColumn ||
      !this.filterDialogType ||
      !this.filterDialogControl
    )
      return;

    if (this.filterDialogType === 'numeric_range') {
      const val = this.filterDialogDefaultValue;
      if (
        val?.min !== null &&
        val?.min !== undefined &&
        val?.max !== null &&
        val?.max !== undefined &&
        Number(val.min) > Number(val.max)
      ) {
        this.globalService.handleErrorService({
          status: false,
          message: this.translate.instant(
            'VALIDATION.RANGE_MIN_GREATER_THAN_MAX',
          ),
        });
        return;
      }
    }

    if (this.filterDialogType === 'time_range') {
      const val = this.filterDialogDefaultValue;
      if (
        Array.isArray(val) &&
        val[0] instanceof Date &&
        val[1] instanceof Date &&
        val[0].getTime() > val[1].getTime()
      ) {
        this.globalService.handleErrorService({
          status: false,
          message: this.translate.instant('VALIDATION.START_DATE_AFTER_END'),
        });
        return;
      }
    }

    const columnName =
      this.filterDialogColumn.columnName ||
      this.filterDialogColumn.columnToView;
    const name = this.filterDialogName || this.filterDialogColumn.columnToView;

    const config: any = {};
    if (this.filterDialogOperator) {
      config.matchOperator = this.filterDialogOperator;
    }
    if (this.filterDialogPlaceholder) {
      config.placeholder = this.filterDialogPlaceholder;
    }
    if (
      this.filterDialogType === 'time_equality' ||
      this.filterDialogType === 'time_range'
    ) {
      config.includeTime = this.filterDialogIncludeTime;
      config.dateFormat = this.filterDialogDateFormat;
    }
    this.buildDefaultValueConfig(config, this.filterDialogType);

    this.isSavingFilter = true;

    try {
      let res: any;
      if (this.editingFilter) {
        res = await this.analysesService.updateFilter({
          id: this.editingFilter.tempId,
          organisation: this.orgId,
          name,
          columnName,
          filterType: this.filterDialogType,
          controlType: this.filterDialogControl,
          config,
          nullOption: this.filterDialogNullOption || 'ALL_VALUES',
          isEnabled: this.filterDialogEnabled,
          isMandatory: this.filterDialogMandatory,
          sequence: this.editingFilter.sequence,
        });
      } else {
        res = await this.analysesService.addFilters({
          analysisId: this.analysisId,
          organisation: this.orgId,
          filters: [
            {
              name,
              columnName,
              filterType: this.filterDialogType,
              controlType: this.filterDialogControl,
              config,
              nullOption: this.filterDialogNullOption || 'ALL_VALUES',
              isEnabled: this.filterDialogEnabled,
              isMandatory: this.filterDialogMandatory,
              sequence: this.configuredFiltersCount,
            },
          ],
        });
      }

      if (this.globalService.handleSuccessService(res, true)) {
        const stale: any[] = res?.data?.staleDefaults ?? [];
        if (Array.isArray(stale) && stale.length > 0) {
          this.surfaceStaleDefaultsWarning(stale);
        }
        // The BE returns different shapes for add vs update:
        //   add    → data.filters: SavedFilter[]
        //   update → data.filter:  SavedFilter
        // Normalise to a single saved row so the parent can dispatch
        // filterSaved with it. We assume single-filter saves (which
        // matches the current dialog flow).
        const savedFilter =
          res?.data?.filter ??
          (Array.isArray(res?.data?.filters) ? res.data.filters[0] : null);
        this.visibleChange.emit(false);
        this.saved.emit(savedFilter);
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    } finally {
      this.isSavingFilter = false;
    }
  }

  /**
   * Raise a non-blocking warn toast when the BE flagged saved defaults
   * as already missing from the dataset. The save itself succeeded —
   * this is advisory so the user can come back and fix the config
   * before the next dashboard view.
   *
   * Routes through GlobalService.showWarn so toast styling and
   * severity stay consistent with the rest of the app (the previous
   * direct MessageService call was a small abstraction leak).
   */
  private surfaceStaleDefaultsWarning(stale: any[]): void {
    const totalCount = stale.reduce(
      (acc: number, r: any) => acc + (r?.values?.length ?? 0),
      0,
    );
    const summary = this.translate.instant(
      'ANALYSES.FILTER_SAVED_WITH_WARNING',
    );
    if (totalCount === 0) {
      // Filter-level error (e.g. column_missing) with no specific
      // values. Use the per-filter message verbatim.
      const detail = stale
        .map((r: any) => r?.message)
        .filter(Boolean)
        .join(' — ');
      if (!detail) return;
      this.globalService.showWarn(detail, summary);
      return;
    }
    const detail = this.translate.instant(
      'ANALYSES.FILTER_SAVED_WITH_STALE_DEFAULTS',
      { count: totalCount },
    );
    this.globalService.showWarn(detail, summary);
  }

  /**
   * Fires when the filter TYPE changes (Category, Numeric Exact,
   * Numeric Range, Date Exact, Date Range). Filter type is the
   * root of every other config decision — control type, operator,
   * default value shape, time-mode toggles, category options — so
   * changing it must scrub all dependent state back to a coherent
   * baseline.
   *
   * Why we reset things that are technically reusable (placeholder,
   * null handling): they're tied to the *meaning* of the previous
   * type. A placeholder like "Search by region" no longer makes
   * sense after a switch to Numeric Range; the saved "Nulls Only"
   * choice for a category filter doesn't carry the same intent
   * when the field is now numeric. Wiping them yields predictable,
   * non-surprising defaults; users keep what they typed when it
   * still applies via the per-field handlers, not here.
   *
   * Edit-mode is safe: this method only runs in response to the
   * type dropdown's change event. populateFromFilter() bypasses it
   * and rehydrates everything from the saved row.
   */
  onFilterTypeChange(): void {
    // ── Dependent option lists ────────────────────────────────────
    // Recompute controls + operators FIRST so the auto-pick below
    // sees the new list shape.
    this.updateControlTypeOptions();
    this.updateOperatorOptions();

    if (this.controlTypeOptions.length > 0) {
      this.filterDialogControl = this.controlTypeOptions[0].value;
    } else {
      this.filterDialogControl = '';
    }
    if (this.operatorOptions.length > 0) {
      this.filterDialogOperator = this.operatorOptions[0].value;
    } else {
      this.filterDialogOperator = '';
    }

    // ── Null-handling semantics ──────────────────────────────────
    // 'ALL_VALUES' is the safe default for every filter type. Any
    // previous choice ('NULLS_ONLY', 'NON_NULLS_ONLY') was tied to
    // the previous type's value distribution and may not make sense
    // anymore — easier to re-pick than to silently keep a stale one.
    this.filterDialogNullOption = 'ALL_VALUES';

    // ── Time-mode toggles ────────────────────────────────────────
    // Only relevant for time_equality / time_range; reset for
    // everything else so a stale "include time" doesn't leak into
    // a numeric or category save.
    const isTimeType =
      this.filterDialogType === 'time_equality' ||
      this.filterDialogType === 'time_range';
    if (!isTimeType) {
      this.filterDialogIncludeTime = false;
      this.filterDialogDateFormat = 'yy-mm-dd';
    }

    // ── Cosmetic placeholder ─────────────────────────────────────
    // The placeholder text usually references the previous type's
    // semantics ("Search by region", "Enter date"). After a type
    // change those hints are misleading. Wipe to empty so the user
    // sees the input's built-in placeholder and can re-author one.
    this.filterDialogPlaceholder = '';

    // ── Default value shape ──────────────────────────────────────
    // Match the new filter type. Category delegates to a helper
    // because its shape depends on the freshly-picked control
    // (single → '', multi → []); every other type has one shape.
    if (this.filterDialogType === 'numeric_range') {
      this.filterDialogDefaultValue = { min: null, max: null };
    } else if (this.filterDialogType === 'time_range') {
      this.filterDialogDefaultValue = null;
    } else if (this.filterDialogType === 'category') {
      this.resetCategoryDefault();
    } else {
      this.filterDialogDefaultValue = null;
    }

    // ── Cross-type-only state ────────────────────────────────────
    // Category-specific buckets (distinct values list, stale
    // warnings) only have meaning when filter type IS category.
    // Always clear, then re-load if we're going *into* category.
    this.filterDialogStaleDefaults = [];

    if (this.filterDialogType === 'category' && this.filterDialogColumn) {
      this.loadColumnDistinctValues();
    } else {
      this.filterDialogCategoryValues = [];
    }
  }

  /**
   * Fires when the user changes the control type (Single Select ↔
   * Multi Select for category, Slider ↔ Text for numeric_range, etc.).
   * The data shape consumed by the default-value widget changes when
   * the control flips between single and multi, so we reshape the
   * model and drop the stale-defaults warning bucket.
   *
   * Only category has a single/multi split today. Everything else
   * is a no-op here — the value shape stays the same across that
   * filter type's control options.
   */
  onControlTypeChange(): void {
    if (this.filterDialogType === 'category') {
      this.resetCategoryDefault();
      this.filterDialogStaleDefaults = [];
    }
  }

  /**
   * Seed filterDialogDefaultValue with the shape the active category
   * control expects. Single Select = '' (no value picked yet), Multi
   * Select = []. Keeping this in one helper means onFilterTypeChange
   * and onControlTypeChange stay symmetric.
   */
  private resetCategoryDefault(): void {
    this.filterDialogDefaultValue =
      this.filterDialogControl === 'dropdown' ? '' : [];
  }

  onDateFormatChange(): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    if (val instanceof Date) {
      this.filterDialogDefaultValue = new Date(val.getTime());
    } else if (Array.isArray(val)) {
      this.filterDialogDefaultValue = val.map((d: Date | null) =>
        d instanceof Date ? new Date(d.getTime()) : d,
      );
    }
  }

  onIncludeTimeChange(): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    if (!this.filterDialogIncludeTime) {
      if (val instanceof Date) {
        this.filterDialogDefaultValue = new Date(
          val.getFullYear(),
          val.getMonth(),
          val.getDate(),
        );
      } else if (Array.isArray(val)) {
        this.filterDialogDefaultValue = val.map((d: Date | null) =>
          d instanceof Date
            ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
            : d,
        );
      }
    } else {
      this.onDateFormatChange();
    }
  }

  onFilterColumnChange(): void {
    if (this.filterDialogColumn && !this.filterDialogName) {
      this.filterDialogName = this.filterDialogColumn.columnToView;
    }
    if (this.filterDialogColumn) {
      this.loadColumnDistinctValues();
    }
  }

  private updateControlTypeOptions(): void {
    switch (this.filterDialogType) {
      case 'category':
        this.controlTypeOptions = [
          {
            label: this.translate.instant('ANALYSES.CONTROL_DROPDOWN'),
            value: 'dropdown',
          },
          {
            label: this.translate.instant('ANALYSES.CONTROL_MULTI_SELECT'),
            value: 'list',
          },
        ];
        break;
      case 'numeric_equality':
        this.controlTypeOptions = [
          {
            label: this.translate.instant('ANALYSES.CONTROL_TEXT_INPUT'),
            value: 'text',
          },
          {
            label: this.translate.instant('ANALYSES.CONTROL_DROPDOWN'),
            value: 'dropdown',
          },
        ];
        break;
      case 'numeric_range':
        this.controlTypeOptions = [
          {
            label: this.translate.instant('ANALYSES.CONTROL_SLIDER'),
            value: 'slider',
          },
          {
            label: this.translate.instant('ANALYSES.CONTROL_TEXT_INPUT'),
            value: 'text',
          },
        ];
        break;
      case 'time_equality':
      case 'time_range':
        this.controlTypeOptions = [
          {
            label: this.translate.instant('ANALYSES.CONTROL_DATE_PICKER'),
            value: 'datepicker',
          },
        ];
        break;
      default:
        this.controlTypeOptions = [];
    }
  }

  private updateOperatorOptions(): void {
    const keys = FILTER_OPERATOR_KEYS[this.filterDialogType] || [];
    this.operatorOptions = keys.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
  }

  async loadColumnDistinctValues(): Promise<void> {
    if (
      !this.filterDialogColumn ||
      !this.datasetId ||
      !this.orgId ||
      !this.analysisId
    )
      return;

    const colName =
      this.filterDialogColumn.columnName ||
      this.filterDialogColumn.columnToUse ||
      this.filterDialogColumn.columnToView;

    if (!colName) return;

    if (this.columnValuesCache[colName]) {
      this.filterDialogCategoryValues = this.columnValuesCache[colName];
      return;
    }

    this.isLoadingFilterValues = true;
    this.filterDialogCategoryValues = [];

    try {
      // Unified analysis-scoped endpoint — handles both raw dataset
      // columns AND custom fields (dataset-level + analysis-level).
      // BE picks the path internally based on the field's customLogic.
      const res: any = await this.analysesService.getDistinctFieldValues(
        this.orgId,
        this.analysisId,
        colName,
      );
      if (res?.status && res.data) {
        // New endpoint always returns the paged shape — { values: [{value, label}], total, ... }.
        const raw = Array.isArray(res.data?.values) ? res.data.values : [];
        const mapped = raw.map((v: any) => ({
          label: v?.label !== undefined ? String(v.label) : String(v?.value),
          value: v?.value === null ? '' : String(v?.value),
        }));
        this.columnValuesCache[colName] = mapped;
        this.filterDialogCategoryValues = mapped;
      }
    } catch (err) {
      console.error('Failed to load distinct values', err);
    } finally {
      this.isLoadingFilterValues = false;
      // Reconcile any saved-but-missing defaults against the freshly
      // loaded options. The user sees a warning row before they Save,
      // so they don't accidentally re-persist a value that's already
      // gone from source.
      this.recomputeStaleDefaults();
    }
  }

  /**
   * Split `filterDialogDefaultValue` into "present" (still in
   * filterDialogCategoryValues) and "stale" (not). Stale values stay
   * in the model so the multiselect still shows them as selected
   * chips, but we surface a warning row + a one-click "Remove stale"
   * action in the template.
   *
   * Matching is case- and whitespace-insensitive — saved 'Marketing '
   * with a trailing space should still match live 'Marketing'.
   *
   * Called every time the options list changes (column switch,
   * dialog open with existing filter).
   */
  recomputeStaleDefaults(): void {
    if (this.filterDialogType !== 'category') {
      this.filterDialogStaleDefaults = [];
      return;
    }
    const dv = this.filterDialogDefaultValue;
    if (dv === null || dv === undefined || dv === '') {
      this.filterDialogStaleDefaults = [];
      return;
    }
    const saved: string[] = (Array.isArray(dv) ? dv : [dv])
      .filter(v => v !== null && v !== undefined && v !== '')
      .map(v => String(v));
    if (saved.length === 0) {
      this.filterDialogStaleDefaults = [];
      return;
    }
    const liveNorm = new Set(
      (this.filterDialogCategoryValues || []).map(o =>
        String(o.value ?? '')
          .trim()
          .toLowerCase(),
      ),
    );
    this.filterDialogStaleDefaults = saved.filter(
      v => !liveNorm.has(v.trim().toLowerCase()),
    );
  }

  /**
   * Drop the stale entries from `filterDialogDefaultValue`. The user
   * clicks the "Remove stale" button in the warning row; we strip
   * them from the model and recompute (should yield [] now). The
   * actual persistence still requires a Save click.
   */
  removeStaleDefaults(): void {
    const dv = this.filterDialogDefaultValue;
    if (dv === null || dv === undefined) return;
    const stale = new Set(
      this.filterDialogStaleDefaults.map(s => s.trim().toLowerCase()),
    );
    const next = (Array.isArray(dv) ? dv : [dv]).filter(
      v =>
        v !== null &&
        v !== undefined &&
        v !== '' &&
        !stale.has(String(v).trim().toLowerCase()),
    );
    // Preserve single-vs-array shape; multi-select expects array.
    this.filterDialogDefaultValue = Array.isArray(dv)
      ? next
      : (next[0] ?? null);
    this.recomputeStaleDefaults();
  }

  private extractDefaultValue(config: any, filterType: string): any {
    switch (filterType) {
      case 'category': {
        // Shape depends on the saved control type. Single Select stores
        // a scalar string ('' when empty); Multi Select stores an
        // array. Honour whichever shape was saved — coerce only when
        // we're confident the shape mismatches the active control.
        const raw = config.defaultValue ?? config.categoryValues;
        if (this.filterDialogControl === 'dropdown') {
          if (Array.isArray(raw)) return raw[0] ?? '';
          return raw ?? '';
        }
        if (Array.isArray(raw)) return raw;
        return raw ? [raw] : [];
      }
      case 'numeric_equality':
        return config.defaultValue ?? null;
      case 'numeric_range':
        return {
          min: config.rangeMin ?? null,
          max: config.rangeMax ?? null,
        };
      case 'time_equality':
        return config.defaultValue ? new Date(config.defaultValue) : null;
      case 'time_range':
        const dates: Date[] = [];
        if (config.dateRangeStart) dates.push(new Date(config.dateRangeStart));
        if (config.dateRangeEnd) dates.push(new Date(config.dateRangeEnd));
        return dates.length > 0 ? dates : null;
      default:
        return null;
    }
  }

  private buildDefaultValueConfig(config: any, filterType: string): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    switch (filterType) {
      case 'category':
        // Persist whichever shape the active control produces:
        // Single Select → scalar string, Multi Select → array. The
        // BE reads whatever shape we send and the load path here
        // reshapes on the way back out (see extractDefaultValue).
        if (this.filterDialogControl === 'dropdown') {
          if (typeof val === 'string' && val !== '') {
            config.defaultValue = val;
          }
        } else if (Array.isArray(val) && val.length > 0) {
          config.defaultValue = val;
        }
        break;
      case 'numeric_equality':
        if (val !== null && val !== '') {
          config.defaultValue = val;
        }
        break;
      case 'numeric_range':
        if (val?.min !== null && val?.min !== undefined) {
          config.rangeMin = val.min;
        }
        if (val?.max !== null && val?.max !== undefined) {
          config.rangeMax = val.max;
        }
        break;
      case 'time_equality':
        if (val) {
          config.defaultValue = val instanceof Date ? val.toISOString() : val;
        }
        break;
      case 'time_range':
        if (Array.isArray(val) && val[0]) {
          config.dateRangeStart =
            val[0] instanceof Date ? val[0].toISOString() : val[0];
        }
        if (Array.isArray(val) && val[1]) {
          config.dateRangeEnd =
            val[1] instanceof Date ? val[1].toISOString() : val[1];
        }
        break;
    }
  }
}
