/**
 * Config Prompt State Interface and Initial State
 * This file defines the shape of the state with dynamic database schema keys.
 * Data is stored with key format: schema_{orgId}_{dbId}
 *
 * Cache Management:
 * - Max 10 database schemas cached (LRU eviction)
 * - 10 minute TTL (auto-refresh stale data)
 */

// ===== Cache Configuration =====
export const CACHE_CONFIG = {
  MAX_CACHED_SCHEMAS: 10, // Maximum number of database schemas to keep in cache
  TTL_MINUTES: 10, // Time-to-live in minutes
  TTL_MS: 10 * 60 * 1000, // TTL in milliseconds (10 minutes)
};

// Status for each database schema entry
export type SchemaLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Individual database schema entry with access tracking
export interface SchemaEntry {
  data: any | null;
  status: SchemaLoadingStatus;
  error: string | null;
  loadedAt: Date | null;
  lastAccessedAt: Date | null; // For LRU tracking
}

// Main state interface with dynamic keys
export interface ConfigPromptState {
  // Dynamic schema storage: key format is "schema_{orgId}_{dbId}"
  schemas: { [key: string]: SchemaEntry };
  // Currently active schema key
  activeSchemaKey: string | null;
  // Order of schema keys for LRU tracking (most recent at end)
  accessOrder: string[];
}

// Initial state
export const initialConfigPromptState: ConfigPromptState = {
  schemas: {},
  activeSchemaKey: null,
  accessOrder: [],
};

// Helper to generate schema key
export function getSchemaKey(orgId: string, dbId: string): string {
  return `schema_${orgId}_${dbId}`;
}

// Helper to check if schema is stale
export function isSchemaStale(loadedAt: Date | null): boolean {
  if (!loadedAt) return true;
  const now = new Date();
  const loadedTime = new Date(loadedAt);
  return now.getTime() - loadedTime.getTime() > CACHE_CONFIG.TTL_MS;
}

export const CONFIG_PROMPT_FEATURE_KEY = 'configPrompt';
