/**
 * Add Dataset Actions
 * Actions for managing datasource schema data with dynamic keys.
 */
import { createAction, props } from '@ngrx/store';

// Load datasource schema data from API
export const loadSchemaData = createAction(
  '[Add Dataset] Load Schema Data',
  props<{ dbId: string }>(),
);

export const loadSchemaDataSuccess = createAction(
  '[Add Dataset] Load Schema Data Success',
  props<{ dbId: string; data: any }>(),
);

export const loadSchemaDataFailure = createAction(
  '[Add Dataset] Load Schema Data Failure',
  props<{ dbId: string; error: string }>(),
);

// Set active schema key
export const setActiveSchema = createAction(
  '[Add Dataset] Set Active Schema',
  props<{ dbId: string }>(),
);

// Clear specific schema data
export const clearSchemaData = createAction(
  '[Add Dataset] Clear Schema Data',
  props<{ dbId: string }>(),
);

// Clear all schemas
export const clearAllSchemas = createAction('[Add Dataset] Clear All Schemas');

// Refresh schema data (force reload from API)
export const refreshSchemaData = createAction(
  '[Add Dataset] Refresh Schema Data',
  props<{ dbId: string }>(),
);

// ── Lazy-load: tables for one schema ────────────────────────────────
// Dispatched when the user expands a schema row in the sidebar. The
// reducer flips that schema's `tablesStatus` to 'loading'; the
// component (or an effect, if we ever add one) calls the BE and
// dispatches the success / failure variant.
export const loadTablesForSchema = createAction(
  '[Add Dataset] Load Tables For Schema',
  props<{ dbId: string; schemaName: string }>(),
);

export const loadTablesForSchemaSuccess = createAction(
  '[Add Dataset] Load Tables For Schema Success',
  props<{
    dbId: string;
    schemaName: string;
    tables: { name: string; alias?: string }[];
  }>(),
);

export const loadTablesForSchemaFailure = createAction(
  '[Add Dataset] Load Tables For Schema Failure',
  props<{
    dbId: string;
    schemaName: string;
    error: string;
  }>(),
);

// ── Lazy-load: columns for one table ────────────────────────────────
// Same pattern as tables, one level deeper.
export const loadColumnsForTable = createAction(
  '[Add Dataset] Load Columns For Table',
  props<{
    dbId: string;
    schemaName: string;
    tableName: string;
  }>(),
);

export const loadColumnsForTableSuccess = createAction(
  '[Add Dataset] Load Columns For Table Success',
  props<{
    dbId: string;
    schemaName: string;
    tableName: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      defaultValue?: string | null;
    }[];
  }>(),
);

export const loadColumnsForTableFailure = createAction(
  '[Add Dataset] Load Columns For Table Failure',
  props<{
    dbId: string;
    schemaName: string;
    tableName: string;
    error: string;
  }>(),
);
