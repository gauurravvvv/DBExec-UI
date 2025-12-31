/**
 * Add Dataset Actions
 * Actions for managing database schema data with dynamic keys.
 */
import { createAction, props } from '@ngrx/store';

// Load database schema data from API
export const loadSchemaData = createAction(
  '[Add Dataset] Load Schema Data',
  props<{ orgId: string; dbId: string }>()
);

export const loadSchemaDataSuccess = createAction(
  '[Add Dataset] Load Schema Data Success',
  props<{ orgId: string; dbId: string; data: any }>()
);

export const loadSchemaDataFailure = createAction(
  '[Add Dataset] Load Schema Data Failure',
  props<{ orgId: string; dbId: string; error: string }>()
);

// Set active schema key
export const setActiveSchema = createAction(
  '[Add Dataset] Set Active Schema',
  props<{ orgId: string; dbId: string }>()
);

// Clear specific schema data
export const clearSchemaData = createAction(
  '[Add Dataset] Clear Schema Data',
  props<{ orgId: string; dbId: string }>()
);

// Clear all schemas
export const clearAllSchemas = createAction('[Add Dataset] Clear All Schemas');

// Refresh schema data (force reload from API)
export const refreshSchemaData = createAction(
  '[Add Dataset] Refresh Schema Data',
  props<{ orgId: string; dbId: string }>()
);
