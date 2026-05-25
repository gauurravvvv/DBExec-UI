/**
 * Add Dataset State Interface and Initial State
 * This file defines the shape of the state with dynamic datasource schema keys.
 * Data is stored with key format: schema_{dbId}
 *
 * Cache Management:
 * - Max 10 datasource schemas cached (LRU eviction)
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

/**
 * Status of one lazy-loaded node within the cached schema tree. Each
 * schema-row carries a `tablesStatus`; each table-row carries a
 * `columnsStatus`. The top-level SchemaLoadingStatus on `SchemaEntry`
 * tracks the schema-LIST fetch itself (the GET /schemas call); these
 * nested statuses track the per-schema and per-table follow-up fetches.
 */
export type SchemaNodeStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Per-column metadata stored on a fully-loaded table node. Mirrors
 * the shape produced by `transformColumnsResponse` so the existing
 * IntelliSense / hover providers can read columns straight off the
 * node without another transform.
 */
export interface LazyTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeySchema?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

/**
 * Per-table node carried inside a LazySchemaGroup. Created in the
 * 'idle' state when the user expands its parent schema and the BE
 * returns the table list; flips to 'loading' / 'loaded' / 'error'
 * when the user expands the table itself and we fetch the columns.
 */
export interface LazyTableNode {
  name: string;
  alias?: string;
  columnsStatus: SchemaNodeStatus;
  columnsError: string | null;
  columns: LazyTableColumn[]; // empty until columnsStatus === 'loaded'
}

/**
 * Per-schema node carried inside a LazySchemaTree. Created in the
 * 'idle' state when the schema list is fetched; flips to 'loading'
 * / 'loaded' / 'error' on first expand.
 */
export interface LazySchemaGroup {
  name: string;
  tablesStatus: SchemaNodeStatus;
  tablesError: string | null;
  tables: LazyTableNode[]; // empty until tablesStatus === 'loaded'
}

/**
 * Top-level cached payload for a (org, datasource) pair. Replaces
 * the eager `DatasourceSchema` shape that the legacy bulk endpoint
 * returned. `name` and `dbType` mirror what the FE
 * IntelliSense layer reads off the schema record.
 */
export interface LazySchemaTree {
  name: string;
  dbType?: string;
  schemas: LazySchemaGroup[];
}

// Individual database schema entry with access tracking
export interface SchemaEntry {
  data: LazySchemaTree | null;
  status: SchemaLoadingStatus;
  error: string | null;
  loadedAt: Date | null;
  lastAccessedAt: Date | null; // For LRU tracking
}

// Main state interface with dynamic keys
export interface AddDatasetState {
  // Dynamic schema storage: key format is "schema_{dbId}"
  schemas: { [key: string]: SchemaEntry };
  // Currently active schema key
  activeSchemaKey: string | null;
  // Order of schema keys for LRU tracking (most recent at end)
  accessOrder: string[];
}

// Initial state
export const initialAddDatasetState: AddDatasetState = {
  schemas: {},
  activeSchemaKey: null,
  accessOrder: [],
};

// Helper to generate schema key
export function getSchemaKey(dbId: string): string {
  return `schema_${dbId}`;
}

// Helper to check if schema is stale
export function isSchemaStale(loadedAt: Date | null): boolean {
  if (!loadedAt) return true;
  const now = new Date();
  const loadedTime = new Date(loadedAt);
  return now.getTime() - loadedTime.getTime() > CACHE_CONFIG.TTL_MS;
}

export const ADD_DATASET_FEATURE_KEY = 'addDataset';
