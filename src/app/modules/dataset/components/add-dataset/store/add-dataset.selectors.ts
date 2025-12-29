/**
 * Add Dataset Selectors
 * Selectors to query schema state with dynamic keys.
 */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  AddDatasetState,
  ADD_DATASET_FEATURE_KEY,
  SchemaEntry,
  getSchemaKey,
  isSchemaStale,
  CACHE_CONFIG,
} from './add-dataset.state';

// Feature selector
export const selectAddDatasetState = createFeatureSelector<AddDatasetState>(
  ADD_DATASET_FEATURE_KEY
);

// Select all schemas
export const selectAllSchemas = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.schemas
);

// Select active schema key
export const selectActiveSchemaKey = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.activeSchemaKey
);

// Select access order (for debugging/monitoring)
export const selectAccessOrder = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.accessOrder
);

// Select cache stats
export const selectCacheStats = createSelector(
  selectAllSchemas,
  selectAccessOrder,
  (schemas, accessOrder) => ({
    cachedCount: Object.keys(schemas).length,
    maxCached: CACHE_CONFIG.MAX_CACHED_SCHEMAS,
    accessOrder,
  })
);

// Factory selector: Get schema entry by orgId and dbId
export const selectSchemaByKey = (orgId: string, dbId: string) =>
  createSelector(selectAllSchemas, (schemas): SchemaEntry | null => {
    const key = getSchemaKey(orgId, dbId);
    return schemas[key] || null;
  });

// Factory selector: Get schema data
export const selectSchemaData = (orgId: string, dbId: string) =>
  createSelector(
    selectSchemaByKey(orgId, dbId),
    (entry): any | null => entry?.data || null
  );

// Factory selector: Get schema loading status
export const selectSchemaStatus = (orgId: string, dbId: string) =>
  createSelector(
    selectSchemaByKey(orgId, dbId),
    entry => entry?.status || 'idle'
  );

// Factory selector: Check if schema is loading
export const selectIsSchemaLoading = (orgId: string, dbId: string) =>
  createSelector(
    selectSchemaStatus(orgId, dbId),
    status => status === 'loading'
  );

// Factory selector: Check if schema is loaded
export const selectIsSchemaLoaded = (orgId: string, dbId: string) =>
  createSelector(
    selectSchemaStatus(orgId, dbId),
    status => status === 'loaded'
  );

// Factory selector: Get schema error
export const selectSchemaError = (orgId: string, dbId: string) =>
  createSelector(selectSchemaByKey(orgId, dbId), entry => entry?.error || null);

// Factory selector: Check if schema data is stale (older than TTL)
export const selectIsSchemaStale = (orgId: string, dbId: string) =>
  createSelector(selectSchemaByKey(orgId, dbId), entry => {
    if (!entry || !entry.loadedAt) return true;
    return isSchemaStale(entry.loadedAt);
  });

// Factory selector: Get schema loaded time
export const selectSchemaLoadedAt = (orgId: string, dbId: string) =>
  createSelector(
    selectSchemaByKey(orgId, dbId),
    entry => entry?.loadedAt || null
  );

// Select active schema entry
export const selectActiveSchema = createSelector(
  selectAddDatasetState,
  (state): SchemaEntry | null => {
    if (!state.activeSchemaKey) return null;
    return state.schemas[state.activeSchemaKey] || null;
  }
);

// Select active schema data
export const selectActiveSchemaData = createSelector(
  selectActiveSchema,
  (entry): any | null => entry?.data || null
);

// Select active schema status
export const selectActiveSchemaStatus = createSelector(
  selectActiveSchema,
  entry => entry?.status || 'idle'
);

// Check if active schema is stale
export const selectIsActiveSchemaStale = createSelector(
  selectActiveSchema,
  entry => {
    if (!entry || !entry.loadedAt) return true;
    return isSchemaStale(entry.loadedAt);
  }
);
