/**
 * Add Analyses Reducer
 * Handles state transitions for dynamic dataset storage.
 * Implements LRU cache with max size and access tracking.
 */
import { createReducer, on } from '@ngrx/store';
import {
  initialAddAnalysesState,
  AddAnalysesState,
  getDatasetKey,
  CACHE_CONFIG,
  DatasetEntry,
} from './add-analyses.state';
import * as AddAnalysesActions from './add-analyses.actions';

/**
 * Helper: Update access order for LRU tracking
 * Moves the key to the end of the array (most recently used)
 */
function updateAccessOrder(accessOrder: string[], key: string): string[] {
  // Remove key if it exists, then add to end
  const filtered = accessOrder.filter(k => k !== key);
  return [...filtered, key];
}

/**
 * Helper: Evict oldest datasets if over limit
 * Returns updated datasets and accessOrder
 */
function evictOldestIfNeeded(
  datasets: { [key: string]: DatasetEntry },
  accessOrder: string[],
  currentKey: string
): { datasets: { [key: string]: DatasetEntry }; accessOrder: string[] } {
  let newDatasets = { ...datasets };
  let newAccessOrder = [...accessOrder];

  // Evict oldest entries until we're at or below the limit
  while (
    Object.keys(newDatasets).length > CACHE_CONFIG.MAX_CACHED_DATASETS &&
    newAccessOrder.length > 0
  ) {
    const oldestKey = newAccessOrder[0];
    // Don't evict the current key we're trying to add
    if (oldestKey !== currentKey) {
      const { [oldestKey]: _, ...remaining } = newDatasets;
      newDatasets = remaining;
      newAccessOrder = newAccessOrder.slice(1);
    } else {
      break;
    }
  }

  return { datasets: newDatasets, accessOrder: newAccessOrder };
}

export const addAnalysesReducer = createReducer(
  initialAddAnalysesState,

  // Load dataset data - set loading status and update access order
  on(
    AddAnalysesActions.loadDatasetData,
    (state, { orgId, datasetId }): AddAnalysesState => {
      const key = getDatasetKey(orgId, datasetId);
      const now = new Date();

      // Update access order
      const newAccessOrder = updateAccessOrder(state.accessOrder, key);

      return {
        ...state,
        activeDatasetKey: key,
        accessOrder: newAccessOrder,
        datasets: {
          ...state.datasets,
          [key]: {
            data: state.datasets[key]?.data || null,
            status: 'loading',
            error: null,
            loadedAt: state.datasets[key]?.loadedAt || null,
            lastAccessedAt: now,
          },
        },
      };
    }
  ),

  // Load dataset data success - store data and handle LRU eviction
  on(
    AddAnalysesActions.loadDatasetDataSuccess,
    (state, { orgId, datasetId, data }): AddAnalysesState => {
      const key = getDatasetKey(orgId, datasetId);
      const now = new Date();

      // First, add the new dataset
      const updatedDatasets = {
        ...state.datasets,
        [key]: {
          data,
          status: 'loaded' as const,
          error: null,
          loadedAt: now,
          lastAccessedAt: now,
        },
      };

      // Update access order
      const updatedAccessOrder = updateAccessOrder(state.accessOrder, key);

      // Evict oldest if over limit
      const { datasets: finalDatasets, accessOrder: finalAccessOrder } =
        evictOldestIfNeeded(updatedDatasets, updatedAccessOrder, key);

      return {
        ...state,
        datasets: finalDatasets,
        accessOrder: finalAccessOrder,
      };
    }
  ),

  // Load dataset data failure
  on(
    AddAnalysesActions.loadDatasetDataFailure,
    (state, { orgId, datasetId, error }): AddAnalysesState => {
      const key = getDatasetKey(orgId, datasetId);
      const now = new Date();

      return {
        ...state,
        datasets: {
          ...state.datasets,
          [key]: {
            data: null,
            status: 'error',
            error,
            loadedAt: null,
            lastAccessedAt: now,
          },
        },
      };
    }
  ),

  // Set active dataset - update access order
  on(
    AddAnalysesActions.setActiveDataset,
    (state, { orgId, datasetId }): AddAnalysesState => {
      const key = getDatasetKey(orgId, datasetId);
      const now = new Date();

      // Update last accessed time if exists
      const existingEntry = state.datasets[key];
      const updatedDatasets = existingEntry
        ? {
            ...state.datasets,
            [key]: { ...existingEntry, lastAccessedAt: now },
          }
        : state.datasets;

      return {
        ...state,
        activeDatasetKey: key,
        accessOrder: updateAccessOrder(state.accessOrder, key),
        datasets: updatedDatasets,
      };
    }
  ),

  // Clear specific dataset
  on(
    AddAnalysesActions.clearDatasetData,
    (state, { orgId, datasetId }): AddAnalysesState => {
      const key = getDatasetKey(orgId, datasetId);
      const { [key]: _, ...remainingDatasets } = state.datasets;
      return {
        ...state,
        datasets: remainingDatasets,
        accessOrder: state.accessOrder.filter(k => k !== key),
        activeDatasetKey:
          state.activeDatasetKey === key ? null : state.activeDatasetKey,
      };
    }
  ),

  // Clear all datasets
  on(
    AddAnalysesActions.clearAllDatasets,
    (state): AddAnalysesState => ({
      ...state,
      datasets: {},
      accessOrder: [],
      activeDatasetKey: null,
    })
  )
);
