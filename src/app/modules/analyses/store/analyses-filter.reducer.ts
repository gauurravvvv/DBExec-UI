/**
 * Analyses Filter Slice — reducer.
 *
 * Every handler is a pure function. Network I/O lives in effects;
 * the reducer only mutates state in response to the Success/Failure
 * actions effects dispatch.
 *
 * Per-analysis isolation: every handler ensures a lane exists for
 * the target analysisId before patching it. Lanes survive navigation
 * so re-opening an analysis within TTL hits warm state.
 */
import { createReducer, on } from '@ngrx/store';
import * as Actions from './analyses-filter.actions';
import {
  AnalysesFilterState,
  AnalysisFilterLane,
  emptyLane,
  FILTER_CACHE_CONFIG,
  initialAnalysesFilterState,
  optionsRequestKey,
} from './analyses-filter.state';
// Applied filters (the final payload sent to the chart query) live on
// the existing add-analyses slice. This slice handles only the
// per-filter metadata + option cache + UI flags.

/** Helper — ensures a lane exists, returning the patched state. */
function withLane(
  state: AnalysesFilterState,
  analysisId: string,
  patch: (lane: AnalysisFilterLane) => AnalysisFilterLane,
): AnalysesFilterState {
  const current = state.byAnalysis[analysisId] ?? emptyLane();
  return {
    ...state,
    byAnalysis: {
      ...state.byAnalysis,
      [analysisId]: patch(current),
    },
  };
}

export const analysesFilterReducer = createReducer(
  initialAnalysesFilterState,

  // ── Active analysis ─────────────────────────────────────────────
  on(
    Actions.setActiveAnalysis,
    (state, { analysisId }): AnalysesFilterState => ({
      ...state,
      activeAnalysisId: analysisId,
      // Eagerly ensure the lane exists so selectors can return defaults
      // before the first network call resolves.
      byAnalysis: {
        ...state.byAnalysis,
        [analysisId]: state.byAnalysis[analysisId] ?? emptyLane(),
      },
    }),
  ),

  // ── Open (list + values) ────────────────────────────────────────
  // We only flip to 'loading' if the effect will actually fetch.
  // The effect short-circuits when the lane is already loaded AND
  // within TTL; reflect the same freshness rule here so the
  // reducer doesn't strand the lane in 'loading' on a no-op
  // dispatch. Lanes that ARE stale (or never loaded) move to
  // 'loading' as expected.
  on(Actions.loadOpen, (state, { analysisId }) =>
    withLane(state, analysisId, lane => {
      const fresh =
        lane.status === 'loaded' &&
        lane.loadedAt != null &&
        Date.now() - lane.loadedAt < FILTER_CACHE_CONFIG.TTL_MS;
      if (fresh) return lane; // No-op — the effect will skip the call.
      return { ...lane, status: 'loading', loadError: null };
    }),
  ),

  on(Actions.loadOpenSuccess, (state, { analysisId, filters, results }) =>
    withLane(state, analysisId, lane => {
      // Patch options for every filter that came back with a page-1
      // entry. Existing entries for other (search, page) signatures
      // stay put — they're keyed separately.
      const nextOptions = { ...lane.options };
      const nextFlags = { ...lane.flags };
      const now = Date.now();
      for (const [filterId, entry] of Object.entries(results || {})) {
        const perFilter = { ...(nextOptions[filterId] ?? {}) };
        perFilter[optionsRequestKey('', 1)] = {
          ...entry,
          fetchedAt: entry.fetchedAt || now,
        };
        nextOptions[filterId] = perFilter;
        if (entry.error?.code === 'column_missing') {
          // Surface the missing-column error so the bar can render
          // the empty-state card without inspecting options.
          nextFlags[filterId] = {
            columnMissing: true,
            errorMessage: entry.error.message,
          };
        } else if (!entry.error) {
          // Heal a previously-set flag — a fresh successful fetch
          // means the column is back / the error has resolved.
          // Without this, a column that got dropped and then
          // restored would keep showing the error card.
          if (nextFlags[filterId]) delete nextFlags[filterId];
        }
      }
      return {
        ...lane,
        configured: filters || [],
        options: nextOptions,
        flags: nextFlags,
        status: 'loaded',
        loadedAt: now,
        loadError: null,
      };
    }),
  ),

  on(Actions.loadOpenFailure, (state, { analysisId, error }) =>
    withLane(state, analysisId, lane => ({
      ...lane,
      status: 'error',
      loadError: error,
    })),
  ),

  // ── Lazy per-dropdown fetch ─────────────────────────────────────
  on(
    Actions.fetchValuesSuccess,
    (state, { analysisId, filterId, search, page, entry }) =>
      withLane(state, analysisId, lane => {
        const perFilter = { ...(lane.options[filterId] ?? {}) };
        perFilter[optionsRequestKey(search, page)] = {
          ...entry,
          fetchedAt: entry.fetchedAt || Date.now(),
        };
        const nextFlags = { ...lane.flags };
        if (entry.error?.code === 'column_missing') {
          nextFlags[filterId] = {
            columnMissing: true,
            errorMessage: entry.error.message,
          };
        } else if (!entry.error && nextFlags[filterId]) {
          // Successful fetch — heal any previously-set error flag.
          delete nextFlags[filterId];
        }
        return {
          ...lane,
          options: { ...lane.options, [filterId]: perFilter },
          flags: nextFlags,
        };
      }),
  ),

  on(
    Actions.fetchValuesFailure,
    (state, { analysisId, filterId, search, page, error }) =>
      withLane(state, analysisId, lane => {
        const perFilter = { ...(lane.options[filterId] ?? {}) };
        perFilter[optionsRequestKey(search, page)] = {
          values: [],
          total: 0,
          totalApproximate: false,
          truncated: false,
          nextPage: null,
          fetchedAt: Date.now(),
          error,
        };
        const nextFlags = { ...lane.flags };
        if (error.code === 'column_missing') {
          nextFlags[filterId] = {
            columnMissing: true,
            errorMessage: error.message,
          };
        }
        return {
          ...lane,
          options: { ...lane.options, [filterId]: perFilter },
          flags: nextFlags,
        };
      }),
  ),

  // ── Staleness ──────────────────────────────────────────────────
  on(Actions.markStale, (state, { analysisId, filterId, values }) =>
    withLane(state, analysisId, lane => ({
      ...lane,
      stale: { ...lane.stale, [filterId]: values },
    })),
  ),

  on(Actions.dismissStaleValue, (state, { analysisId, filterId, value }) =>
    withLane(state, analysisId, lane => {
      const current = lane.stale[filterId] || [];
      const next = current.filter(v => v !== value);
      return {
        ...lane,
        stale: { ...lane.stale, [filterId]: next },
      };
    }),
  ),

  on(Actions.markColumnMissing, (state, { analysisId, filterId, message }) =>
    withLane(state, analysisId, lane => ({
      ...lane,
      flags: {
        ...lane.flags,
        [filterId]: { columnMissing: true, errorMessage: message },
      },
    })),
  ),

  // ── Edit-side patches ──────────────────────────────────────────
  on(Actions.filterSaved, (state, { analysisId, filter }) =>
    withLane(state, analysisId, lane => {
      const idx = lane.configured.findIndex(f => f.id === filter.id);
      const nextConfigured =
        idx >= 0
          ? lane.configured.map((f, i) => (i === idx ? filter : f))
          : [...lane.configured, filter];
      // Saving a filter may have changed its column or config; drop
      // any cached option pages for it so the next dropdown open
      // re-fetches from BE.
      const nextOptions = { ...lane.options };
      delete nextOptions[filter.id];
      // Reset per-filter flags so a previously-column-missing error
      // can heal after the user fixes the saved column.
      const nextFlags = { ...lane.flags };
      delete nextFlags[filter.id];
      const nextStale = { ...lane.stale };
      delete nextStale[filter.id];
      return {
        ...lane,
        configured: nextConfigured,
        options: nextOptions,
        flags: nextFlags,
        stale: nextStale,
      };
    }),
  ),

  on(Actions.filterDeleted, (state, { analysisId, filterId }) =>
    withLane(state, analysisId, lane => {
      const nextOptions = { ...lane.options };
      delete nextOptions[filterId];
      const nextFlags = { ...lane.flags };
      delete nextFlags[filterId];
      const nextStale = { ...lane.stale };
      delete nextStale[filterId];
      return {
        ...lane,
        configured: lane.configured.filter(f => f.id !== filterId),
        options: nextOptions,
        flags: nextFlags,
        stale: nextStale,
      };
    }),
  ),

  // ── Invalidation ───────────────────────────────────────────────
  on(Actions.invalidateAnalysis, (state, { analysisId }) => {
    if (!state.byAnalysis[analysisId]) return state;
    const next = { ...state.byAnalysis };
    delete next[analysisId];
    return { ...state, byAnalysis: next };
  }),

  on(Actions.invalidateFilterOptions, (state, { analysisId, filterId }) =>
    withLane(state, analysisId, lane => {
      if (!lane.options[filterId]) return lane;
      const nextOptions = { ...lane.options };
      delete nextOptions[filterId];
      return { ...lane, options: nextOptions };
    }),
  ),
);
