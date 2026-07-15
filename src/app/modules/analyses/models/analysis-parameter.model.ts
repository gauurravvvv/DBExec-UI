/**
 * Analysis parameter — FE model (spec §4.1). A reusable typed input on
 * an analysis, substituted into the dataset SQL as `{{param.<key>}}` and
 * usable in filter / alert value inputs.
 *
 * Shape mirrors the `analysis_parameter` entity the BE persists and the
 * mirrored Zod validator at src/app/shared/validators/analysis-parameters.
 */

import type { ValueType } from '../utils/field-type.util';

/** Data types a parameter can hold. `enum` adds a fixed option list. */
export type ParameterDataType = ValueType | 'enum';

/** One selectable option for an enum parameter. */
export interface ParameterAllowedValue {
  label: string;
  value: string | number | boolean;
}

/** Persisted analysis parameter as returned by the list endpoint. */
export interface AnalysisParameter {
  id: string;
  analysisId: string;
  name: string;
  /** Identifier substituted as `{{param.<key>}}`. */
  key: string;
  description?: string | null;
  dataType: ParameterDataType;
  /** Default value; runtime type follows `dataType`. */
  defaultValue: any;
  /** Only for `enum` — the dropdown options. */
  allowedValues?: ParameterAllowedValue[] | null;
  /** Optional dataset column that drives value autocomplete in the UI. */
  bindColumn?: string | null;
  isRequired: boolean;
  sequence: number;
}

/**
 * A resolved parameter value at run time — what the parameter bar emits
 * upward and what the run-query payload carries under `parameters`.
 */
export interface ParameterValue {
  key: string;
  value: any;
}

/**
 * The `enum` data type maps to a value dropdown; everything else maps to
 * the canonical typed control via the field-type util. Kept here so the
 * parameter bar and the shared TypedValueInput agree.
 */
export function parameterValueType(p: AnalysisParameter): ValueType {
  if (p.dataType === 'enum') return 'string';
  return p.dataType;
}
