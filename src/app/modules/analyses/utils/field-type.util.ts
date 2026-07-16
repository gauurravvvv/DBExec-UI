/**
 * field-type.util — the single source of truth that maps a dataset
 * field's raw SQL `dataType` string (e.g. 'integer', 'varchar',
 * 'timestamp without time zone', 'boolean') onto the app's canonical
 * value type, and from there onto the deterministic input control.
 *
 * Spec §7 (type-defined controls): a field's `dataType` deterministically
 * selects the input control across filters, parameters, and alert-condition
 * value inputs — date → calendar/daterange, number → numeric/range,
 * string → dropdown/multiselect, boolean → toggle. Keeping the mapping in
 * ONE module means the three surfaces can never drift.
 *
 * The canonical `ValueType` intentionally matches the alerts validator's
 * `AlertValueType` ('string' | 'number' | 'date' | 'boolean') so the shared
 * TypedValueInput can be driven from the same vocabulary everywhere.
 */

/** Canonical value type — the vocabulary every typed control speaks. */
export type ValueType = 'string' | 'number' | 'date' | 'boolean';

/**
 * Coarse classification used by the visual builder's typed encoding:
 * a `measure` is a quantity you aggregate (numeric), a `dimension` is a
 * category/date you group by. Boolean is treated as a dimension.
 */
export type FieldKind = 'measure' | 'dimension';

/**
 * The analysis-filter `filterType` values the BE filterEngine dispatches on.
 * Mirrors filter-dialog.FILTER_OPERATOR_KEYS keys.
 */
export type FilterTypeSuggestion =
  | 'category'
  | 'numeric_equality'
  | 'numeric_range'
  | 'time_equality'
  | 'time_range'
  | 'boolean';

/**
 * Map a raw SQL dataType to the canonical value type. Postgres type names
 * (and the common aliases the schema introspection returns) are matched by
 * substring so we tolerate qualifiers like 'timestamp without time zone',
 * 'character varying', 'numeric(10,2)', 'double precision', etc.
 *
 * Unknown / null types fall back to 'string' — the safest control (a
 * value dropdown with free-text) that never mis-coerces.
 */
export function toValueType(dataType: string | null | undefined): ValueType {
  if (!dataType) return 'string';
  const t = dataType.toLowerCase();

  // Boolean first — 'bool' would otherwise be caught by nothing, but keep
  // it ahead of any future overlap.
  if (t.includes('bool')) return 'boolean';

  // Date / time — check before numeric because 'timestamp' contains no
  // digits but 'time' is unambiguous here.
  if (
    t.includes('timestamp') ||
    t.includes('date') ||
    t === 'time' ||
    t.startsWith('time ') ||
    t.includes('time with') ||
    t.includes('time without') ||
    t.includes('interval')
  ) {
    return 'date';
  }

  // Numeric family.
  if (
    t.includes('int') || // int, integer, bigint, smallint, int2/4/8
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float') ||
    t.includes('serial') ||
    t.includes('money')
  ) {
    return 'number';
  }

  // Everything textual (char/varchar/text/citext/uuid/enum/json/…) is a
  // string for control-selection purposes.
  return 'string';
}

/**
 * Measure vs dimension for the visual builder's typed encoding. Numeric
 * fields are measures (they go on the value/Y role); string/date/boolean
 * fields are dimensions (category/X role).
 */
export function toFieldKind(dataType: string | null | undefined): FieldKind {
  return toValueType(dataType) === 'number' ? 'measure' : 'dimension';
}

/**
 * Measure vs dimension for a DatasetField, honouring the BE-supplied field
 * metadata when present. The BE now stamps an explicit `role` ('measure' |
 * 'dimension') on curated fields; when set it wins over the raw-type
 * heuristic so an author's semantic choice (e.g. a numeric ID marked as a
 * dimension) routes correctly. Falls back to `effectiveDataType` (the BE's
 * type after any override) then the raw `dataType`, so fields WITHOUT
 * metadata behave exactly as before — additive, never breaking.
 */
export function fieldKindFromMeta(field: any): FieldKind {
  const role = typeof field?.role === 'string' ? field.role.toLowerCase() : '';
  if (role === 'measure' || role === 'dimension') return role;
  const type = field?.effectiveDataType ?? field?.dataType;
  return toFieldKind(type);
}

/**
 * The field's default aggregate, if the BE metadata declares one. Read when a
 * measure is dropped so the aggregate dropdown pre-selects the author's
 * intended default instead of blank. Returns null when absent so the caller
 * leaves the existing selection untouched.
 */
export function defaultAggregationOf(field: any): string | null {
  const agg = field?.defaultAggregation;
  return typeof agg === 'string' && agg.trim() ? agg.trim() : null;
}

/**
 * Suggested analysis-filter `filterType` for a field, derived from its
 * dataType. Used by the filter-dialog to pre-select a sensible type the
 * moment the user picks a column (they can still override).
 *
 *   number  → numeric_equality (range is a one-click switch from there)
 *   date    → time_range
 *   boolean → boolean
 *   string  → category
 */
export function suggestFilterType(
  dataType: string | null | undefined,
): FilterTypeSuggestion {
  switch (toValueType(dataType)) {
    case 'number':
      return 'numeric_equality';
    case 'date':
      return 'time_range';
    case 'boolean':
      return 'boolean';
    default:
      return 'category';
  }
}

/**
 * The role a chart column-picker slot expects, expressed as the coarse
 * FieldKind, keyed by RoleKey. Value-bearing roles want measures; the
 * category/axis/grouping roles want dimensions. Used by the chart sidebar
 * to grey out fields whose type doesn't fit the slot the user is filling.
 *
 * Roles absent from this map accept any field (no constraint).
 */
export const ROLE_EXPECTED_KIND: Record<string, FieldKind> = {
  // Measures (quantities).
  yAxis: 'measure',
  zAxis: 'measure',
  open: 'measure',
  high: 'measure',
  low: 'measure',
  close: 'measure',
  sample: 'measure',
  valueColumns: 'measure',
  indicators: 'measure',
  lng: 'measure',
  lat: 'measure',
  // Dimensions (categories / time).
  xAxis: 'dimension',
  parent: 'dimension',
  time: 'dimension',
  // `dimensions` (parallel axes) intentionally omitted — parallel plots
  // mix numeric + categorical axes freely, so no constraint.
};

/**
 * Does `dataType` satisfy the expected kind for `role`? Returns true when
 * the role has no constraint (unlisted) so unconstrained slots accept
 * anything. The builder uses this to soft-disable ill-typed fields rather
 * than hard-block — a permissive fallback keeps power users unblocked.
 */
export function fieldFitsRole(
  role: string,
  dataType: string | null | undefined,
): boolean {
  const expected = ROLE_EXPECTED_KIND[role];
  if (!expected) return true;
  return toFieldKind(dataType) === expected;
}

/**
 * Metadata-aware variant of {@link fieldFitsRole}. Uses the field's explicit
 * `role` metadata (via {@link fieldKindFromMeta}) so a field the BE marked as a
 * measure/dimension is judged by that intent rather than its raw SQL type.
 * Fields without metadata degrade to the same dataType heuristic, so behaviour
 * is unchanged for legacy fields.
 */
export function fieldFitsRoleMeta(role: string, field: any): boolean {
  const expected = ROLE_EXPECTED_KIND[role];
  if (!expected) return true;
  return fieldKindFromMeta(field) === expected;
}
