import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AnalysesService } from '../../services/analyses.service';
import {
  FilterOption,
  FilterOptionsCacheService,
  FilterValuesResult,
} from '../../services/filter-options-cache.service';
import {
  RELATIVE_DATE_PRESETS,
  isRelativePreset,
  resolveRelativePreset,
} from '../filter-dialog/relative-date-presets.util';

/**
 * Per-filter UI state — what the template branches on. The bar's
 * internal `state` map and the host-driven `filterStates` input both
 * use this shape so the template doesn't have to discriminate
 * sources.
 */
export interface FilterUiState {
  options: FilterOption[];
  total: number;
  totalApproximate: boolean;
  truncated: boolean;
  staleSelectedValues: string[];
  columnMissing: boolean;
  errorMessage: string | null;
  loading: boolean;
}

/**
 * Closure shape for host-supplied dropdown fetchers. Matches
 * app-custom-dropdown's serverMode contract.
 */
export type FilterFetcher = (args: {
  search: string;
  page: number;
  limit: number;
}) => Promise<{ items: FilterOption[]; total: number }>;

/**
 * AnalysisFilterBar — runs in two modes:
 *
 *  hosted (preferred): caller passes `[filters]`, `[filterStates]`,
 *    and `[fetcherFor]` from a store-backed parent. The bar becomes
 *    purely presentational — owns only the user's in-flight
 *    selections (appliedValues, ephemeral form state) and emits
 *    filtersApplied / filtersCleared events upward.
 *
 *  service (legacy): no inputs beyond analysisId. The bar
 *    talks to AnalysesService + FilterOptionsCacheService directly,
 *    same as before the store landed.
 *
 * Mode is auto-detected: presence of `[filters]` switches to hosted
 * mode. The two paths coexist so individual host components can
 * migrate to the store on their own schedule.
 */
@Component({
  selector: 'app-analysis-filter-bar',
  templateUrl: './analysis-filter-bar.component.html',
  styleUrls: ['./analysis-filter-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisFilterBarComponent
  implements OnInit, OnChanges, OnDestroy
{
  // ── Shared inputs ────────────────────────────────────────────────
  @Input() analysisId!: string;
  @Output() filtersApplied = new EventEmitter<any[]>();
  @Output() filtersCleared = new EventEmitter<void>();

  /**
   * When set to a positive integer, switches the bar into "overflow"
   * mode: the first `maxVisible` enabled filters render inline; the
   * rest collapse behind a "More filters" overlay button. Set to 0
   * or leave undefined to render every filter inline (the default,
   * used by the Edit Analysis sidebar).
   *
   * The split is purely cosmetic — every filter still binds its
   * own ngModel, so changing a value behind the overflow panel
   * still triggers a re-query when Apply is clicked. There's no
   * notion of "secondary filters" beyond visibility.
   */
  @Input() maxVisible: number | null = null;

  /**
   * Auto-apply mode. When true, any value change emits filtersApplied
   * after a short debounce — no Apply button click required. Used by
   * the dashboard surface where viewers want immediate feedback as
   * they change values. The Edit Analysis usage keeps the default
   * (false), where users build up a multi-filter selection and
   * commit it with the Apply button.
   *
   * Debounce avoids firing one query per keystroke for text/numeric
   * inputs while still feeling instant for clicks on dropdowns.
   */
  @Input() autoApply: boolean = false;

  /** Debounce window for autoApply, in ms. 300ms is the sweet spot —
   *  fast enough to feel live, slow enough to coalesce a multiselect
   *  user-click + click-away sequence into one query. */
  private static readonly AUTO_APPLY_DEBOUNCE_MS = 300;
  private autoApplyTimer: any = null;

  /**
   * Apply-vs-Live mode (Slice D, item 4). Per-analysis, user-toggleable
   * in the bar. Seeded from the `autoApply` @Input so each surface keeps
   * its historical default (dashboard = live, editor = batched-apply),
   * but the viewer can flip it: Live auto-applies on change (debounced),
   * Apply batches changes behind an explicit Apply button. Set once in
   * ngOnInit / ngOnChanges from the input, then owned locally.
   */
  liveMode = false;
  /** Guards the one-time seed of liveMode from the autoApply input. */
  private liveModeSeeded = false;

  /** Toggle handler for the Live/Apply switch. Flipping INTO live mode
   *  immediately applies whatever is currently selected so the canvas
   *  catches up to the batched selection. */
  onLiveModeChange(live: boolean): void {
    this.liveMode = live;
    if (this.liveMode) this.applyFilters();
  }

  // ── Hosted-mode inputs ───────────────────────────────────────────
  /** When present, switches into hosted mode and the bar stops calling
   *  AnalysesService.listFilters / cache.open itself. */
  @Input() filters: any[] | null = null;
  /** Per-filter UI state keyed by filter id. */
  @Input() filterStates: Record<string, FilterUiState> | null = null;
  /** Host-supplied fetcher closure factory. The bar passes this
   *  straight to app-custom-dropdown's [fetcher] binding. */
  @Input() fetcherFactory: ((filter: any) => FilterFetcher) | null = null;
  /** Host-supplied "dismiss stale chip" handler — keeps stale-chip
   *  state in the store (a dispatch) instead of local. */
  @Input() onDismissStale: ((filter: any, value: string) => void) | null = null;

  // ── Service-mode internal state ──────────────────────────────────
  internalFilters: any[] = [];
  internalState: Record<string, FilterUiState> = {};

  // ── Form state — always local, both modes ───────────────────────
  appliedValues: { [filterId: string]: any } = {};
  isLoading = false;

  constructor(
    private analysesService: AnalysesService,
    private optionsCache: FilterOptionsCacheService,
    private cdr: ChangeDetectorRef,
  ) {}

  /** True while the bar should rely on its own service/cache calls
   *  rather than the host-supplied inputs. */
  get serviceMode(): boolean {
    return this.filters === null;
  }

  /** Resolved filter list for the template — host inputs override
   *  service-mode internal state when present. */
  get visibleFilters(): any[] {
    return this.serviceMode ? this.internalFilters : (this.filters ?? []);
  }

  /**
   * Scope chip label for a filter (Track B). Returns an i18n key for a
   * small badge shown on scoped filters so the viewer knows a filter
   * only re-runs a subset. Returns '' for dashboard-scope (default) or
   * a filter with no scope set — the chip is then not rendered.
   */
  scopeChipKey(filter: any): string {
    const scope = filter?.scope;
    if (!scope || scope === 'dashboard') return '';
    if (scope === 'tab') return 'ANALYSES.FILTER.SCOPE_CHIP_TAB';
    if (scope === 'visual') return 'ANALYSES.FILTER.SCOPE_CHIP_VISUAL';
    return '';
  }

  /**
   * i18n label key for a time_range filter's live relative preset
   * (item 2), or '' when the filter uses an absolute/custom range. The
   * template renders a small badge from it so viewers know the range is
   * clock-driven.
   */
  relativePresetLabel(filter: any): string {
    if (filter?.filterType !== 'time_range') return '';
    const preset = filter?.config?.relativePreset;
    if (!isRelativePreset(preset) || preset === 'custom') return '';
    const match = RELATIVE_DATE_PRESETS.find(p => p.value === preset);
    return match ? match.labelKey : '';
  }

  /**
   * Filters that render inline in the bar. When maxVisible is unset
   * or zero, every visible filter qualifies (legacy behaviour).
   * Otherwise we slice off the first N to keep the bar from wrapping
   * past the toolbar's height.
   */
  get primaryFilters(): any[] {
    const all = this.visibleFilters;
    const cap = this.maxVisible ?? 0;
    if (!cap || cap <= 0) return all;
    return all.slice(0, cap);
  }

  /**
   * Filters that live behind the "More filters" overflow button.
   * Empty unless maxVisible is set AND there are more filters than
   * the cap.
   */
  get overflowFilters(): any[] {
    const all = this.visibleFilters;
    const cap = this.maxVisible ?? 0;
    if (!cap || cap <= 0) return [];
    return all.slice(cap);
  }

  /**
   * Count of overflow filters that already have a value applied —
   * surfaces as a small numeric badge on the "More filters" button
   * so users notice when hidden filters are constraining their data.
   */
  get overflowAppliedCount(): number {
    return this.overflowFilters.reduce((n, f) => {
      const v = this.appliedValues[f.id];
      if (v === null || v === undefined || v === '') return n;
      if (Array.isArray(v) && v.length === 0) return n;
      return n + 1;
    }, 0);
  }

  /** Per-filter state in whichever mode is active. */
  private resolveState(filterId: string): FilterUiState | null {
    if (this.serviceMode) return this.internalState[filterId] ?? null;
    return this.filterStates?.[filterId] ?? null;
  }

  ngOnInit(): void {
    this.seedLiveMode();
    if (this.serviceMode) this.loadFilters();
  }

  /** One-time seed of liveMode from the autoApply input. */
  private seedLiveMode(): void {
    if (this.liveModeSeeded) return;
    this.liveMode = this.autoApply;
    this.liveModeSeeded = true;
  }

  ngOnDestroy(): void {
    // Clear any pending auto-apply timer so an emit doesn't fire
    // after the component is torn down (e.g. the user navigated
    // away during the debounce window).
    if (this.autoApplyTimer) {
      clearTimeout(this.autoApplyTimer);
      this.autoApplyTimer = null;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Seed the live/apply mode from autoApply on the first time the
    // input lands (may be after ngOnInit if bound asynchronously).
    if (changes['autoApply'] && !this.liveModeSeeded) {
      this.seedLiveMode();
    }
    // Host swapped the analysis or the filter list — drop any in-flight
    // selections so we don't apply stale values to the new analysis.
    if (changes['analysisId'] && !changes['analysisId'].firstChange) {
      this.appliedValues = {};
      this.fetcherCache.clear();
    }
    if (changes['filters'] && this.filters) {
      // When the host hands us new filters, sync defaults from each
      // filter's saved config. The host has already validated stale
      // values before populating filterStates.
      this.initializeDefaultsFromHosted();
      // New filter set may have different ids — drop stale cache
      // entries (a stale closure could leak a different filter's
      // identity into the dropdown).
      this.fetcherCache.clear();
    }
    if (changes['fetcherFactory']) {
      // Host replaced the fetcher factory — every cached closure is
      // now bound to a stale factory reference.
      this.fetcherCache.clear();
    }
  }

  /** Force-clear the options cache and reload (service mode only).
   *  Hosted callers dispatch invalidateAnalysis instead. */
  refresh(): void {
    if (!this.serviceMode) return;
    this.optionsCache.clear();
    this.loadFilters();
  }

  // ── Service-mode load ─────────────────────────────────────────────
  async loadFilters(): Promise<void> {
    if (!this.analysisId) return;
    this.isLoading = true;
    try {
      const { filters, warmed } = await this.optionsCache.open(this.analysisId);
      this.internalFilters = (filters || []).filter((f: any) => f.isEnabled);

      for (const f of this.internalFilters) {
        this.internalState[f.id] = {
          options: [],
          total: 0,
          totalApproximate: false,
          truncated: false,
          staleSelectedValues: [],
          columnMissing: false,
          errorMessage: null,
          loading: false,
        };
      }

      const dropdownFilters = this.internalFilters.filter(
        f => f.controlType === 'dropdown' || f.controlType === 'list',
      );
      if (warmed && dropdownFilters.length) {
        for (const f of dropdownFilters) {
          const result = await this.optionsCache.get(this.analysisId, f.id);
          this.applyResultToInternalState(f.id, result);
        }
      }

      this.initializeDefaultsFromInternal();
    } catch (err) {
      console.error('Failed to load filters', err);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Per-filter cache of the closure returned by fetcherFor. The
   *  template binds `[fetcher]="fetcherFor(filter)"`, which runs on
   *  every CD pass — without memoization each tick produces a new
   *  closure reference and the dropdown's ngOnChanges treats it as
   *  a fresh fetcher, potentially re-arming pagination. Cache by
   *  filter.id and only invalidate when the host's fetcherFactory
   *  reference itself changes (handled in ngOnChanges). */
  private fetcherCache = new Map<string, FilterFetcher>();

  /** Service-mode fetcher closure — proxies the dropdown's serverMode
   *  calls through the in-process cache so paging + search work
   *  without an extra trip. */
  fetcherFor(filter: any): FilterFetcher {
    const cached = this.fetcherCache.get(filter.id);
    if (cached) return cached;

    let fetcher: FilterFetcher;
    if (!this.serviceMode && this.fetcherFactory) {
      // Hosted mode delegates to the host's fetcherFactory.
      fetcher = this.fetcherFactory(filter);
    } else {
      fetcher = async (args: {
        search: string;
        page: number;
        limit: number;
      }) => {
        // Cascading (item 3): when this filter depends on a parent that
        // currently has a selection, bypass the shared cache and hit
        // the batch endpoint directly so we can pass parentSelections
        // (the cache key doesn't include the parent constraint). The BE
        // accepts parentSelections today and will constrain results
        // once its cascade support lands — forward-compatible.
        const parentSelections = this.parentSelectionsFor(filter);
        if (parentSelections) {
          const result = await this.fetchWithParentConstraint(filter, args, {
            parentSelections,
          });
          this.applyResultToInternalState(filter.id, result);
          if (!result.ok) return { items: [], total: 0 };
          return { items: result.values, total: result.total };
        }

        const result = await this.optionsCache.get(this.analysisId, filter.id, {
          search: args.search || undefined,
          page: args.page,
          pageSize: args.limit,
        });
        this.applyResultToInternalState(filter.id, result);
        if (!result.ok) return { items: [], total: 0 };
        return { items: result.values, total: result.total };
      };
    }

    this.fetcherCache.set(filter.id, fetcher);
    return fetcher;
  }

  /**
   * Direct (uncached) batch fetch for a cascaded filter, carrying the
   * parent's selection as `parentSelections`. Kept off the shared
   * FilterOptionsCache because that cache keys only on search+page — a
   * parent-constrained result must not be served for an unconstrained
   * request (or vice-versa). Normalises the batch response into the
   * FilterValuesResult union the internal state expects.
   */
  private async fetchWithParentConstraint(
    filter: any,
    args: { search: string; page: number; limit: number },
    extra: { parentSelections: Record<string, (string | number)[]> },
  ): Promise<FilterValuesResult> {
    try {
      const res: any = await this.analysesService.getFilterValuesBatch({
        analysisId: this.analysisId,
        requests: [
          {
            filterId: filter.id,
            search: args.search || undefined,
            page: args.page,
            pageSize: args.limit,
            parentSelections: extra.parentSelections,
          },
        ],
      });
      const raw = res?.data?.results?.[filter.id];
      if (!res?.status || !raw || raw.ok === false) {
        return {
          ok: false,
          error: (raw?.error as any) || 'sql_error',
          message: raw?.message || 'Filter values unavailable',
        };
      }
      return {
        ok: true,
        values: raw.values ?? [],
        total: raw.total ?? 0,
        totalApproximate: !!raw.totalApproximate,
        truncated: !!raw.truncated,
        nextPage: raw.nextPage ?? null,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: 'sql_error',
        message: err?.message || 'Network error',
      };
    }
  }

  private applyResultToInternalState(
    filterId: string,
    result: FilterValuesResult,
  ): void {
    const s = this.internalState[filterId];
    if (!s) return;
    if (result.ok) {
      s.options = result.values;
      s.total = result.total;
      s.totalApproximate = result.totalApproximate;
      s.truncated = result.truncated;
      s.columnMissing = false;
      s.errorMessage = null;
    } else {
      s.options = [];
      s.total = 0;
      s.totalApproximate = false;
      s.truncated = false;
      s.columnMissing = result.error === 'column_missing';
      s.errorMessage = result.message || null;
    }
  }

  // ── Default initialisation ───────────────────────────────────────
  /** Service-mode wrapper around initializeDefaults — reads the bar's
   *  internal state. */
  private initializeDefaultsFromInternal(): void {
    this.initializeDefaults(filter => this.internalState[filter.id]);
  }

  /** Hosted-mode wrapper. Note: in hosted mode the host has already
   *  computed staleSelectedValues, so the bar only needs to apply the
   *  present values to appliedValues. */
  private initializeDefaultsFromHosted(): void {
    this.initializeDefaults(filter => this.filterStates?.[filter.id] ?? null);
  }

  private initializeDefaults(
    stateAccessor: (filter: any) => FilterUiState | null,
  ): void {
    for (const f of this.visibleFilters) {
      const config = f.config || {};

      if (f.filterType === 'category' && config.defaultValue != null) {
        this.initializeCategoryDefault(f, config, stateAccessor);
      } else if (
        f.filterType === 'numeric_equality' &&
        config.defaultValue != null
      ) {
        this.appliedValues[f.id] = Number(config.defaultValue);
      } else if (
        f.filterType === 'numeric_range' &&
        (config.rangeMin != null || config.rangeMax != null)
      ) {
        this.appliedValues[f.id] = [
          Number(config.rangeMin ?? 0),
          Number(config.rangeMax ?? 100),
        ];
      } else if (f.filterType === 'time_equality' && config.defaultValue) {
        const d = new Date(config.defaultValue);
        if (!isNaN(d.getTime())) this.appliedValues[f.id] = d;
      } else if (f.filterType === 'time_range') {
        // Relative preset (item 2): when a live preset is configured,
        // resolve it to a concrete [start, end] against the current
        // clock so the picker shows today's window. 'custom'/absent
        // falls through to the saved absolute range below.
        const resolved = resolveRelativePreset(config.relativePreset);
        if (resolved) {
          this.appliedValues[f.id] = [resolved.start, resolved.end];
          continue;
        }
        const dates: Date[] = [];
        if (config.dateRangeStart) {
          const d = new Date(config.dateRangeStart);
          if (!isNaN(d.getTime())) dates.push(d);
        }
        if (config.dateRangeEnd) {
          const d = new Date(config.dateRangeEnd);
          if (!isNaN(d.getTime())) dates.push(d);
        }
        if (dates.length > 0) this.appliedValues[f.id] = dates;
      }
    }
  }

  private initializeCategoryDefault(
    filter: any,
    config: any,
    stateAccessor: (filter: any) => FilterUiState | null,
  ): void {
    const s = stateAccessor(filter);
    if (!s) return;
    // Case- AND whitespace-insensitive lookup: 'Marketing ' (saved
    // with a trailing space) should still match live 'Marketing'.
    // Mirrors the BE probe's LOWER(TRIM(...)) comparison so the two
    // sides agree on what counts as stale.
    const liveLookup = new Map<string, string | number>();
    for (const opt of s.options) {
      if (opt.value === null || opt.value === undefined) continue;
      liveLookup.set(String(opt.value).trim().toLowerCase(), opt.value);
    }
    const rawDefaults = Array.isArray(config.defaultValue)
      ? config.defaultValue
      : [config.defaultValue];
    const stringDefaults = rawDefaults
      .filter((d: any) => d !== null && d !== undefined && d !== '')
      .map((d: any) => String(d));
    const present: (string | number)[] = [];
    const stale: string[] = [];
    for (const d of stringDefaults) {
      const hit = liveLookup.get(d.trim().toLowerCase());
      if (hit !== undefined) present.push(hit);
      else stale.push(d);
    }
    // In service mode we own staleSelectedValues; in hosted mode the
    // host has already populated it via the store, so we don't write
    // here.
    if (this.serviceMode) s.staleSelectedValues = stale;
    if (present.length === 0) return;
    if (filter.controlType === 'dropdown') {
      this.appliedValues[filter.id] = present[0];
    } else if (filter.controlType === 'list') {
      this.appliedValues[filter.id] = present;
    }
  }

  /** Template helper — exposes per-filter state regardless of mode. */
  stateFor(filter: any): FilterUiState | null {
    return this.resolveState(filter.id);
  }

  optionsFor(filter: any): FilterOption[] {
    return this.stateFor(filter)?.options || [];
  }

  truncatedFor(filter: any): boolean {
    return !!this.stateFor(filter)?.truncated;
  }

  totalFor(filter: any): number {
    return this.stateFor(filter)?.total || 0;
  }

  hasStaleValues(filter: any): boolean {
    return !!this.stateFor(filter)?.staleSelectedValues.length;
  }

  staleValuesFor(filter: any): string[] {
    return this.stateFor(filter)?.staleSelectedValues || [];
  }

  isColumnMissing(filter: any): boolean {
    return !!this.stateFor(filter)?.columnMissing;
  }

  removeStaleValue(filter: any, value: string): void {
    if (this.onDismissStale) {
      // Hosted mode — bubble up so the host can dispatch.
      this.onDismissStale(filter, value);
      return;
    }
    // Service mode — mutate the bar's own state.
    const s = this.internalState[filter.id];
    if (!s) return;
    s.staleSelectedValues = s.staleSelectedValues.filter(v => v !== value);
    this.cdr.markForCheck();
  }

  trackById(_index: number, item: any): any {
    return item.id;
  }

  onFilterChange(filter: any, value: any): void {
    this.appliedValues[filter.id] = value;
    // Cascading (item 3) is a LIVE-mode-only behaviour: when a parent's
    // value changes we clear dependent children's selections + cached
    // options and re-fetch them constrained by the new parent value.
    //
    // In batched (non-live) mode we must NOT cascade here. ngModelChange
    // now routes multiselect/slider edits through onFilterChange, so a
    // parent edit would call invalidateDependents() and wipe the user's
    // STAGED child selections before they ever press Apply. In batched
    // mode the child options/selections are resolved at Apply time, so
    // gate the invalidation (and the auto-apply) behind liveMode.
    if (this.liveMode) {
      this.invalidateDependents(filter.id);
      // In live mode a value change re-emits filters after a short
      // debounce. We do NOT touch the existing Apply button flow —
      // applyFilters() works the same regardless of mode; live mode just
      // calls it for the user.
      this.scheduleAutoApply();
    }
  }

  /**
   * Cascading re-fetch (item 3). When `parentId`'s value changes, every
   * filter whose config.dependsOnFilterId === parentId has an option
   * set that no longer matches the parent selection. We:
   *   1. clear the child's current selection (it may now be invalid),
   *   2. drop its cached options + memoised fetcher so the next open
   *      re-fetches constrained by the new parent value.
   * In service mode the rebuilt fetcher passes parentSelections to the
   * BE; in hosted mode the host's fetcher is used verbatim, so the
   * child simply refreshes (the constraint applies once the host wires
   * parentSelections through — the BE contract is forward-compatible).
   */
  private invalidateDependents(parentId: string): void {
    for (const child of this.visibleFilters) {
      if (child?.config?.dependsOnFilterId !== parentId) continue;
      // Drop the child's now-inconsistent selection.
      delete this.appliedValues[child.id];
      // Invalidate memoised fetcher + cached options so the next open
      // re-queries with the new parent constraint.
      this.fetcherCache.delete(child.id);
      if (this.serviceMode) {
        this.optionsCache.clearFilter(child.id);
        const s = this.internalState[child.id];
        if (s) {
          s.options = [];
          s.total = 0;
        }
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Build the parentSelections map for a filter that declares a cascade
   * parent (config.dependsOnFilterId). Shape matches the BE contract:
   *   { [parentFilterId]: (string|number)[] }
   * Empty / no-parent → undefined so the fetch payload stays lean.
   */
  private parentSelectionsFor(
    filter: any,
  ): Record<string, (string | number)[]> | undefined {
    const parentId: string | undefined = filter?.config?.dependsOnFilterId;
    if (!parentId) return undefined;
    const val = this.appliedValues[parentId];
    if (val === null || val === undefined || val === '') return undefined;
    const values = (Array.isArray(val) ? val : [val]).filter(
      v => v !== null && v !== undefined && v !== '',
    );
    if (values.length === 0) return undefined;
    return { [parentId]: values };
  }

  /** Schedule a debounced auto-apply. Successive value changes within
   *  the debounce window reset the timer, so a flurry of edits coalesces
   *  into a single query. Idempotent. */
  private scheduleAutoApply(): void {
    if (this.autoApplyTimer) clearTimeout(this.autoApplyTimer);
    this.autoApplyTimer = setTimeout(
      () => this.applyFilters(),
      AnalysisFilterBarComponent.AUTO_APPLY_DEBOUNCE_MS,
    );
  }

  /**
   * Refresh the applied value of every time_range filter that uses a
   * live relative preset (item 2) so the [start, end] reflects the
   * current clock at apply time. Custom / absolute ranges are left
   * untouched. Called from applyFilters (both manual + debounced).
   */
  private refreshRelativePresets(): void {
    for (const f of this.visibleFilters) {
      if (f.filterType !== 'time_range') continue;
      const resolved = resolveRelativePreset(f.config?.relativePreset);
      if (resolved) {
        this.appliedValues[f.id] = [resolved.start, resolved.end];
      }
    }
  }

  applyFilters(): void {
    // Re-resolve any live relative-date presets (item 2) against the
    // current clock so a long-open surface queries today's window, not
    // the window resolved when the bar first loaded.
    this.refreshRelativePresets();
    const applied = this.visibleFilters
      .filter(f => {
        const val = this.appliedValues[f.id];
        return (
          val !== undefined &&
          val !== null &&
          val !== '' &&
          !(Array.isArray(val) && val.length === 0)
        );
      })
      .map(f => {
        const val = this.appliedValues[f.id];
        const base: any = {
          filterId: f.id,
          columnName: f.columnName,
          filterType: f.filterType,
          operator:
            f.config?.matchOperator || this.getDefaultOperator(f.filterType),
          nullOption: f.nullOption || 'ALL_VALUES',
        };

        if (f.filterType === 'category') {
          base.values = Array.isArray(val) ? val : [val];
        } else if (
          f.filterType === 'numeric_range' ||
          f.filterType === 'numeric_equality'
        ) {
          if (Array.isArray(val) && val.length === 2) {
            base.rangeMin = val[0];
            base.rangeMax = val[1];
            base.operator = 'BETWEEN';
          } else if (typeof val === 'object' && val.min !== undefined) {
            base.rangeMin = val.min;
            base.rangeMax = val.max;
            base.operator = 'BETWEEN';
          } else {
            base.values = [val];
          }
        } else if (
          f.filterType === 'time_range' ||
          f.filterType === 'time_equality'
        ) {
          // PrimeNG range mode emits [start, null] while the user is
          // mid-selection. Skip half-formed ranges so the chart
          // doesn't re-query on an unfinished selection.
          if (
            Array.isArray(val) &&
            val.length === 2 &&
            val[0] != null &&
            val[1] != null
          ) {
            base.dateRangeStart =
              val[0] instanceof Date ? val[0].toISOString() : val[0];
            base.dateRangeEnd =
              val[1] instanceof Date ? val[1].toISOString() : val[1];
            base.operator = 'BETWEEN';
          } else if (!Array.isArray(val) && val != null && val !== '') {
            const dateVal = val instanceof Date ? val.toISOString() : val;
            base.values = [dateVal];
          } else {
            base._skip = true;
          }
        }

        return base;
      })
      .filter(b => !b._skip);

    this.filtersApplied.emit(applied);
  }

  clearFilters(): void {
    this.appliedValues = {};
    if (this.serviceMode) {
      for (const f of this.internalFilters) {
        const s = this.internalState[f.id];
        if (s) s.staleSelectedValues = [];
      }
    }
    this.filtersCleared.emit();
  }

  getDefaultOperator(filterType: string): string {
    switch (filterType) {
      case 'category':
      case 'numeric_equality':
      case 'time_equality':
        return 'EQUALS';
      case 'numeric_range':
      case 'time_range':
        return 'BETWEEN';
      default:
        return 'EQUALS';
    }
  }

  get hasActiveFilters(): boolean {
    return Object.keys(this.appliedValues).some(key => {
      const val = this.appliedValues[key];
      return (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        !(Array.isArray(val) && val.length === 0)
      );
    });
  }
}
