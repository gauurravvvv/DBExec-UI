/**
 * Analyses Filter Slice — state shape.
 *
 * Why a separate slice instead of folding into AddAnalysesState? Two
 * reasons:
 *
 *   1. Lifecycle: filter state is per-analysis and meaningful only
 *      while a specific analysis is open. The dataset cache (the
 *      other slice in this module) is global and orthogonal.
 *
 *   2. Volatility: filter option lists can be large (thousands of
 *      rows per dropdown). Keeping them isolated lets the dataset
 *      slice's TTL / LRU policy stay narrowly tuned for row data.
 *
 * Indexing by `analysisId` means multi-tab navigation between
 * analyses doesn't blow each other's caches — each analysis owns its
 * own filter cache lane.
 *
 * The store does NOT hold the user's in-flight selections (the
 * appliedValues map in the filter bar). That's form state — pure
 * ephemeral input — and dispatching on every keystroke would be
 * noise. Only the FINAL applied set (what hits the chart query)
 * lives in `appliedFilters`.
 */

/** Per-filter dropdown options entry. The store keeps multiple of
 *  these per filter, keyed by the query signature (search + page) so
 *  parallel search states coexist without thrashing. */
export interface FilterOptionsEntry {
  values: { value: string | number | null; label: string }[];
  total: number;
  totalApproximate: boolean;
  truncated: boolean;
  nextPage: number | null;
  fetchedAt: number; // ms — drives TTL eviction
  error?: {
    code: 'column_missing' | 'sql_error' | 'forbidden';
    message: string;
  };
}

/** Per-filter ad-hoc UI flags. columnMissing drives the "remove me"
 *  empty-state card; errorMessage shows under the dropdown. */
export interface FilterFlags {
  columnMissing: boolean;
  errorMessage: string | null;
}

/** A filter definition as returned by the BE — mirrors what the FE
 *  had been calling ConfiguredFilter. Kept loose-typed because the
 *  config blob varies by filter type. */
export interface AnalysesFilterDef {
  // Persistent id (BE-assigned).
  id: string;
  name: string;
  filterType: string;
  controlType: string;
  columnName: string;
  config: any;
  nullOption?: string | null;
  isEnabled: boolean;
  isMandatory: boolean;
  sequence: number;
}

/** Stable cache key for an options request. Mirrors the encoding
 *  the old FilterOptionsCacheService used so we can drop that
 *  service without changing the implicit contract callers expect. */
export function optionsRequestKey(search: string, page: number): string {
  return `${search ?? ''}|${page ?? 1}`;
}

/** Per-analysis lane. */
export interface AnalysisFilterLane {
  configured: AnalysesFilterDef[];
  /** Keyed [filterId][requestKey]; see optionsRequestKey. */
  options: Record<string, Record<string, FilterOptionsEntry>>;
  /** Saved-but-missing values per filter — populated by markStale. */
  stale: Record<string, string[]>;
  /** Per-filter flags (column missing, error). */
  flags: Record<string, FilterFlags>;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  loadedAt: number | null;
  loadError: string | null;
}

export interface AnalysesFilterState {
  /** All analyses currently held in memory. The slice survives
   *  navigation, so reopening an analysis within TTL hits warm
   *  state — no network round trip. */
  byAnalysis: Record<string, AnalysisFilterLane>;
  /** The analysis the user is actively viewing. Used by selectors
   *  that don't want to take an explicit analysisId from the caller. */
  activeAnalysisId: string | null;
}

export const initialAnalysesFilterState: AnalysesFilterState = {
  byAnalysis: {},
  activeAnalysisId: null,
};

export const ANALYSES_FILTER_FEATURE_KEY = 'analysesFilter';

/** TTL config. 10 minutes mirrors the dataset slice's TTL — keeps
 *  user expectations consistent ("data refreshes ~every 10 min"). */
export const FILTER_CACHE_CONFIG = {
  TTL_MS: 10 * 60 * 1000,
} as const;

/** Helper used by selectors and effects to decide if a cache entry
 *  needs to be re-fetched. */
export function isOptionsStale(fetchedAt: number | null | undefined): boolean {
  if (!fetchedAt) return true;
  return Date.now() - fetchedAt > FILTER_CACHE_CONFIG.TTL_MS;
}

/** Build an empty lane for a newly-seen analysis. */
export function emptyLane(): AnalysisFilterLane {
  return {
    configured: [],
    options: {},
    stale: {},
    flags: {},
    status: 'idle',
    loadedAt: null,
    loadError: null,
  };
}
