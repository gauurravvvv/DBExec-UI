/**
 * Analyses Filter Slice — selectors.
 *
 * Two-arg selectors (`(state, analysisId)` style) use the props
 * pattern so consumers can target a specific analysis without
 * mutating the active id. Same-result memoisation gives us free
 * OnPush change-detection wins.
 */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  ANALYSES_FILTER_FEATURE_KEY,
  AnalysesFilterState,
  AnalysisFilterLane,
  emptyLane,
  FilterOptionsEntry,
  optionsRequestKey,
} from './analyses-filter.state';

const featureSelector = createFeatureSelector<AnalysesFilterState>(
  ANALYSES_FILTER_FEATURE_KEY,
);

export const selectActiveAnalysisId = createSelector(
  featureSelector,
  s => s.activeAnalysisId,
);

/**
 * Lane for a specific analysis. Always returns a non-null lane (an
 * empty one for analyses not yet loaded) so consumers don't have to
 * guard nullability everywhere.
 */
export const selectLane = (analysisId: string | null) =>
  createSelector(featureSelector, (s): AnalysisFilterLane => {
    if (!analysisId) return emptyLane();
    return s.byAnalysis[analysisId] ?? emptyLane();
  });

export const selectConfiguredFilters = (analysisId: string | null) =>
  createSelector(selectLane(analysisId), lane => lane.configured);

export const selectFilterLoadStatus = (analysisId: string | null) =>
  createSelector(selectLane(analysisId), lane => lane.status);

export const selectFilterLoadError = (analysisId: string | null) =>
  createSelector(selectLane(analysisId), lane => lane.loadError);

/**
 * Get cached options for one filter's (search, page) signature.
 * Returns null when nothing is cached so callers can decide whether
 * to dispatch a fetch. Freshness check is delegated to the caller
 * (effect or selector composition) because some flows want stale
 * data while a re-fetch is in flight.
 */
export const selectFilterOptions = (
  analysisId: string | null,
  filterId: string,
  search = '',
  page = 1,
) =>
  createSelector(selectLane(analysisId), (lane): FilterOptionsEntry | null => {
    const key = optionsRequestKey(search, page);
    return lane.options[filterId]?.[key] ?? null;
  });

/** First-page options for a filter — used by the prefetch flow. */
export const selectFirstPageOptions = (
  analysisId: string | null,
  filterId: string,
) => selectFilterOptions(analysisId, filterId, '', 1);

export const selectFilterStale = (analysisId: string | null, filterId: string) =>
  createSelector(
    selectLane(analysisId),
    lane => lane.stale[filterId] ?? [],
  );

export const selectFilterFlags = (analysisId: string | null, filterId: string) =>
  createSelector(
    selectLane(analysisId),
    lane =>
      lane.flags[filterId] ?? { columnMissing: false, errorMessage: null },
  );
