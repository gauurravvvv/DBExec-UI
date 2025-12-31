/**
 * Add Analyses State Interface and Initial State
 * This file defines the shape of the state with dynamic dataset keys.
 * Data is stored with key format: dataset_{orgId}_{datasetId}
 *
 * Cache Management:
 * - Max 10 datasets cached (LRU eviction)
 * - 10 minute TTL (auto-refresh stale data)
 */

// ===== Cache Configuration =====
export const CACHE_CONFIG = {
  MAX_CACHED_DATASETS: 10, // Maximum number of datasets to keep in cache
  TTL_MINUTES: 10, // Time-to-live in minutes
  TTL_MS: 10 * 60 * 1000, // TTL in milliseconds (10 minutes)
};

// Status for each dataset entry
export type DatasetLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Individual dataset entry with access tracking
export interface DatasetEntry {
  data: any[] | null;
  status: DatasetLoadingStatus;
  error: string | null;
  loadedAt: Date | null;
  lastAccessedAt: Date | null; // For LRU tracking
}

// Main state interface with dynamic keys
export interface AddAnalysesState {
  // Dynamic dataset storage: key format is "dataset_{orgId}_{datasetId}"
  datasets: { [key: string]: DatasetEntry };
  // Currently active dataset key
  activeDatasetKey: string | null;
  // Order of dataset keys for LRU tracking (most recent at end)
  accessOrder: string[];
}

// Initial state
export const initialAddAnalysesState: AddAnalysesState = {
  datasets: {},
  activeDatasetKey: null,
  accessOrder: [],
};

// Helper to generate dataset key
export function getDatasetKey(orgId: string, datasetId: string): string {
  return `dataset_${orgId}_${datasetId}`;
}

// Helper to check if dataset is stale
export function isDatasetStale(loadedAt: Date | null): boolean {
  if (!loadedAt) return true;
  const now = new Date();
  const loadedTime = new Date(loadedAt);
  return now.getTime() - loadedTime.getTime() > CACHE_CONFIG.TTL_MS;
}

export const ADD_ANALYSES_FEATURE_KEY = 'addAnalyses';
