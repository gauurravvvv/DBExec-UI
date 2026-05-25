/**
 * Add Dataset Reducer
 * Handles state transitions for dynamic schema storage.
 * Implements LRU cache with max size and access tracking.
 */
import { createReducer, on } from '@ngrx/store';
import * as AddDatasetActions from './add-dataset.actions';
import {
  AddDatasetState,
  CACHE_CONFIG,
  getSchemaKey,
  initialAddDatasetState,
  LazySchemaGroup,
  LazySchemaTree,
  LazyTableNode,
  SchemaEntry,
} from './add-dataset.state';

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
 * Helper: Evict oldest schemas if over limit
 * Returns updated schemas and accessOrder
 */
function evictOldestIfNeeded(
  schemas: { [key: string]: SchemaEntry },
  accessOrder: string[],
  currentKey: string,
): { schemas: { [key: string]: SchemaEntry }; accessOrder: string[] } {
  let newSchemas = { ...schemas };
  let newAccessOrder = [...accessOrder];

  // Evict oldest entries until we're at or below the limit
  while (
    Object.keys(newSchemas).length > CACHE_CONFIG.MAX_CACHED_SCHEMAS &&
    newAccessOrder.length > 0
  ) {
    const oldestKey = newAccessOrder[0];
    // Don't evict the current key we're trying to add
    if (oldestKey !== currentKey) {
      const { [oldestKey]: _, ...remaining } = newSchemas;
      newSchemas = remaining;
      newAccessOrder = newAccessOrder.slice(1);
    } else {
      break;
    }
  }

  return { schemas: newSchemas, accessOrder: newAccessOrder };
}

export const addDatasetReducer = createReducer(
  initialAddDatasetState,

  // Load schema data - set loading status and update access order
  on(
    AddDatasetActions.loadSchemaData,
    (state, { dbId }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const now = new Date();

      // Update access order
      const newAccessOrder = updateAccessOrder(state.accessOrder, key);

      return {
        ...state,
        activeSchemaKey: key,
        accessOrder: newAccessOrder,
        schemas: {
          ...state.schemas,
          [key]: {
            data: state.schemas[key]?.data || null,
            status: 'loading',
            error: null,
            loadedAt: state.schemas[key]?.loadedAt || null,
            lastAccessedAt: now,
          },
        },
      };
    },
  ),

  // Load schema data success - store data and handle LRU eviction
  on(
    AddDatasetActions.loadSchemaDataSuccess,
    (state, { dbId, data }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const now = new Date();

      // First, add the new schema
      const updatedSchemas = {
        ...state.schemas,
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
      const { schemas: finalSchemas, accessOrder: finalAccessOrder } =
        evictOldestIfNeeded(updatedSchemas, updatedAccessOrder, key);

      return {
        ...state,
        schemas: finalSchemas,
        accessOrder: finalAccessOrder,
      };
    },
  ),

  // Load schema data failure
  on(
    AddDatasetActions.loadSchemaDataFailure,
    (state, { dbId, error }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const now = new Date();

      return {
        ...state,
        schemas: {
          ...state.schemas,
          [key]: {
            data: null,
            status: 'error',
            error,
            loadedAt: null,
            lastAccessedAt: now,
          },
        },
      };
    },
  ),

  // Set active schema - update access order
  on(
    AddDatasetActions.setActiveSchema,
    (state, { dbId }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const now = new Date();

      // Update last accessed time if exists
      const existingEntry = state.schemas[key];
      const updatedSchemas = existingEntry
        ? {
            ...state.schemas,
            [key]: { ...existingEntry, lastAccessedAt: now },
          }
        : state.schemas;

      return {
        ...state,
        activeSchemaKey: key,
        accessOrder: updateAccessOrder(state.accessOrder, key),
        schemas: updatedSchemas,
      };
    },
  ),

  // Clear specific schema
  on(
    AddDatasetActions.clearSchemaData,
    (state, { dbId }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const { [key]: _, ...remainingSchemas } = state.schemas;
      return {
        ...state,
        schemas: remainingSchemas,
        accessOrder: state.accessOrder.filter(k => k !== key),
        activeSchemaKey:
          state.activeSchemaKey === key ? null : state.activeSchemaKey,
      };
    },
  ),

  // Clear all schemas
  on(
    AddDatasetActions.clearAllSchemas,
    (state): AddDatasetState => ({
      ...state,
      schemas: {},
      accessOrder: [],
      activeSchemaKey: null,
    }),
  ),

  // Refresh schema data - clear existing and reload
  on(
    AddDatasetActions.refreshSchemaData,
    (state, { dbId }): AddDatasetState => {
      const key = getSchemaKey(dbId);
      const now = new Date();

      // Clear the existing cached data and set to loading
      return {
        ...state,
        schemas: {
          ...state.schemas,
          [key]: {
            data: null,
            status: 'loading',
            error: null,
            loadedAt: null,
            lastAccessedAt: now,
          },
        },
      };
    },
  ),

  // ── Lazy-load: tables for one schema ─────────────────────────────
  // Three handlers (loading/success/failure) update the nested
  // `tablesStatus`/`tables` on the matching schema row. Immutable
  // updates all the way down so OnPush components in the sidebar
  // pick up the change.
  on(
    AddDatasetActions.loadTablesForSchema,
    (state, { dbId, schemaName }): AddDatasetState =>
      updateSchemaNode(state, dbId, schemaName, group => ({
        ...group,
        tablesStatus: 'loading',
        tablesError: null,
      })),
  ),
  on(
    AddDatasetActions.loadTablesForSchemaSuccess,
    (state, { dbId, schemaName, tables }): AddDatasetState =>
      updateSchemaNode(state, dbId, schemaName, group => ({
        ...group,
        tablesStatus: 'loaded',
        tablesError: null,
        // Preserve any column data we already had for tables that
        // re-appear in the new list — re-fetching the table list
        // shouldn't blow away expanded columns. Identity by table name.
        tables: tables.map(t => {
          const existing = group.tables.find(
            existing => existing.name === t.name,
          );
          if (existing) return { ...existing, alias: t.alias ?? existing.alias };
          return {
            name: t.name,
            alias: t.alias,
            columnsStatus: 'idle' as const,
            columnsError: null,
            columns: [],
          };
        }),
      })),
  ),
  on(
    AddDatasetActions.loadTablesForSchemaFailure,
    (state, { dbId, schemaName, error }): AddDatasetState =>
      updateSchemaNode(state, dbId, schemaName, group => ({
        ...group,
        tablesStatus: 'error',
        tablesError: error,
      })),
  ),

  // ── Lazy-load: columns for one table ─────────────────────────────
  on(
    AddDatasetActions.loadColumnsForTable,
    (state, { dbId, schemaName, tableName }): AddDatasetState =>
      updateTableNode(state, dbId, schemaName, tableName, table => ({
        ...table,
        columnsStatus: 'loading',
        columnsError: null,
      })),
  ),
  on(
    AddDatasetActions.loadColumnsForTableSuccess,
    (
      state,
      { dbId, schemaName, tableName, columns },
    ): AddDatasetState =>
      updateTableNode(state, dbId, schemaName, tableName, table => ({
        ...table,
        columnsStatus: 'loaded',
        columnsError: null,
        columns: columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          defaultValue: c.defaultValue ?? null,
        })),
      })),
  ),
  on(
    AddDatasetActions.loadColumnsForTableFailure,
    (state, { dbId, schemaName, tableName, error }): AddDatasetState =>
      updateTableNode(state, dbId, schemaName, tableName, table => ({
        ...table,
        columnsStatus: 'error',
        columnsError: error,
      })),
  ),
);

/**
 * Immutably update the schema-group identified by (dbId, schemaName)
 * using the provided patch function. No-op when the cache key or the
 * schema row is missing — callers shouldn't see a lazy-load action
 * for a schema they didn't fetch.
 */
function updateSchemaNode(
  state: AddDatasetState,
  dbId: string,
  schemaName: string,
  patch: (group: LazySchemaGroup) => LazySchemaGroup,
): AddDatasetState {
  const key = getSchemaKey(dbId);
  const entry = state.schemas[key];
  if (!entry || !entry.data) return state;

  const tree: LazySchemaTree = entry.data;
  const idx = tree.schemas.findIndex(s => s.name === schemaName);
  if (idx < 0) return state;

  const nextSchemas = tree.schemas.slice();
  nextSchemas[idx] = patch(tree.schemas[idx]);
  return {
    ...state,
    schemas: {
      ...state.schemas,
      [key]: {
        ...entry,
        data: { ...tree, schemas: nextSchemas },
        lastAccessedAt: new Date(),
      },
    },
  };
}

/**
 * Immutably update the table node identified by (dbId, schemaName,
 * tableName). Same no-op behaviour as updateSchemaNode when the
 * lookup fails.
 */
function updateTableNode(
  state: AddDatasetState,
  dbId: string,
  schemaName: string,
  tableName: string,
  patch: (table: LazyTableNode) => LazyTableNode,
): AddDatasetState {
  return updateSchemaNode(state, dbId, schemaName, group => {
    const idx = group.tables.findIndex(t => t.name === tableName);
    if (idx < 0) return group;
    const nextTables = group.tables.slice();
    nextTables[idx] = patch(group.tables[idx]);
    return { ...group, tables: nextTables };
  });
}
