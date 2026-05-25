/**
 * Add Dataset Selectors
 * Selectors to query schema state with dynamic keys.
 */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  AddDatasetState,
  ADD_DATASET_FEATURE_KEY,
  CACHE_CONFIG,
  getSchemaKey,
  isSchemaStale,
  LazySchemaGroup,
  LazyTableNode,
  SchemaEntry,
} from './add-dataset.state';

// Feature selector
export const selectAddDatasetState = createFeatureSelector<AddDatasetState>(
  ADD_DATASET_FEATURE_KEY,
);

// Select all schemas
export const selectAllSchemas = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.schemas,
);

// Select active schema key
export const selectActiveSchemaKey = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.activeSchemaKey,
);

// Select access order (for debugging/monitoring)
export const selectAccessOrder = createSelector(
  selectAddDatasetState,
  (state: AddDatasetState) => state.accessOrder,
);

// Select cache stats
export const selectCacheStats = createSelector(
  selectAllSchemas,
  selectAccessOrder,
  (schemas, accessOrder) => ({
    cachedCount: Object.keys(schemas).length,
    maxCached: CACHE_CONFIG.MAX_CACHED_SCHEMAS,
    accessOrder,
  }),
);

// Factory selector: Get schema entry by dbId
export const selectSchemaByKey = (dbId: string) =>
  createSelector(selectAllSchemas, (schemas): SchemaEntry | null => {
    const key = getSchemaKey(dbId);
    return schemas[key] || null;
  });

// Factory selector: Get schema data
export const selectSchemaData = (dbId: string) =>
  createSelector(
    selectSchemaByKey(dbId),
    (entry): any | null => entry?.data || null,
  );

// Factory selector: Get schema loading status
export const selectSchemaStatus = (dbId: string) =>
  createSelector(selectSchemaByKey(dbId), entry => entry?.status || 'idle');

// Factory selector: Check if schema is loading
export const selectIsSchemaLoading = (dbId: string) =>
  createSelector(selectSchemaStatus(dbId), status => status === 'loading');

// Factory selector: Check if schema is loaded
export const selectIsSchemaLoaded = (dbId: string) =>
  createSelector(selectSchemaStatus(dbId), status => status === 'loaded');

// Factory selector: Get schema error
export const selectSchemaError = (dbId: string) =>
  createSelector(selectSchemaByKey(dbId), entry => entry?.error || null);

// Factory selector: Check if schema data is stale (older than TTL)
export const selectIsSchemaStale = (dbId: string) =>
  createSelector(selectSchemaByKey(dbId), entry => {
    if (!entry || !entry.loadedAt) return true;
    return isSchemaStale(entry.loadedAt);
  });

// Factory selector: Get schema loaded time
export const selectSchemaLoadedAt = (dbId: string) =>
  createSelector(selectSchemaByKey(dbId), entry => entry?.loadedAt || null);

// Select active schema entry
export const selectActiveSchema = createSelector(
  selectAddDatasetState,
  (state): SchemaEntry | null => {
    if (!state.activeSchemaKey) return null;
    return state.schemas[state.activeSchemaKey] || null;
  },
);

// Select active schema data
export const selectActiveSchemaData = createSelector(
  selectActiveSchema,
  (entry): any | null => entry?.data || null,
);

// Select active schema status
export const selectActiveSchemaStatus = createSelector(
  selectActiveSchema,
  entry => entry?.status || 'idle',
);

// Check if active schema is stale
export const selectIsActiveSchemaStale = createSelector(
  selectActiveSchema,
  entry => {
    if (!entry || !entry.loadedAt) return true;
    return isSchemaStale(entry.loadedAt);
  },
);

// ── Lazy-tree selectors ─────────────────────────────────────────────
// Look up the schema-group node by (dbId, schemaName). Returns null
// when the cache entry, the tree, or the schema row is missing.
// Use this in the sidebar to read tablesStatus + tables for one row.
export const selectSchemaNode = (dbId: string, schemaName: string) =>
  createSelector(selectSchemaByKey(dbId), (entry): LazySchemaGroup | null => {
    const tree = entry?.data;
    if (!tree) return null;
    return tree.schemas.find(s => s.name === schemaName) ?? null;
  });

// Look up a single table node by (dbId, schemaName, tableName).
// Returns null when any link in the chain is missing.
export const selectTableNode = (
  dbId: string,
  schemaName: string,
  tableName: string,
) =>
  createSelector(
    selectSchemaNode(dbId, schemaName),
    (group): LazyTableNode | null => {
      if (!group) return null;
      return group.tables.find(t => t.name === tableName) ?? null;
    },
  );
