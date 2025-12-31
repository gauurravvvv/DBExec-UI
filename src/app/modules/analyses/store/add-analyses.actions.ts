/**
 * Add Analyses Actions
 * Actions for managing dataset data with dynamic keys.
 */
import { createAction, props } from '@ngrx/store';

// Load dataset graph data from API
export const loadDatasetData = createAction(
  '[Add Analyses] Load Dataset Data',
  props<{ orgId: string; datasetId: string }>()
);

export const loadDatasetDataSuccess = createAction(
  '[Add Analyses] Load Dataset Data Success',
  props<{ orgId: string; datasetId: string; data: any[] }>()
);

export const loadDatasetDataFailure = createAction(
  '[Add Analyses] Load Dataset Data Failure',
  props<{ orgId: string; datasetId: string; error: string }>()
);

// Set active dataset key
export const setActiveDataset = createAction(
  '[Add Analyses] Set Active Dataset',
  props<{ orgId: string; datasetId: string }>()
);

// Clear specific dataset data
export const clearDatasetData = createAction(
  '[Add Analyses] Clear Dataset Data',
  props<{ orgId: string; datasetId: string }>()
);

// Clear all datasets
export const clearAllDatasets = createAction(
  '[Add Analyses] Clear All Datasets'
);
