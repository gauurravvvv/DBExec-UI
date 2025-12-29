/**
 * Add Analyses Selectors
 * Selectors to query dataset state with dynamic keys.
 */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  AddAnalysesState,
  ADD_ANALYSES_FEATURE_KEY,
  DatasetEntry,
  getDatasetKey,
  isDatasetStale,
  CACHE_CONFIG,
} from './add-analyses.state';

// Feature selector
export const selectAddAnalysesState = createFeatureSelector<AddAnalysesState>(
  ADD_ANALYSES_FEATURE_KEY
);

// Select all datasets
export const selectAllDatasets = createSelector(
  selectAddAnalysesState,
  (state: AddAnalysesState) => state.datasets
);

// Select active dataset key
export const selectActiveDatasetKey = createSelector(
  selectAddAnalysesState,
  (state: AddAnalysesState) => state.activeDatasetKey
);

// Select access order (for debugging/monitoring)
export const selectAccessOrder = createSelector(
  selectAddAnalysesState,
  (state: AddAnalysesState) => state.accessOrder
);

// Select cache stats
export const selectCacheStats = createSelector(
  selectAllDatasets,
  selectAccessOrder,
  (datasets, accessOrder) => ({
    cachedCount: Object.keys(datasets).length,
    maxCached: CACHE_CONFIG.MAX_CACHED_DATASETS,
    accessOrder,
  })
);

// Factory selector: Get dataset entry by orgId and datasetId
export const selectDatasetByKey = (orgId: string, datasetId: string) =>
  createSelector(selectAllDatasets, (datasets): DatasetEntry | null => {
    const key = getDatasetKey(orgId, datasetId);
    return datasets[key] || null;
  });

// Factory selector: Get dataset data
export const selectDatasetData = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetByKey(orgId, datasetId),
    (entry): any[] | null => entry?.data || null
  );

// Factory selector: Get dataset loading status
export const selectDatasetStatus = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetByKey(orgId, datasetId),
    entry => entry?.status || 'idle'
  );

// Factory selector: Check if dataset is loading
export const selectIsDatasetLoading = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetStatus(orgId, datasetId),
    status => status === 'loading'
  );

// Factory selector: Check if dataset is loaded
export const selectIsDatasetLoaded = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetStatus(orgId, datasetId),
    status => status === 'loaded'
  );

// Factory selector: Get dataset error
export const selectDatasetError = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetByKey(orgId, datasetId),
    entry => entry?.error || null
  );

// Factory selector: Check if dataset data is stale (older than TTL)
export const selectIsDatasetStale = (orgId: string, datasetId: string) =>
  createSelector(selectDatasetByKey(orgId, datasetId), entry => {
    if (!entry || !entry.loadedAt) return true;
    return isDatasetStale(entry.loadedAt);
  });

// Factory selector: Get dataset loaded time
export const selectDatasetLoadedAt = (orgId: string, datasetId: string) =>
  createSelector(
    selectDatasetByKey(orgId, datasetId),
    entry => entry?.loadedAt || null
  );

// Select active dataset entry
export const selectActiveDataset = createSelector(
  selectAddAnalysesState,
  (state): DatasetEntry | null => {
    if (!state.activeDatasetKey) return null;
    return state.datasets[state.activeDatasetKey] || null;
  }
);

// Select active dataset data
export const selectActiveDatasetData = createSelector(
  selectActiveDataset,
  (entry): any[] | null => entry?.data || null
);

// Select active dataset status
export const selectActiveDatasetStatus = createSelector(
  selectActiveDataset,
  entry => entry?.status || 'idle'
);

// Check if active dataset is stale
export const selectIsActiveDatasetStale = createSelector(
  selectActiveDataset,
  entry => {
    if (!entry || !entry.loadedAt) return true;
    return isDatasetStale(entry.loadedAt);
  }
);
