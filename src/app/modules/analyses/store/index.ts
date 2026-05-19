/**
 * Add Analyses Store — barrel export.
 *
 * Two slices live in this folder:
 *   addAnalyses        — dataset cache + the legacy appliedFilters slot.
 *   analysesFilter     — filter metadata + per-filter option cache,
 *                        stale-value tracking, column-missing flags.
 */

// ── addAnalyses slice ──────────────────────────────────────────────
export * as AddAnalysesActions from './add-analyses.actions';
export { addAnalysesReducer } from './add-analyses.reducer';
export * from './add-analyses.selectors';
export * from './add-analyses.state';

// ── analysesFilter slice ───────────────────────────────────────────
export * as AnalysesFilterActions from './analyses-filter.actions';
export { analysesFilterReducer } from './analyses-filter.reducer';
export * from './analyses-filter.selectors';
export * from './analyses-filter.state';
export { AnalysesFilterEffects } from './analyses-filter.effects';
