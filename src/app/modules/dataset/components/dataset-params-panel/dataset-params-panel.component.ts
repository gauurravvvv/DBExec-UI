import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { DatasetService } from '../../services/dataset.service';
import {
  DatasetParamConfig,
  DatasetParamQueryOptions,
  DatasetParamStaticOptions,
  DatasetParamType,
  reconcileParams,
} from '../../helpers/param-tokens.helper';

/** Error surfaced from a `POST /run` MISSING_REQUIRED_PARAM response. */
export interface DatasetParamRunError {
  code: string;
  param?: string;
}

/** A `{name, label}` entry for a source-dataset dropdown. */
interface DatasetOption {
  id: string;
  name: string;
}

/** Fetched `{value,label}` options for one query-based dropdown param. */
interface FetchedOption {
  value: any;
  label: string;
}

/**
 * dataset-params-panel — reusable Parameters panel for {{name}} query
 * params, embedded by BOTH add-dataset and edit-dataset.
 *
 * Two responsibilities:
 *  1. CONFIG — for each `{{name}}` detected in the SQL, let the author
 *     pick a type / label / default / required, and (for dropdowns) a
 *     static list or a query-based source. Emitted upward via
 *     `paramsConfigChange` so the parent persists it as `paramsConfig`.
 *  2. VALUES — a compact input per param whose value feeds a preview run.
 *     `runWithParams` emits the current values; the parent passes them as
 *     `params` in the run body.
 *
 * The panel is self-hiding: when the SQL has no live tokens it renders
 * nothing, so existing param-less datasets behave exactly as before.
 *
 * Standalone by design (the task requires it); it pulls in SharedModule
 * for the app-custom-* controls (dropdown/input/number/calendar/
 * daterange/toggle) which are declared there.
 */
@Component({
  selector: 'app-dataset-params-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AppPrimeNGModule, SharedModule],
  templateUrl: './dataset-params-panel.component.html',
  styleUrls: ['./dataset-params-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetParamsPanelComponent implements OnChanges {
  /** Current SQL editor content — re-scanned for tokens on change. */
  @Input() sql = '';

  /** Saved/edited param config (two-way). */
  @Input() paramsConfig: DatasetParamConfig[] = [];

  /** Owning dataset id — required for run-with-params + query options. */
  @Input() datasetId?: string;

  /**
   * When false (e.g. add-dataset, before the dataset exists) the
   * "Run with parameters" button is disabled — there is no dataset id to
   * bind params against yet. Config still saves with the dataset.
   */
  @Input() canRun = false;

  /** Busy flag from the parent so the Run button reflects an in-flight run. */
  @Input() running = false;

  /**
   * Error from the last run. When `code === 'MISSING_REQUIRED_PARAM'`
   * (or 'UNKNOWN_PARAM') the named param row is highlighted.
   */
  @Input() runError: DatasetParamRunError | null = null;

  @Output() paramsConfigChange = new EventEmitter<DatasetParamConfig[]>();
  @Output() runWithParams = new EventEmitter<Record<string, any>>();

  /** Collapsible state — open by default when tokens exist. */
  collapsed = false;

  /** The reconciled config, one row per live token (drives the UI). */
  params: DatasetParamConfig[] = [];

  /** Current VALUE per param name (fed to the run). */
  values: Record<string, any> = {};

  /** Type options for the per-param type dropdown. */
  readonly typeOptions: { label: string; value: DatasetParamType }[] = [
    { label: 'text', value: 'text' },
    { label: 'number', value: 'number' },
    { label: 'date', value: 'date' },
    { label: 'daterange', value: 'daterange' },
    { label: 'dropdown', value: 'dropdown' },
  ];

  /** Static vs query source for dropdown params. */
  readonly sourceOptions = [
    { labelKey: 'DATASET.PARAMS.STATIC_VALUES', value: 'static' },
    { labelKey: 'DATASET.PARAMS.FROM_QUERY', value: 'query' },
  ];

  /** All datasets, for the query-based source picker. Lazy-loaded once. */
  datasetOptions: DatasetOption[] = [];
  private datasetsLoaded = false;

  /** Fetched dropdown options keyed by param name. */
  fetchedOptions: Record<string, FetchedOption[]> = {};
  /** Per-param loading flag for the option fetch. */
  optionsLoading: Record<string, boolean> = {};

  constructor(
    private datasetService: DatasetService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Re-scan whenever the SQL or the incoming config changes. The parent
    // debounces SQL changes before feeding them here, so this stays cheap.
    if (changes['sql'] || changes['paramsConfig']) {
      this.rebuild();
    }
  }

  /** True when there is at least one live `{{token}}` to configure. */
  get hasParams(): boolean {
    return this.params.length > 0;
  }

  /** Reconcile config against current tokens, prune stale values. */
  private rebuild(): void {
    const next = reconcileParams(this.sql, this.paramsConfig);

    // Preserve current values for surviving params; seed a value from the
    // declared default for newly-appeared ones.
    const liveNames = new Set(next.map(p => p.name));
    const nextValues: Record<string, any> = {};
    next.forEach(p => {
      if (Object.prototype.hasOwnProperty.call(this.values, p.name)) {
        nextValues[p.name] = this.values[p.name];
      } else if (p.default !== undefined && p.default !== null) {
        nextValues[p.name] = p.default;
      }
    });
    // Drop fetched options for params that no longer exist.
    Object.keys(this.fetchedOptions).forEach(name => {
      if (!liveNames.has(name)) delete this.fetchedOptions[name];
    });

    this.params = next;
    this.values = nextValues;

    // If any dropdown param uses a query source, make sure the source-
    // dataset list is available and pre-fetch its options so the value
    // control is populated when the user opens it.
    const hasQuerySource = next.some(
      p => p.type === 'dropdown' && this.sourceOf(p) === 'query',
    );
    if (hasQuerySource) {
      this.ensureDatasetsLoaded();
      next.forEach(p => {
        if (p.type === 'dropdown' && this.sourceOf(p) === 'query') {
          this.loadValueOptions(p);
        }
      });
    }

    // Emit only when the reconciliation actually changed the config shape
    // (added/removed a token) so we don't loop with the parent's binding.
    if (!this.sameConfig(next, this.paramsConfig)) {
      this.emitConfig();
    }
    this.cdr.markForCheck();
  }

  private sameConfig(
    a: DatasetParamConfig[],
    b: DatasetParamConfig[] | null | undefined,
  ): boolean {
    const bb = b ?? [];
    if (a.length !== bb.length) return false;
    return a.every((p, i) => p.name === bb[i]?.name && p.type === bb[i]?.type);
  }

  private emitConfig(): void {
    // Emit a defensive copy so the parent can't mutate our working array.
    this.paramsConfigChange.emit(this.params.map(p => ({ ...p })));
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  // ── Config edits ─────────────────────────────────────────────────────

  onTypeChange(param: DatasetParamConfig, type: DatasetParamType): void {
    param.type = type;
    // Reset options when leaving dropdown; seed an empty static list when
    // entering it so the source toggle has something to bind.
    if (type !== 'dropdown') {
      delete param.options;
    } else if (!param.options) {
      param.options = { static: [] };
    }
    // A type change can invalidate the current value; clear it so the
    // control re-renders from a clean slate.
    delete this.values[param.name];
    this.emitConfig();
  }

  onLabelChange(param: DatasetParamConfig, label: string): void {
    param.label = label || undefined;
    this.emitConfig();
  }

  onDefaultChange(param: DatasetParamConfig, value: any): void {
    param.default = value === '' || value === null ? undefined : value;
    this.emitConfig();
  }

  onRequiredChange(param: DatasetParamConfig, required: boolean): void {
    param.required = required;
    this.emitConfig();
  }

  /** 'static' | 'query' — which dropdown source the param uses. */
  sourceOf(param: DatasetParamConfig): 'static' | 'query' {
    const opts = param.options as DatasetParamQueryOptions | undefined;
    return opts && ('datasetId' in opts || 'valueColumn' in opts)
      ? 'query'
      : 'static';
  }

  onSourceChange(param: DatasetParamConfig, source: 'static' | 'query'): void {
    param.options =
      source === 'query'
        ? ({ datasetId: '', valueColumn: '', labelColumn: '' } as DatasetParamQueryOptions)
        : ({ static: [] } as DatasetParamStaticOptions);
    delete this.fetchedOptions[param.name];
    this.ensureDatasetsLoaded();
    this.emitConfig();
  }

  staticValues(param: DatasetParamConfig): string[] {
    return (param.options as DatasetParamStaticOptions)?.static ?? [];
  }

  onStaticValuesChange(param: DatasetParamConfig, values: string[]): void {
    param.options = { static: values ?? [] };
    this.emitConfig();
  }

  queryOptions(param: DatasetParamConfig): DatasetParamQueryOptions {
    return (param.options as DatasetParamQueryOptions) ?? {};
  }

  onQuerySourceDatasetChange(param: DatasetParamConfig, datasetId: string): void {
    const opts = this.queryOptions(param);
    param.options = { ...opts, datasetId };
    delete this.fetchedOptions[param.name];
    this.emitConfig();
  }

  onValueColumnChange(param: DatasetParamConfig, valueColumn: string): void {
    const opts = this.queryOptions(param);
    param.options = { ...opts, valueColumn: valueColumn || undefined };
    delete this.fetchedOptions[param.name];
    this.emitConfig();
  }

  onLabelColumnChange(param: DatasetParamConfig, labelColumn: string): void {
    const opts = this.queryOptions(param);
    param.options = { ...opts, labelColumn: labelColumn || undefined };
    delete this.fetchedOptions[param.name];
    this.emitConfig();
  }

  // ── Value edits (for the run) ────────────────────────────────────────

  onValueChange(param: DatasetParamConfig, value: any): void {
    this.values[param.name] = value;
  }

  /** Options a dropdown VALUE control should render (static or fetched). */
  valueDropdownOptions(param: DatasetParamConfig): FetchedOption[] {
    if (this.sourceOf(param) === 'static') {
      return this.staticValues(param).map(v => ({ value: v, label: v }));
    }
    return this.fetchedOptions[param.name] ?? [];
  }

  /**
   * Lazily fetch the query-based dropdown's options the first time the
   * value control opens (or after the source changes).
   */
  loadValueOptions(param: DatasetParamConfig): void {
    if (this.sourceOf(param) !== 'query') return;
    if (!this.datasetId) return;
    if (this.fetchedOptions[param.name]) return;
    const opts = this.queryOptions(param);
    if (!opts.datasetId || !opts.valueColumn) return;

    this.optionsLoading[param.name] = true;
    this.datasetService
      .getParamOptions(this.datasetId, {
        datasetId: opts.datasetId,
        valueColumn: opts.valueColumn,
        labelColumn: opts.labelColumn,
        limit: 100,
      })
      .then((res: any) => {
        // BE returns a BARE array in `data`.
        const arr = Array.isArray(res?.data) ? res.data : [];
        this.fetchedOptions[param.name] = arr.map((o: any) => ({
          value: o?.value,
          label: o?.label ?? String(o?.value ?? ''),
        }));
      })
      .catch(() => {
        this.fetchedOptions[param.name] = [];
      })
      .finally(() => {
        this.optionsLoading[param.name] = false;
        this.cdr.markForCheck();
      });
  }

  private ensureDatasetsLoaded(): void {
    if (this.datasetsLoaded) return;
    this.datasetsLoaded = true;
    this.datasetService
      .listDatasets({ page: 1, limit: 200 })
      .then((res: any) => {
        const list = res?.data?.datasets ?? res?.data ?? [];
        this.datasetOptions = (Array.isArray(list) ? list : [])
          // Only SQL-authored datasets (type 1) are valid sources; a
          // query-builder dataset (type 2) has no direct value/label
          // projection. Fall back to including all when type is absent.
          .filter((d: any) => d?.id && (d.type === undefined || d.type === 1))
          .map((d: any) => ({ id: d.id, name: d.name }));
      })
      .catch(() => {
        this.datasetOptions = [];
      })
      .finally(() => this.cdr.markForCheck());
  }

  // ── Run ──────────────────────────────────────────────────────────────

  onRun(): void {
    // Normalise date / daterange values to something the BE can bind. A
    // Date becomes an ISO date string; a daterange becomes {from,to}.
    const out: Record<string, any> = {};
    this.params.forEach(p => {
      const raw = this.values[p.name];
      if (raw === undefined || raw === null || raw === '') return;
      out[p.name] = this.serializeValue(p, raw);
    });
    this.runWithParams.emit(out);
  }

  private serializeValue(param: DatasetParamConfig, raw: any): any {
    if (param.type === 'date' && raw instanceof Date) {
      return this.toISODate(raw);
    }
    if (param.type === 'daterange' && Array.isArray(raw)) {
      const [from, to] = raw;
      return {
        from: from instanceof Date ? this.toISODate(from) : from,
        to: to instanceof Date ? this.toISODate(to) : to,
      };
    }
    return raw;
  }

  private toISODate(d: Date): string {
    // Local calendar date (yyyy-mm-dd), no timezone shift.
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** True when this param row is the one the BE flagged in runError. */
  isErrored(param: DatasetParamConfig): boolean {
    return !!this.runError?.param && this.runError.param === param.name;
  }

  /**
   * Literal `{{name}}` for display. Built here (not in the template) so
   * the Angular parser never sees raw double-braces and tries to treat
   * them as interpolation.
   */
  tokenDisplay(param: DatasetParamConfig): string {
    return `{{${param.name}}}`;
  }

  /** Trackby for the param rows so edits don't rebuild the whole list. */
  trackByName(_i: number, p: DatasetParamConfig): string {
    return p.name;
  }
}
