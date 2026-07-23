/**
 * axis-label.util — derive human, market-grade axis names for a visual from
 * its field mapping + aggregate, and detect fields that shouldn't be summed.
 *
 * WHY: the ECharts option builder only sees `visual.config`, not the visual's
 * `xAxisColumn` / `yAxisColumn` / `aggregate`. Left to itself it stamps the
 * literal placeholders "Category" / "Value" on the axes — which reads exactly
 * like an unfinished template. A real BI tool labels the value axis with the
 * measure AND its aggregate ("Sum of total_charge") and the category axis with
 * the dimension's display name ("sex"). These helpers compute those strings so
 * the editor can stamp them onto the transient `config._xAxisFieldLabel` /
 * `_yAxisFieldLabel` render hints the builder reads as a fallback when the
 * author hasn't typed an explicit axis label.
 *
 * GENERALISED: nothing here assumes a customer's schema. The measure verb comes
 * from the i18n ANALYSES.AGG.* catalogue; the field display name comes from the
 * dataset field metadata (columnToView) with the raw column as the fallback;
 * the non-aggregatable / geo detection is driven by the BE-supplied
 * `semanticType` + `continuousDiscrete` field metadata (never hardcoded column
 * names), so it works for any dataset in any geography.
 */

/** i18n key for a measure's aggregate verb — matches ANALYSES.AGG.* labels. */
const AGG_KEY: Record<string, string> = {
  sum: 'ANALYSES.AGG.SUM',
  avg: 'ANALYSES.AGG.AVG',
  count: 'ANALYSES.AGG.COUNT',
  min: 'ANALYSES.AGG.MIN',
  max: 'ANALYSES.AGG.MAX',
  count_distinct: 'ANALYSES.AGG.COUNT_DISTINCT',
  median: 'ANALYSES.AGG.MEDIAN',
  percentile: 'ANALYSES.AGG.PERCENTILE',
  stddev: 'ANALYSES.AGG.STDDEV',
  variance: 'ANALYSES.AGG.VARIANCE',
};

/**
 * A minimal translator surface — `TranslateService.instant`. Passed in so this
 * stays framework-light + unit-testable (no Angular import).
 */
export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/**
 * Resolve a field's display name from the merged field list. Prefers the
 * curated `columnToView`, falls back to the raw column key. Empty string when
 * the column is unset so callers can treat "no field" as "no derived label".
 */
export function fieldDisplayName(
  column: string | null | undefined,
  fields: any[] | null | undefined,
): string {
  if (!column) return '';
  const f = (fields || []).find(
    (x: any) => x?.columnToUse === column || x?.columnToView === column,
  );
  return (f?.columnToView || column || '').toString();
}

/**
 * The derived NAME for a measure axis: "<AggVerb> of <field>" when an aggregate
 * is set (e.g. "Sum of total_charge"), otherwise just the field's display name.
 * `count` reads a touch better as "Count of <field>" too. Returns '' when there
 * is no field so the builder falls back to its own empty default (never the
 * literal "Value").
 */
export function measureAxisName(
  column: string | null | undefined,
  aggregate: string | null | undefined,
  fields: any[] | null | undefined,
  t: Translate,
): string {
  const name = fieldDisplayName(column, fields);
  if (!name) return '';
  const aggKey = aggregate ? AGG_KEY[aggregate] : null;
  if (!aggKey) return name;
  const verb = t(aggKey);
  // i18n-templated "<verb> of <field>" so locales can reorder ("of" grammar
  // differs by language). ANALYSES.AXIS_AGG_OF = "{{agg}} of {{field}}".
  return t('ANALYSES.AXIS_AGG_OF', { agg: verb, field: name });
}

/**
 * The derived NAME for a category / dimension axis: the field's display name,
 * or '' when unset (builder falls back to '' — never the literal "Category").
 */
export function dimensionAxisName(
  column: string | null | undefined,
  fields: any[] | null | undefined,
): string {
  return fieldDisplayName(column, fields);
}

/** semanticType values that denote a geographic coordinate / location field. */
const GEO_SEMANTIC_TYPES = new Set<string>([
  'geo_lat',
  'geo_lon',
  'geo_city',
  'geo_postal',
]);

/**
 * A field whose semanticType marks it as a geographic coordinate (lat/lon).
 * Summing / averaging a coordinate is almost never meaningful — a real BI tool
 * warns rather than silently charting SUM(longitude). Driven entirely by the
 * BE `semanticType` metadata, so it generalises to any dataset.
 */
export function isGeoCoordinateField(field: any): boolean {
  const st =
    typeof field?.semanticType === 'string'
      ? field.semanticType.toLowerCase()
      : '';
  return st === 'geo_lat' || st === 'geo_lon';
}

/** Broader geo check (coordinate OR city/postal) for hint copy. */
export function isGeoField(field: any): boolean {
  const st =
    typeof field?.semanticType === 'string'
      ? field.semanticType.toLowerCase()
      : '';
  return GEO_SEMANTIC_TYPES.has(st);
}

/**
 * True when aggregating this field as a measure is likely NOT meaningful:
 * a geographic coordinate, or a field the BE marked non-aggregatable
 * (doNotAggregate) / discrete. Used to surface a soft inline hint in the
 * measure well — never to hard-block (the author can still override).
 */
export function isNonAggregatableMeasure(field: any): boolean {
  if (!field) return false;
  if (isGeoCoordinateField(field)) return true;
  if (field?.doNotAggregate === true) return true;
  return false;
}

/**
 * Find the dataset field for a column key in the merged field list.
 * Small shared lookup so callers don't re-implement the columnToUse/View match.
 */
export function findFieldByColumn(
  column: string | null | undefined,
  fields: any[] | null | undefined,
): any | null {
  if (!column) return null;
  return (
    (fields || []).find(
      (x: any) => x?.columnToUse === column || x?.columnToView === column,
    ) ?? null
  );
}
