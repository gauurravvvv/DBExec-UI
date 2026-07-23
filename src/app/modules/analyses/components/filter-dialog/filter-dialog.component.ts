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
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { AnalysesService } from '../../services/analyses.service';
import { suggestFilterType, toValueType } from '../../utils/field-type.util';
import {
  RELATIVE_DATE_PRESETS,
  RelativeDatePreset,
  isRelativePreset,
  resolveRelativePreset,
} from './relative-date-presets.util';

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
  // Filter scope (Track B) — which visuals this filter re-runs when
  // applied. 'dashboard' (default) = all; 'tab' = one tab's visuals;
  // 'visual' = an explicit list.
  scope?: FilterScope;
  targetTabId?: string | null;
  targetVisualIds?: string[];
}

/** Allowed filter scopes (mirror of FILTER_SCOPE_VALUES). */
export type FilterScope = 'dashboard' | 'tab' | 'visual';

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
  @Input() analysisId: string = '';
  @Input() configuredFiltersCount: number = 0;
  /** Tab options for the scope=tab target dropdown ({ label, value }). */
  @Input() tabOptions: { label: string; value: string }[] = [];
  /** Visual options for the scope=visual target multiselect. */
  @Input() visualOptions: { label: string; value: string }[] = [];

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
  // Scope authoring (Track B). Default 'dashboard' = re-runs all visuals.
  filterDialogScope: FilterScope = 'dashboard';
  filterDialogTargetTabId: string | null = null;
  filterDialogTargetVisualIds: string[] = [];
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

  // ── Relative-date preset (Slice D, item 2) ───────────────────────
  // For time_range filters only. 'custom' keeps the absolute date-range
  // picker; every other value is resolved live by the filter bar at
  // apply time. Persisted on config.relativePreset.
  filterDialogRelativePreset: RelativeDatePreset = 'custom';

  // ── Curated category allow-list (Slice D, item 5) ────────────────
  // When ON for a category filter, the runtime dropdown is restricted
  // to this curated subset (persisted on config.categoryValues) rather
  // than every distinct value in the source. The default value is
  // constrained to the allow-list at save.
  filterDialogRestrictCategory: boolean = false;
  filterDialogCategoryAllowList: any[] = [];

  // ── Cascading / linked filters (Slice D, item 3) ─────────────────
  // Optional parent filter id (persisted on config.dependsOnFilterId).
  // When set, the runtime bar re-fetches this filter's options
  // constrained by the parent's current selection.
  filterDialogDependsOnFilterId: string | null = null;
  /** Sibling filters (this analysis) eligible as a cascade parent. */
  parentFilterOptions: { label: string; value: string }[] = [];

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
  /** Relative-date preset dropdown options (built in the constructor). */
  relativePresetOptions: { label: string; value: RelativeDatePreset }[] = [];

  private columnValuesCache: {
    [columnName: string]: { label: string; value: string }[];
  } = {};

  // ── DB-driven option caches (reference-data families) ───────────────
  // Populated in the constructor from the reference-data service. Each
  // falls back to the hardcoded constant in this file when its family is
  // absent / the fetch failed, so the dialog always renders.
  //   filter_operator  → operators, keyed by filter_type via row.meta.filterType
  //   filter_null_option, filter_type, filter_control, relative_date_preset
  private dbFilterOperators: Record<
    string,
    { label: string; value: string }[]
  > | null = null;
  private dbControlOptions: Record<
    string,
    { label: string; value: string }[]
  > | null = null;

  constructor(
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private datasetService: DatasetService,
    private translate: TranslateService,
    private referenceData: ReferenceDataService,
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
    this.scopeOptions = [
      {
        label: this.translate.instant('ANALYSES.FILTER.SCOPE_DASHBOARD'),
        value: 'dashboard',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER.SCOPE_TAB'),
        value: 'tab',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER.SCOPE_VISUAL'),
        value: 'visual',
      },
    ];
    this.relativePresetOptions = RELATIVE_DATE_PRESETS.map(p => ({
      label: this.translate.instant(p.labelKey),
      value: p.value,
    }));
    this.loadReferenceOptions();
  }

  /** Scope dropdown options (dashboard / tab / visual). */
  scopeOptions: { label: string; value: FilterScope }[] = [];

  /**
   * DB-driven option lists for the filter dialog. Each subscription
   * overwrites the corresponding fallback (the hardcoded constants /
   * translate-seeded arrays in this file) with DB rows once they resolve.
   * Families:
   *   filter_type          → filterTypeOptions
   *   filter_operator      → operators, grouped by meta.filterType
   *   filter_control       → control options, grouped by meta.filterType
   *   filter_null_option   → nullOptions
   *   relative_date_preset → relativePresetOptions
   */
  private loadReferenceOptions(): void {
    this.referenceData.getFamily('filter_type').subscribe(rows => {
      if (rows.length) {
        this.filterTypeOptions = rows.map(r => ({
          label: r.label,
          value: r.code,
        }));
      }
    });
    this.referenceData.getFamily('filter_operator').subscribe(rows => {
      if (rows.length) {
        const grouped: Record<string, { label: string; value: string }[]> = {};
        for (const r of rows) {
          const key = r.meta?.filterType ?? '';
          (grouped[key] ??= []).push({ label: r.label, value: r.code });
        }
        this.dbFilterOperators = grouped;
        // Re-derive the currently-shown operator list if a type is picked.
        if (this.filterDialogType) this.updateOperatorOptions();
      }
    });
    this.referenceData.getFamily('filter_control').subscribe(rows => {
      if (rows.length) {
        const grouped: Record<string, { label: string; value: string }[]> = {};
        for (const r of rows) {
          const key = r.meta?.filterType ?? '';
          (grouped[key] ??= []).push({ label: r.label, value: r.code });
        }
        this.dbControlOptions = grouped;
        if (this.filterDialogType) this.updateControlTypeOptions();
      }
    });
    this.referenceData.getFamily('filter_null_option').subscribe(rows => {
      if (rows.length) {
        this.nullOptions = rows.map(r => ({ label: r.label, value: r.code }));
      }
    });
    this.referenceData.getFamily('relative_date_preset').subscribe(rows => {
      if (rows.length) {
        this.relativePresetOptions = rows.map(r => ({
          label: r.label,
          value: r.code as RelativeDatePreset,
        }));
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.editingFilter) {
        this.populateFromFilter(this.editingFilter);
      } else {
        this.resetForm();
      }
      // Load the analysis's other filters so the cascade "depends on"
      // dropdown (item 3) has candidate parents. Excludes self when
      // editing so a filter can't depend on itself.
      this.loadParentFilterOptions();
    }
  }

  /**
   * Populate parentFilterOptions with sibling filters usable as a
   * cascade parent. Fetched lazily on dialog-open so the dialog stays
   * self-contained (no new @Input threaded from the editor). A parent
   * must be a category filter (its selection narrows a child's options
   * via an extra WHERE), can't be the filter being edited, and can't
   * itself already depend on this filter (avoids a 2-cycle).
   */
  private async loadParentFilterOptions(): Promise<void> {
    this.parentFilterOptions = [];
    if (!this.analysisId) return;
    try {
      const res: any = await this.analysesService.listFilters(this.analysisId);
      const rows: any[] = Array.isArray(res?.data) ? res.data : [];
      const selfId = this.editingFilter?.tempId ?? null;
      this.parentFilterOptions = rows
        .filter(
          f =>
            f.filterType === 'category' &&
            f.id !== selfId &&
            // Guard against the trivial cycle: a candidate parent that
            // already points back at us can't also be our parent.
            (f.config?.dependsOnFilterId ?? null) !== selfId,
        )
        .map(f => ({ label: f.name, value: f.id }));
    } catch (err) {
      // Non-fatal — the cascade picker just shows no candidates.
      console.error('Failed to load parent filter options', err);
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
    this.filterDialogScope = filter.scope || 'dashboard';
    this.filterDialogTargetTabId = filter.targetTabId ?? null;
    this.filterDialogTargetVisualIds = Array.isArray(filter.targetVisualIds)
      ? [...filter.targetVisualIds]
      : [];

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

    // Relative-date preset (item 2). Absent / unknown → 'custom' so the
    // absolute date-range picker stays the default.
    this.filterDialogRelativePreset = isRelativePreset(config.relativePreset)
      ? config.relativePreset
      : 'custom';

    // Cascade parent (item 3).
    this.filterDialogDependsOnFilterId = config.dependsOnFilterId ?? null;

    // Curated category allow-list (item 5). Restrict is inferred from
    // the presence of a non-empty categoryValues array on load.
    const savedAllow: any[] = Array.isArray(config.categoryValues)
      ? config.categoryValues
      : [];
    this.filterDialogRestrictCategory = savedAllow.length > 0;
    this.filterDialogCategoryAllowList = [...savedAllow];

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
    this.filterDialogScope = 'dashboard';
    this.filterDialogTargetTabId = null;
    this.filterDialogTargetVisualIds = [];
    this.filterDialogOperator = '';
    this.filterDialogNullOption = 'ALL_VALUES';
    this.filterDialogDefaultValue = null;
    this.filterDialogPlaceholder = '';
    this.filterDialogIncludeTime = false;
    this.filterDialogDateFormat = 'yy-mm-dd';
    this.filterDialogCategoryValues = [];
    this.filterDialogStaleDefaults = [];
    this.filterDialogRelativePreset = 'custom';
    this.filterDialogRestrictCategory = false;
    this.filterDialogCategoryAllowList = [];
    this.filterDialogDependsOnFilterId = null;
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

  /**
   * Build the scope slice of the save payload. Only emits the target
   * fields relevant to the chosen scope so a stale targetTabId /
   * targetVisualIds from a previous scope never leaks to the BE (the
   * scoped-filter superRefine there requires the matching target).
   */
  private buildScopePayload(): {
    scope: FilterScope;
    targetTabId: string | null;
    targetVisualIds: string[];
  } {
    return {
      scope: this.filterDialogScope,
      targetTabId:
        this.filterDialogScope === 'tab' ? this.filterDialogTargetTabId : null,
      targetVisualIds:
        this.filterDialogScope === 'visual'
          ? this.filterDialogTargetVisualIds
          : [],
    };
  }

  /**
   * When the scope changes, clear the target that no longer applies so
   * the picker for the new scope starts clean.
   */
  onScopeChange(): void {
    if (this.filterDialogScope !== 'tab') this.filterDialogTargetTabId = null;
    if (this.filterDialogScope !== 'visual')
      this.filterDialogTargetVisualIds = [];
  }

  /**
   * Options the default-value picker draws from. When the curated
   * allow-list (item 5) is active, the default can only be one of the
   * curated values; otherwise it's the full distinct set. Keeps the
   * "default is a valid selection" invariant at authoring time.
   */
  get categoryDefaultOptions(): { label: string; value: string }[] {
    if (this.filterDialogRestrictCategory) {
      const allow = new Set(
        this.filterDialogCategoryAllowList.map(v => String(v)),
      );
      return this.filterDialogCategoryValues.filter(o =>
        allow.has(String(o.value)),
      );
    }
    return this.filterDialogCategoryValues;
  }

  /**
   * Toggle handler for the curated allow-list (item 5). Turning it OFF
   * clears the list and any now-orphaned default; turning it ON leaves
   * the list empty for the author to curate (save validates non-empty).
   */
  onRestrictCategoryChange(): void {
    if (!this.filterDialogRestrictCategory) {
      this.filterDialogCategoryAllowList = [];
    }
    this.constrainDefaultToAllowList();
  }

  /**
   * When the allow-list changes, drop any default-value entries that
   * are no longer in it so the persisted default can't sit outside the
   * curated set.
   */
  onCategoryAllowListChange(): void {
    this.constrainDefaultToAllowList();
  }

  /** Prune filterDialogDefaultValue to the current allow-list (no-op
   *  when restrict is off). Preserves the single-vs-array shape. */
  private constrainDefaultToAllowList(): void {
    if (!this.filterDialogRestrictCategory) return;
    const allow = new Set(
      this.filterDialogCategoryAllowList.map(v => String(v)),
    );
    const dv = this.filterDialogDefaultValue;
    if (Array.isArray(dv)) {
      this.filterDialogDefaultValue = dv.filter(v => allow.has(String(v)));
    } else if (dv !== null && dv !== undefined && dv !== '') {
      if (!allow.has(String(dv))) this.filterDialogDefaultValue = '';
    }
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
        // Only enforce the absolute-range sanity check when the author
        // kept the Custom preset — for a live preset the [start,end] is
        // resolved at apply time, not authored here.
        this.filterDialogRelativePreset === 'custom' &&
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

    // Curated category allow-list validation (item 5). When the author
    // turned Restrict on, the allow-list must have at least one value.
    if (
      this.filterDialogType === 'category' &&
      this.filterDialogRestrictCategory &&
      this.filterDialogCategoryAllowList.length === 0
    ) {
      this.globalService.handleErrorService({
        status: false,
        message: this.translate.instant('ANALYSES.FILTER.CATEGORY_LIST_EMPTY'),
      });
      return;
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

    // ── Relative-date preset (item 2) ────────────────────────────────
    // Only meaningful for time_range. Persist the chosen preset id;
    // when it's a live preset (not 'custom') also stamp a resolved
    // start/end so a publish-time snapshot has concrete bounds even
    // before the bar resolves it. The bar re-resolves at apply time so
    // a live dashboard always reflects the current clock.
    if (this.filterDialogType === 'time_range') {
      config.relativePreset = this.filterDialogRelativePreset;
      if (this.filterDialogRelativePreset !== 'custom') {
        const resolved = resolveRelativePreset(this.filterDialogRelativePreset);
        if (resolved) {
          config.dateRangeStart = resolved.start.toISOString();
          config.dateRangeEnd = resolved.end.toISOString();
        }
      }
    }

    // ── Curated category allow-list (item 5) ─────────────────────────
    // Persist the allow-list only when Restrict is ON and it's a
    // category filter. Storing [] / omitting means "all distinct
    // values" (the existing behaviour), so the key is only written when
    // there's an actual curated subset.
    if (
      this.filterDialogType === 'category' &&
      this.filterDialogRestrictCategory &&
      this.filterDialogCategoryAllowList.length > 0
    ) {
      config.categoryValues = [...this.filterDialogCategoryAllowList];
    }

    // ── Cascade parent (item 3) ──────────────────────────────────────
    if (this.filterDialogDependsOnFilterId) {
      config.dependsOnFilterId = this.filterDialogDependsOnFilterId;
    }

    // ── Draft-only save (full-draft Analyses editor model) ────────────
    // No immediate server write. We build the filter row exactly as the
    // old updateFilter/addFilters payload did, then emit it to the
    // parent, which folds it into the analysis's atomic Save.
    //
    // - EDIT keeps the existing real id (this.editingFilter.tempId is
    //   the persisted filter id in this dialog's model).
    // - ADD gets a client-side temp id (`tmp_<uuid>`) so the parent and
    //   the eventual atomic save can map temp → real. Sequence uses the
    //   current configured-filter count, matching the old add payload.
    //
    // The emitted shape is a flat SavedFilter row (id, name, columnName,
    // filterType, controlType, config, nullOption, isEnabled,
    // isMandatory, sequence, scope, targetTabId, targetVisualIds) — the
    // same shape the parent's (saved) handler already consumes. Adds are
    // distinguishable by the `tmp_` id prefix; a `_mode` discriminator is
    // also included for convenience.
    const isEdit = !!this.editingFilter;
    const builtFilter = {
      id: isEdit ? this.editingFilter!.tempId : `tmp_${crypto.randomUUID()}`,
      name,
      columnName,
      filterType: this.filterDialogType,
      controlType: this.filterDialogControl,
      config,
      nullOption: this.filterDialogNullOption || 'ALL_VALUES',
      isEnabled: this.filterDialogEnabled,
      isMandatory: this.filterDialogMandatory,
      sequence: isEdit
        ? this.editingFilter!.sequence
        : this.configuredFiltersCount,
      ...this.buildScopePayload(),
      _mode: isEdit ? 'edit' : 'add',
    };

    this.visibleChange.emit(false);
    this.saved.emit(builtFilter);
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
    // Type-deterministic control selection (spec §7): derive a sensible
    // filter type from the picked column's dataType so the user doesn't
    // have to reason about it. Only auto-pick when no type is set yet
    // (fresh add) — never clobber an explicit choice or an edit-mode
    // rehydration. Boolean fields fall back to `category` because the BE
    // filterEngine handles them via the IN path (no dedicated boolean
    // operator branch), while the numeric/date/string suggestions map to
    // their native filter types.
    let typeAutoPicked = false;
    if (this.filterDialogColumn && !this.filterDialogType) {
      const suggested = suggestFilterType(this.filterDialogColumn.dataType);
      this.filterDialogType = suggested === 'boolean' ? 'category' : suggested;
      // Reuse the existing type-change plumbing to sync control/operator/
      // default-value shape to the freshly-picked type. onFilterTypeChange
      // already triggers loadColumnDistinctValues for category types, so
      // we skip the extra load below to avoid a redundant fetch.
      this.onFilterTypeChange();
      typeAutoPicked = true;
    }
    if (this.filterDialogColumn && !typeAutoPicked) {
      this.loadColumnDistinctValues();
    }
  }

  /**
   * Human hint describing the detected data type of the picked column —
   * shown next to the type dropdown so the user understands why a type
   * was pre-selected. Empty when no column is chosen.
   */
  get detectedTypeHintKey(): string | null {
    if (!this.filterDialogColumn) return null;
    switch (toValueType(this.filterDialogColumn.dataType)) {
      case 'number':
        return 'ANALYSES.DETECTED_TYPE_NUMBER';
      case 'date':
        return 'ANALYSES.DETECTED_TYPE_DATE';
      case 'boolean':
        return 'ANALYSES.DETECTED_TYPE_BOOLEAN';
      default:
        return 'ANALYSES.DETECTED_TYPE_STRING';
    }
  }

  private updateControlTypeOptions(): void {
    // DB-driven (filter_control, grouped by meta.filterType) when available;
    // otherwise the per-type hardcoded switch below.
    const dbControls = this.dbControlOptions?.[this.filterDialogType];
    if (dbControls && dbControls.length) {
      this.controlTypeOptions = dbControls.map(o => ({ ...o }));
      return;
    }
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
    // DB-driven (filter_operator, grouped by meta.filterType) when available;
    // otherwise the mirrored hardcoded FILTER_OPERATOR_KEYS map.
    const dbOps = this.dbFilterOperators?.[this.filterDialogType];
    if (dbOps && dbOps.length) {
      this.operatorOptions = dbOps.map(o => ({ ...o }));
      return;
    }
    const keys = FILTER_OPERATOR_KEYS[this.filterDialogType] || [];
    this.operatorOptions = keys.map(o => ({
      label: this.translate.instant(o.labelKey),
      value: o.value,
    }));
  }

  async loadColumnDistinctValues(): Promise<void> {
    if (!this.filterDialogColumn || !this.datasetId || !this.analysisId) return;

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
