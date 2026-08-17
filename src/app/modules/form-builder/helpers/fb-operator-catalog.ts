/**
 * dataType → allowed-operator options for the placement "Allowed operators"
 * multiselect.
 *
 * The operator catalog is seeded server-side (reference_data `filter_operator`
 * family). The PRIMARY source of the designer options is that LIVE catalog,
 * fetched via ReferenceDataService and filtered by `operatorOptionsFromCatalog`
 * below — which mirrors, byte-for-byte, the BE applicability rule
 * (`assertOperatorsApplicable` / `applicableOperatorCodes`). Sourcing the codes
 * from the live catalog is what keeps the persisted `allowedOperators` in lock
 * step with the seed (`neq`, not `ne`) so a save can never trip the BE
 * `ALLOWED_OPERATORS_NOT_APPLICABLE` 422.
 *
 * The static map at the bottom is ONLY a degrade-don't-crash fallback used when
 * the catalog fetch fails. Its codes and dataType keys are aligned to the BE
 * seed so that even the fallback cannot produce a non-applicable code.
 */
import type { ReferenceRow } from 'src/app/core/services/reference-data.service';

export interface OperatorOption {
  code: string;
  label: string;
}

/**
 * Compute the applicable operator options for a prompt dataType from the LIVE
 * `filter_operator` catalog rows.
 *
 * Mirrors the BE `applicableOperatorCodes` rule exactly: a row applies iff
 *   - `meta.isConnector !== true` (connectors and/or/not are never per-condition
 *     predicates), AND
 *   - `meta.arity` is set AND `meta.sqlTemplate` is set (a real predicate), AND
 *   - `meta.dataTypes` includes `'*'` OR includes the prompt dataType.
 * A null dataType defaults to `'text'` (matching the BE default).
 *
 * Rows are sorted by the catalog `sequence`. Returns `{ code, label }` so the
 * persisted multiselect value is the real seed code.
 */
export function operatorOptionsFromCatalog(
  rows: ReferenceRow[] | null | undefined,
  dataType: string | null,
): OperatorOption[] {
  if (!rows || rows.length === 0) return [];
  const dt = dataType ?? 'text';
  return [...rows]
    .filter(r => {
      const meta = (r?.meta ?? {}) as Record<string, unknown>;
      if (meta['isConnector'] === true) return false; // connectors are not per-condition ops
      if (!meta['arity'] || !meta['sqlTemplate']) return false; // not a real predicate
      const dataTypes = (meta['dataTypes'] as string[] | undefined) ?? ['*'];
      return dataTypes.includes('*') || dataTypes.includes(dt);
    })
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map(r => ({ code: r.code, label: r.label }));
}

// ── Fallback ONLY (catalog fetch failed) ───────────────────────────────────
// Codes mirror the BE seed (note `neq`, not the old broken `ne`); keys are the
// BE prompt dataType domain (text|number|date|datetime|bool|enum|uuid) so the
// fallback can never emit a non-applicable code either. Labels are plain text
// (the multiselect renders `optionLabel` verbatim, not through ngx-translate,
// exactly like the live catalog's DB labels) and mirror the seed labels.
const FALLBACK_ALL: OperatorOption[] = [
  { code: 'eq', label: 'Equals' },
  { code: 'neq', label: 'Not equal to' },
  { code: 'gt', label: 'Greater than' },
  { code: 'gte', label: 'Greater than or equal' },
  { code: 'lt', label: 'Less than' },
  { code: 'lte', label: 'Less than or equal' },
  { code: 'between', label: 'Between' },
  { code: 'not_between', label: 'Not between' },
  { code: 'contains', label: 'Contains' },
  { code: 'does_not_contain', label: 'Does not contain' },
  { code: 'starts_with', label: 'Starts with' },
  { code: 'ends_with', label: 'Ends with' },
  { code: 'before', label: 'Before' },
  { code: 'after', label: 'After' },
  { code: 'in', label: 'Is any of' },
  { code: 'not_in', label: 'Is none of' },
  { code: 'is_null', label: 'Is empty' },
  { code: 'is_not_null', label: 'Is not empty' },
  { code: 'in_last_days', label: 'In the last N days' },
];

const FALLBACK_BY_DATATYPE: Record<string, string[]> = {
  text: [
    'eq',
    'neq',
    'contains',
    'does_not_contain',
    'starts_with',
    'ends_with',
    'in',
    'not_in',
    'is_null',
    'is_not_null',
  ],
  number: [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'not_between',
    'in',
    'not_in',
    'is_null',
    'is_not_null',
  ],
  date: [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'not_between',
    'before',
    'after',
    'in_last_days',
    'is_null',
    'is_not_null',
  ],
  datetime: [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'not_between',
    'before',
    'after',
    'in_last_days',
    'is_null',
    'is_not_null',
  ],
  bool: ['eq', 'neq', 'is_null', 'is_not_null'],
  enum: ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'],
  uuid: ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'],
};

/**
 * Fallback operator options for a dataType when the live catalog is unavailable.
 * Never returns a code the BE would reject. Used only by the component's
 * catalog-fetch error path.
 */
export function operatorOptionsFallback(
  dataType: string | null,
): OperatorOption[] {
  const dt = dataType ?? 'text';
  const allow = FALLBACK_BY_DATATYPE[dt] ?? FALLBACK_ALL.map(o => o.code);
  return FALLBACK_ALL.filter(o => allow.includes(o.code));
}
