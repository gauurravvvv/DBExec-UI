/** Pure helpers for the prompt config stepper — no Angular deps. */

export interface FilterAssembly {
  filterColumn: string;
  operator: string;
  filterValue: string;
  useRaw: boolean;
  rawFilterSql: string;
}

/** Assemble a structured "col <op> :val" WHERE fragment. */
export function buildFilterExpr(cf: FilterAssembly): string {
  if (cf.useRaw) return cf.rawFilterSql ?? '';
  if (!cf.filterColumn || !cf.operator) return '';
  // The compiler binds the value as a parameter; here we only assemble intent.
  const needsValue = !['is_null', 'is_not_null'].includes(cf.operator);
  return needsValue
    ? `${cf.filterColumn} ${cf.operator} :val`
    : `${cf.filterColumn} ${cf.operator}`;
}

/** Alias-qualify a bare column against a chosen alias (reg.name). */
export function aliasQualify(alias: string, column: string): string {
  if (!column) return '';
  return column.includes('.')
    ? column
    : `${alias || ''}.${column}`.replace(/^\./, '');
}

/** A step assembly is valid when it has a column + (an operator or raw SQL). */
export function assemblyValid(cf: FilterAssembly): boolean {
  if (!cf.filterColumn) return false;
  return cf.useRaw ? !!cf.rawFilterSql : !!cf.operator;
}
