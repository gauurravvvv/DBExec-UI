/**
 * Analyses Filter Slice — actions.
 *
 * Naming follows NgRx convention: `[Source] Event` for things the
 * world tells the store about, `[Source] Action` for things components
 * ask the store to do. Effects translate the latter into network I/O
 * and dispatch the former on completion.
 */
import { createAction, props } from '@ngrx/store';
import {
  AnalysesFilterDef,
  FilterOptionsEntry,
} from './analyses-filter.state';

// ── Open / lifecycle ────────────────────────────────────────────────

/**
 * Tell the store the user is now viewing this analysis. Triggers
 * loadOpen on first sight (or whenever the lane's loadedAt is stale).
 * Components dispatch this on ngOnInit + on @Input change.
 */
export const setActiveAnalysis = createAction(
  '[Analyses Filter] Set Active Analysis',
  props<{ analysisId: string }>(),
);

export const loadOpen = createAction(
  '[Analyses Filter] Load Open',
  // `organisation` is required by the BE middleware to resolve the
  // org's shared-DB connection. Every analysis-filter call sends it;
  // omitting it crashes the BE for system admins on the default org.
  props<{ analysisId: string; organisation: string }>(),
);

export const loadOpenSuccess = createAction(
  '[Analyses Filter] Load Open Success',
  props<{
    analysisId: string;
    filters: AnalysesFilterDef[];
    /** Per-filter first-page results, keyed by filterId. */
    results: Record<string, FilterOptionsEntry>;
  }>(),
);

export const loadOpenFailure = createAction(
  '[Analyses Filter] Load Open Failure',
  props<{ analysisId: string; error: string }>(),
);

// ── Lazy per-dropdown fetch (search / paginate / scroll) ────────────

export const fetchValues = createAction(
  '[Analyses Filter] Fetch Values',
  // organisation is required for the same reason as on loadOpen.
  props<{
    analysisId: string;
    organisation: string;
    filterId: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }>(),
);

export const fetchValuesSuccess = createAction(
  '[Analyses Filter] Fetch Values Success',
  props<{
    analysisId: string;
    filterId: string;
    search: string;
    page: number;
    entry: FilterOptionsEntry;
  }>(),
);

export const fetchValuesFailure = createAction(
  '[Analyses Filter] Fetch Values Failure',
  props<{
    analysisId: string;
    filterId: string;
    search: string;
    page: number;
    error: { code: 'column_missing' | 'sql_error' | 'forbidden'; message: string };
  }>(),
);

// ── Per-filter UI signals ───────────────────────────────────────────

/** Saved-but-missing values discovered during default initialisation. */
export const markStale = createAction(
  '[Analyses Filter] Mark Stale',
  props<{ analysisId: string; filterId: string; values: string[] }>(),
);

/** Drop one stale chip — user dismissed the warning. */
export const dismissStaleValue = createAction(
  '[Analyses Filter] Dismiss Stale Value',
  props<{ analysisId: string; filterId: string; value: string }>(),
);

/** A filter's target column is no longer in the dataset SQL output. */
export const markColumnMissing = createAction(
  '[Analyses Filter] Mark Column Missing',
  props<{ analysisId: string; filterId: string; message: string | null }>(),
);

// Applied filters (the chart-query payload) live on the existing
// addAnalyses slice. No action duplication here — see
// AddAnalysesActions.applyFilters / clearAllFilters.

// ── Edit-side: dialog save / delete fold the BE result back in ──────

/** After the dialog adds / edits a filter, the new/updated row is
 *  patched in place — no need to refetch the whole list. Effects
 *  also clear cached options for that filter (column / config might
 *  have changed). */
export const filterSaved = createAction(
  '[Analyses Filter] Filter Saved',
  props<{ analysisId: string; filter: AnalysesFilterDef }>(),
);

export const filterDeleted = createAction(
  '[Analyses Filter] Filter Deleted',
  props<{ analysisId: string; filterId: string }>(),
);

// ── Invalidation ────────────────────────────────────────────────────

/** Drop everything for one analysis (e.g. user hits "Refresh Data"). */
export const invalidateAnalysis = createAction(
  '[Analyses Filter] Invalidate Analysis',
  props<{ analysisId: string }>(),
);

/** Drop only one filter's option cache (used by filterSaved effect). */
export const invalidateFilterOptions = createAction(
  '[Analyses Filter] Invalidate Filter Options',
  props<{ analysisId: string; filterId: string }>(),
);
