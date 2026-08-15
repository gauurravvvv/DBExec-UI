/**
 * dataType → allowed-operator options for the placement "Allowed operators"
 * multiselect. The operator catalog is seeded server-side (reference_data
 * `filter_operator` family); this static map mirrors the seed codes and is the
 * FE fallback when no live catalog endpoint is queried.
 */
export interface OperatorOption {
  code: string;
  label: string;
}

const ALL: OperatorOption[] = [
  { code: 'eq', label: 'FORM_BUILDER.OP.EQ' },
  { code: 'ne', label: 'FORM_BUILDER.OP.NE' },
  { code: 'gt', label: 'FORM_BUILDER.OP.GT' },
  { code: 'gte', label: 'FORM_BUILDER.OP.GTE' },
  { code: 'lt', label: 'FORM_BUILDER.OP.LT' },
  { code: 'lte', label: 'FORM_BUILDER.OP.LTE' },
  { code: 'in', label: 'FORM_BUILDER.OP.IN' },
  { code: 'not_in', label: 'FORM_BUILDER.OP.NOT_IN' },
  { code: 'between', label: 'FORM_BUILDER.OP.BETWEEN' },
  { code: 'contains', label: 'FORM_BUILDER.OP.CONTAINS' },
  { code: 'is_null', label: 'FORM_BUILDER.OP.IS_NULL' },
  { code: 'is_not_null', label: 'FORM_BUILDER.OP.IS_NOT_NULL' },
];

const BY_DATATYPE: Record<string, string[]> = {
  string: ['eq', 'ne', 'in', 'not_in', 'contains', 'is_null', 'is_not_null'],
  text: ['eq', 'ne', 'in', 'not_in', 'contains', 'is_null', 'is_not_null'],
  number: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'not_in',
    'between',
    'is_null',
    'is_not_null',
  ],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  boolean: ['eq', 'ne', 'is_null', 'is_not_null'],
};

export function operatorOptionsForDataType(
  dataType: string | null,
): OperatorOption[] {
  if (!dataType) return ALL;
  const allow = BY_DATATYPE[dataType] ?? ALL.map(o => o.code);
  return ALL.filter(o => allow.includes(o.code));
}
