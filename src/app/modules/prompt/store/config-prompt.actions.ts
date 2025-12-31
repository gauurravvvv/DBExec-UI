/**
 * Config Prompt Actions
 * Actions for managing database schema data with dynamic keys.
 */
import { createAction, props } from '@ngrx/store';

// Load database schema data from API
export const loadSchemaData = createAction(
  '[Config Prompt] Load Schema Data',
  props<{ orgId: string; dbId: string }>()
);

export const loadSchemaDataSuccess = createAction(
  '[Config Prompt] Load Schema Data Success',
  props<{ orgId: string; dbId: string; data: any }>()
);

export const loadSchemaDataFailure = createAction(
  '[Config Prompt] Load Schema Data Failure',
  props<{ orgId: string; dbId: string; error: string }>()
);

// Set active schema key
export const setActiveSchema = createAction(
  '[Config Prompt] Set Active Schema',
  props<{ orgId: string; dbId: string }>()
);

// Clear specific schema data
export const clearSchemaData = createAction(
  '[Config Prompt] Clear Schema Data',
  props<{ orgId: string; dbId: string }>()
);

// Clear all schemas
export const clearAllSchemas = createAction(
  '[Config Prompt] Clear All Schemas'
);

// Refresh schema data (force reload from API)
export const refreshSchemaData = createAction(
  '[Config Prompt] Refresh Schema Data',
  props<{ orgId: string; dbId: string }>()
);
