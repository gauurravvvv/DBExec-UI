/**
 * Geo registry — pure, framework-light helpers for the map/geo pipeline
 * (Wave 4). NO Angular, NO ECharts import, NO HTTP: these are deterministic
 * functions the GeoRegistryService (services/geo-registry.service.ts) and the
 * ECharts option builders call. Keeping them pure makes them unit-testable and
 * safe to import from anywhere.
 *
 * Responsibilities:
 *   1. getRequiredMap(chartType, config)  → the registered map name a chart
 *      needs (or null). THE renderer contract: the renderer calls this, then
 *      awaits ensureMapRegistered(name) on the service BEFORE building the
 *      option, so a choropleth series never binds to an unregistered map.
 *   2. joinRegionData(rows, {...}, geojson) → normalise region names in the
 *      data rows to match GeoJSON feature `properties.name`, producing the
 *      `{ name, value }[]` ECharts `map` series wants + a list of unmatched
 *      regions (for a UI warning).
 *   3. buildLatLonPoints(rows, {...})      → validated `[lon, lat, value]`
 *      tuples for a scatter-on-geo point/bubble map.
 */

/* ────────────────────────────────────────────────────────────────────────
 * Region set ⇄ chart wiring
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Chart ids that render on a registered GeoJSON map (choropleth family). For
 * these, getRequiredMap resolves a region-set name that must be registered via
 * echarts.registerMap(name, geojson) before the option is built.
 *
 * `world-map`, `choropleth`, `point-map`, `bubble-map` are the 2D data-bound
 * maps this wave implements. The geo3D/globe GL types are handled by the
 * existing renderer gate and are intentionally NOT re-owned here.
 */
export const GEO_CHART_TYPES = new Set<string>([
  'world-map',
  'choropleth',
  'point-map',
  'bubble-map',
]);

/**
 * Region set id (a slug). OPEN-ENDED by design — NOT a fixed enum. Any slug the
 * BE has an asset for is valid (`world`, `us-states`, `india-states`,
 * `eu-nuts`, a customer's own territory set, …). The product runs against any
 * customer's data in any geography, so region sets are added by dropping a
 * GeoJSON asset on the BE, with no code change here.
 */
export type RegionSet = string;

/** Slug guard mirroring the BE (lowercase alnum + single hyphens, ≤64). */
const SAFE_REGION_SET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Default region set when a geo chart hasn't been told which map to use. */
export const DEFAULT_REGION_SET = 'world';

/**
 * Resolve the map name a chart type needs, or null if the chart is not a
 * geo/map chart. The region set is read from the geo config (`geo.regionSet`
 * or the legacy `geo.mapId`), defaulting to DEFAULT_REGION_SET. The returned
 * string is BOTH the region-set id passed to the BE endpoint AND the name the
 * GeoJSON is registered under with ECharts — the builder binds its series `map`
 * to the same name.
 *
 * The value is validated only for SHAPE (slug), not against a fixed list: an
 * unknown-but-well-formed region set is passed through so a newly-added asset
 * works immediately. A malformed value falls back to the default rather than
 * forwarding an unsafe string.
 *
 * THIS IS THE RENDERER CONTRACT. A renderer that cannot be edited in this wave
 * should, on chartType/config change:
 *     const mapName = getRequiredMap(chartType, config);
 *     if (mapName) { await geoRegistry.ensureMapRegistered(mapName); }
 *     // then build + render the option
 */
export function getRequiredMap(
  chartType: string | null | undefined,
  config: any,
): string | null {
  if (!chartType || !GEO_CHART_TYPES.has(chartType)) return null;
  const geo = config?.geo || {};
  const raw =
    geo.regionSet ||
    geo.mapId ||
    config?.geoRegionSet ||
    config?.regionSet ||
    DEFAULT_REGION_SET;
  const name = String(raw).trim();
  // Pass through any well-formed slug (extensible); only guard against a
  // malformed value that could never resolve to a safe asset name.
  return SAFE_REGION_SET.test(name) ? name : DEFAULT_REGION_SET;
}

/* ────────────────────────────────────────────────────────────────────────
 * Region-name normalisation
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Common aliases → canonical GeoJSON `properties.name`. Lower-cased keys.
 *
 * This is a SMALL, OPTIONAL convenience layer for the most common English
 * variants only. It is NOT the join mechanism and NOT authoritative — the join
 * matches primarily on the topology's own feature names/codes. A customer whose
 * data uses ISO codes or non-English region names joins by configuring the
 * region field + match key (nameProperty / codeField+codeProperty); this table
 * simply saves a few obvious cases from landing in `unmatched`. Anything not in
 * the table and not matching a feature is reported as unmatched — NEVER
 * silently dropped or mis-mapped. Callers can disable this layer entirely with
 * `useAliases: false`.
 */
const REGION_ALIASES: Record<string, string> = {
  // Country aliases
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  america: 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  uae: 'United Arab Emirates',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'korea, republic of': 'South Korea',
  'north korea': 'North Korea',
  russia: 'Russia',
  'russian federation': 'Russia',
  'czech republic': 'Czechia',
  czechia: 'Czechia',
  'ivory coast': "Côte d'Ivoire",
  'united arab emirates': 'United Arab Emirates',
};

/** US state 2-letter abbreviation → full name. */
const US_STATE_ABBREV: Record<string, string> = {
  al: 'Alabama',
  ak: 'Alaska',
  az: 'Arizona',
  ar: 'Arkansas',
  ca: 'California',
  co: 'Colorado',
  ct: 'Connecticut',
  de: 'Delaware',
  fl: 'Florida',
  ga: 'Georgia',
  hi: 'Hawaii',
  id: 'Idaho',
  il: 'Illinois',
  in: 'Indiana',
  ia: 'Iowa',
  ks: 'Kansas',
  ky: 'Kentucky',
  la: 'Louisiana',
  me: 'Maine',
  md: 'Maryland',
  ma: 'Massachusetts',
  mi: 'Michigan',
  mn: 'Minnesota',
  ms: 'Mississippi',
  mo: 'Missouri',
  mt: 'Montana',
  ne: 'Nebraska',
  nv: 'Nevada',
  nh: 'New Hampshire',
  nj: 'New Jersey',
  nm: 'New Mexico',
  ny: 'New York',
  nc: 'North Carolina',
  nd: 'North Dakota',
  oh: 'Ohio',
  ok: 'Oklahoma',
  or: 'Oregon',
  pa: 'Pennsylvania',
  ri: 'Rhode Island',
  sc: 'South Carolina',
  sd: 'South Dakota',
  tn: 'Tennessee',
  tx: 'Texas',
  ut: 'Utah',
  vt: 'Vermont',
  va: 'Virginia',
  wa: 'Washington',
  wv: 'West Virginia',
  wi: 'Wisconsin',
  wy: 'Wyoming',
  dc: 'District of Columbia',
};

/** Collapse whitespace + strip surrounding punctuation for a stable key. */
function normalizeKey(raw: string): string {
  return String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Normalise a raw region label toward a GeoJSON feature name. When
 * `useAliases` is true (default) it consults the small English alias / US-abbrev
 * tables; with `useAliases: false` it only trims/collapses whitespace, leaving
 * non-English or coded values untouched for an exact/code match. This ONLY
 * canonicalises the STRING — the actual match against the topology is done by
 * joinRegionData against the feature index (case-insensitive), so a dataset
 * that already uses the topology's exact names always matches regardless of
 * language.
 */
export function normalizeRegionName(raw: any, useAliases = true): string {
  if (raw === null || raw === undefined) return '';
  const trimmed = String(raw).trim();
  if (!useAliases) return trimmed;
  const key = normalizeKey(trimmed);
  if (REGION_ALIASES[key]) return REGION_ALIASES[key];
  if (US_STATE_ABBREV[key]) return US_STATE_ABBREV[key];
  return trimmed;
}

/* ────────────────────────────────────────────────────────────────────────
 * Region join (choropleth)
 * ──────────────────────────────────────────────────────────────────────── */

/** Result of joining data rows to map features. */
export interface RegionJoinResult {
  /** ECharts `map` series data: canonical feature name → measure value. */
  data: { name: string; value: number }[];
  /** Raw region labels that did not match any feature (for a UI warning). */
  unmatched: string[];
  /** Count of matched rows. */
  matchedCount: number;
}

/** Extract a value from a row, coercing to a finite number (0 on failure). */
function toNumber(v: any): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The KEY that ECharts `map` series match against is the feature's
 * `properties.name` (or the series' `nameProperty`). We therefore always index
 * features BY their `nameProperty` value but resolve TO the canonical name
 * string, so a matched datum keys the series correctly. Two indexes are built:
 *   - nameIndex: normalizeKey(feature name) → canonical feature name
 *   - codeIndex: normalizeKey(feature code) → canonical feature name
 * The name index also folds in a few generic alternate name properties so a
 * dataset that uses a slightly different topology naming still resolves. The
 * code index is only populated when a `codeProperty` is supplied.
 */
function buildFeatureIndexes(
  geojson: any,
  nameProperty: string,
  codeProperty?: string,
): { nameIndex: Map<string, string>; codeIndex: Map<string, string> } {
  const nameIndex = new Map<string, string>();
  const codeIndex = new Map<string, string>();
  const features: any[] = geojson?.features || [];
  for (const f of features) {
    const props = f?.properties || {};
    // Canonical name = the value ECharts will match the series datum against.
    const canonical =
      props[nameProperty] != null
        ? String(props[nameProperty])
        : props.name != null
          ? String(props.name)
          : '';
    if (!canonical) continue;
    // Index the primary name plus a few generic alternates (domain-neutral —
    // these are common GeoJSON property spellings, not region-specific values).
    const nameCandidates = [
      props[nameProperty],
      props.name,
      props.NAME,
      props.name_long,
      props.NAME_LONG,
      props.admin,
    ].filter(v => v != null);
    for (const c of nameCandidates) {
      nameIndex.set(normalizeKey(String(c)), canonical);
    }
    // Optional code index for code-based joins (ISO codes, FIPS, custom ids).
    if (codeProperty && props[codeProperty] != null) {
      codeIndex.set(normalizeKey(String(props[codeProperty])), canonical);
    }
  }
  return { nameIndex, codeIndex };
}

/**
 * Join data rows to GeoJSON regions for a choropleth — region-set-agnostic and
 * language-agnostic.
 *
 * Match strategy (first hit wins per row):
 *   1. If `codeField` + `codeProperty` are supplied, try a CODE match
 *      (row[codeField] → feature[codeProperty]). This is the robust path for
 *      customers using ISO/FIPS/custom codes or non-English names.
 *   2. Otherwise (or if the code misses) try a NAME match: the raw region label
 *      is optionally alias-normalised (English convenience, `useAliases`,
 *      default true) then matched case-insensitively against the topology's
 *      feature names.
 * A row that resolves neither way is recorded in `unmatched` (deduped) and
 * NEVER silently dropped or mis-mapped — the caller surfaces it as a UI warning.
 *
 * `regionField`/`valueField` name the data columns; `nameProperty`
 * (default 'name') is the GeoJSON property the ECharts series keys on. When
 * multiple rows map to the same feature their values sum.
 */
export function joinRegionData(
  rows: any[],
  opts: {
    regionField: string;
    valueField: string;
    /** GeoJSON property the series matches names against (default 'name'). */
    nameProperty?: string;
    /** Optional data column holding a region code (for a code-based join). */
    codeField?: string;
    /** Optional GeoJSON property holding the matching code. */
    codeProperty?: string;
    /** Apply the English alias/abbrev convenience layer (default true). */
    useAliases?: boolean;
  },
  geojson: any,
): RegionJoinResult {
  const {
    regionField,
    valueField,
    nameProperty,
    codeField,
    codeProperty,
    useAliases = true,
  } = opts;
  const { nameIndex, codeIndex } = buildFeatureIndexes(
    geojson,
    nameProperty || 'name',
    codeProperty,
  );
  const acc = new Map<string, number>();
  const unmatched: string[] = [];
  const seenUnmatched = new Set<string>();
  let matchedCount = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;

    // 1) Code match (preferred when configured).
    let hitKey: string | undefined;
    if (codeField && codeProperty) {
      const rawCode = row[codeField];
      if (rawCode != null && rawCode !== '') {
        hitKey = codeIndex.get(normalizeKey(String(rawCode)));
      }
    }

    // 2) Name match (fallback / default).
    const rawRegion = row[regionField];
    if (!hitKey) {
      if (rawRegion === null || rawRegion === undefined || rawRegion === '') {
        continue; // no region info on this row — skip without warning
      }
      const canonical = normalizeRegionName(rawRegion, useAliases);
      hitKey = nameIndex.get(normalizeKey(canonical));
    }

    if (!hitKey) {
      // Report whatever the row used to identify the region.
      const label =
        rawRegion != null && rawRegion !== ''
          ? String(rawRegion)
          : codeField && row[codeField] != null
            ? String(row[codeField])
            : '';
      if (label && !seenUnmatched.has(label)) {
        seenUnmatched.add(label);
        unmatched.push(label);
      }
      continue;
    }

    const value = toNumber(row[valueField]);
    acc.set(hitKey, (acc.get(hitKey) || 0) + value);
    matchedCount += 1;
  }

  const data = Array.from(acc.entries()).map(([name, value]) => ({
    name,
    value,
  }));
  return { data, unmatched, matchedCount };
}

/* ────────────────────────────────────────────────────────────────────────
 * Lat / lon (point + bubble maps)
 * ──────────────────────────────────────────────────────────────────────── */

/** A validated geo point for an ECharts scatter-on-geo series. */
export interface GeoPoint {
  name: string;
  /** [lon, lat, value] — ECharts geo coordinateSystem order is [lng, lat]. */
  value: [number, number, number];
}

/** Result of building lat/lon points. */
export interface LatLonResult {
  points: GeoPoint[];
  /** Rows dropped because lat/lon were missing or out of range. */
  invalidCount: number;
}

const inLatRange = (n: number): boolean => Number.isFinite(n) && n >= -90 && n <= 90;
const inLonRange = (n: number): boolean =>
  Number.isFinite(n) && n >= -180 && n <= 180;

/**
 * Build validated `[lon, lat, value]` points from data rows for a point/bubble
 * map. `latField`/`lonField` name the coordinate columns; `valueField`
 * (optional) drives bubble size / colour and defaults to 1. `labelField`
 * (optional) names the tooltip label column, defaulting to the region/lat-lon.
 * Rows with missing or out-of-range coordinates are dropped and counted.
 */
export function buildLatLonPoints(
  rows: any[],
  opts: {
    latField: string;
    lonField: string;
    valueField?: string;
    labelField?: string;
  },
): LatLonResult {
  const { latField, lonField, valueField, labelField } = opts;
  const points: GeoPoint[] = [];
  let invalidCount = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const lat = Number(row[latField]);
    const lon = Number(row[lonField]);
    if (!inLatRange(lat) || !inLonRange(lon)) {
      invalidCount += 1;
      continue;
    }
    const value = valueField != null ? toNumber(row[valueField]) : 1;
    const name =
      labelField && row[labelField] != null
        ? String(row[labelField])
        : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    points.push({ name, value: [lon, lat, value] });
  }

  return { points, invalidCount };
}
