/**
 * Config Prompt Reducer
 * Handles state transitions for dynamic schema storage.
 * Implements LRU cache with max size and access tracking.
 */
import { createReducer, on } from '@ngrx/store';
import {
  initialConfigPromptState,
  ConfigPromptState,
  getSchemaKey,
  CACHE_CONFIG,
  SchemaEntry,
} from './config-prompt.state';
import * as ConfigPromptActions from './config-prompt.actions';

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
  currentKey: string
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

export const configPromptReducer = createReducer(
  initialConfigPromptState,

  // Load schema data - set loading status and update access order
  on(
    ConfigPromptActions.loadSchemaData,
    (state, { orgId, dbId }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
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
    }
  ),

  // Load schema data success - store data and handle LRU eviction
  on(
    ConfigPromptActions.loadSchemaDataSuccess,
    (state, { orgId, dbId, data }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
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
    }
  ),

  // Load schema data failure
  on(
    ConfigPromptActions.loadSchemaDataFailure,
    (state, { orgId, dbId, error }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
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
    }
  ),

  // Set active schema - update access order
  on(
    ConfigPromptActions.setActiveSchema,
    (state, { orgId, dbId }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
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
    }
  ),

  // Clear specific schema
  on(
    ConfigPromptActions.clearSchemaData,
    (state, { orgId, dbId }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
      const { [key]: _, ...remainingSchemas } = state.schemas;
      return {
        ...state,
        schemas: remainingSchemas,
        accessOrder: state.accessOrder.filter(k => k !== key),
        activeSchemaKey:
          state.activeSchemaKey === key ? null : state.activeSchemaKey,
      };
    }
  ),

  // Clear all schemas
  on(
    ConfigPromptActions.clearAllSchemas,
    (state): ConfigPromptState => ({
      ...state,
      schemas: {},
      accessOrder: [],
      activeSchemaKey: null,
    })
  ),

  // Refresh schema data - clear existing and reload
  on(
    ConfigPromptActions.refreshSchemaData,
    (state, { orgId, dbId }): ConfigPromptState => {
      const key = getSchemaKey(orgId, dbId);
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
    }
  )
);
