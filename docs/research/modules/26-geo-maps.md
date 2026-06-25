# 26 · Geo, Maps, Specialty Charts

> Anything where the visual sits on a map (choropleth, points,
> heatmap, flow) or a non-cartesian surface (radar, sankey, parallel
> coordinates, treemap, sunburst). The shared dependency: data
> needs to be reshaped into the format the chart library expects,
> with reusable patterns for geo-projection and spatial bucketing.
>
> Sister modules:
> [06 · Analysis & Visual Builder](06-analysis-visual-builder.md)
> (where these chart types are picked), [02 · Semantic Layer](02-semantic-layer.md)
> (geo dimensions are first-class), [25 · AI](25-ai-insights.md)
> (suggest a map chart when columns are lat/lng).

**Depends on:** Analysis (06), Datasource (01), Cache (05)
**Unblocks:** "Where are my customers?", logistics dashboards,
  fleet tracking
**Maturity:** 🟡 some chart types exist in the registry; geo
  isn't wired beyond a basic ECharts world-map demo

---

## 1. Industry baseline

| Tool | Choropleth | Points | Heatmap | Flow | Custom polygon |
|---|---|---|---|---|---|
| **Tableau** | ✓ | ✓ | ✓ | ✓ (paths) | ✓ (shapefile) |
| **Power BI** | ✓ (Azure Maps) | ✓ | ✓ | partial | ✗ |
| **Looker** | ✓ | ✓ | ✓ | partial | partial |
| **Metabase** | partial | ✓ | partial | ✗ | ✗ |
| **Superset** | ✓ | ✓ | ✓ | ✓ (deck.gl) | partial |
| **Hex** | via Mapbox/deck.gl plugin | ✓ | ✓ | ✓ | ✓ |
| **Sigma** | ✓ (Mapbox) | ✓ | ✓ | ✗ | ✗ |

**The patterns to copy:**

- **Tile provider pluggable**: customers want OSM (free), Mapbox
  (paid), MapTiler, Google. Don't lock in.
- **Coordinate columns auto-detected**: a column called `latitude`
  + a column called `longitude` (or `lat`/`lng`/`location`) gets
  the map suggested in the chart picker.
- **H3 / S2 spatial bucketing** for heatmaps over millions of
  points; doing it client-side melts the browser.
- **GeoJSON layer support** for custom shapes (sales territories,
  delivery zones, etc.).
- **Projections beyond Mercator**: equal-area for choropleths,
  globe-orthographic for "from space" views, locally-correct
  projections (e.g. Albers USA) for region-specific maps.

## 2. DBExec today

- ECharts world-map chart type is in the registry but has no
  proper integration — no tile provider config, no projection
  choice, no GeoJSON upload.
- Specialty non-geo charts (sankey, parallel, treemap, sunburst,
  radar, theme-river, candlestick, boxplot, gauge3d, line3d,
  bar3d, scatter3d, globe, lines3d, surface, polygons3d,
  flowgl, linesgl) exist in `charts.constants.ts` but their data
  transformer paths are stubby.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| GEO-G01 | Tile provider configuration per org | P0 | M |
| GEO-G02 | OSM / Mapbox / MapTiler / Google integrations | P0 | M |
| GEO-G03 | Choropleth with `region_name → value` mapping | P0 | M |
| GEO-G04 | Point map with lat/lng auto-detect | P0 | M |
| GEO-G05 | Cluster markers when zoomed out | P0 | M |
| GEO-G06 | Heatmap layer with H3 bucketing | P1 | M |
| GEO-G07 | Flow / arc layer (lat/lng pairs) | P1 | M |
| GEO-G08 | GeoJSON upload for custom polygons | P1 | M |
| GEO-G09 | Projection picker (Mercator / Albers / Orthographic) | P1 | S |
| GEO-G10 | Geocoding service (text address → lat/lng) | P1 | M |
| GEO-G11 | Reverse geocoding (lat/lng → country / region) | P2 | M |
| GEO-G12 | "Drill into region" interaction | P2 | M |
| GEO-G13 | Country code normalisation (ISO 3166) | P0 | S |
| GEO-G14 | Map zoom level + center as filter state | P1 | S |
| GEO-G15 | Sankey full-feature wiring | P1 | M |
| GEO-G16 | Parallel-coordinates full-feature wiring | P1 | M |
| GEO-G17 | Treemap + sunburst full-feature wiring | P1 | M |
| GEO-G18 | Radar full-feature wiring | P1 | S |
| GEO-G19 | Boxplot + violin full-feature wiring | P1 | M |
| GEO-G20 | Candlestick (financial) full-feature wiring | P2 | M |
| GEO-G21 | Globe / 3D earth (ECharts-GL) | P2 | M |
| GEO-G22 | Theme-river / streamgraph | P2 | S |

## 4. Target architecture

### 4.1 Tile provider configuration

```sql
CREATE TABLE org_geo_config (
  organisation_id   uuid PRIMARY KEY,
  tile_provider     varchar(32) NOT NULL DEFAULT 'osm',
                                              -- osm | mapbox | maptiler | google | self
  tile_url_template text,                     -- {z}/{x}/{y}.png URL pattern
  api_key_enc       bytea,                     -- per-org provider key (encrypted)
  attribution       varchar(255) NOT NULL DEFAULT '© OpenStreetMap contributors',
  max_zoom          int NOT NULL DEFAULT 18,
  default_zoom      int NOT NULL DEFAULT 4,
  default_center    jsonb NOT NULL DEFAULT '{"lat":0,"lng":0}'::jsonb,
  geocoder_provider varchar(32),
  geocoder_key_enc  bytea
);
```

Provider presets baked into code:

```ts
export const TILE_PROVIDER_PRESETS = {
  osm: {
    name: 'OpenStreetMap',
    tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    requiresKey: false,
  },
  mapbox: {
    name: 'Mapbox',
    tileUrlTemplate: 'https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/256/{z}/{x}/{y}?access_token={KEY}',
    attribution: '© Mapbox © OpenStreetMap',
    maxZoom: 22,
    requiresKey: true,
  },
  maptiler: {
    name: 'MapTiler',
    tileUrlTemplate: 'https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={KEY}',
    attribution: '© MapTiler © OpenStreetMap',
    maxZoom: 22,
    requiresKey: true,
  },
  google: {
    name: 'Google Maps',
    tileUrlTemplate: '',     // Google requires their JS SDK; tile-only URL doesn't exist
    attribution: '© Google',
    maxZoom: 22,
    requiresKey: true,
    useJsSdk: true,
  },
};
```

### 4.2 Choropleth — schema mapping

```ts
export interface ChoroplethConfig {
  geoJsonId: string;                   // ID of an uploaded GeoJSON or built-in
  regionProperty: string;              // e.g. "ISO_A2" — joins on this property
  valueColumn: string;                 // dataset column with the value
  joinColumn: string;                  // dataset column with the region key
  scale: 'linear'|'log'|'quantile';
  colorRange: [string, string];         // hex endpoints
  nullColor: string;
}

// Built-in GeoJSON catalogue
export const BUILTIN_GEOJSONS = {
  'world-countries':  { url: '/geo/world-countries-110m.json', property: 'ISO_A2' },
  'us-states':        { url: '/geo/us-states.json',            property: 'STATE_CODE' },
  'us-counties':      { url: '/geo/us-counties.json',          property: 'FIPS' },
  'eu-nuts2':         { url: '/geo/eu-nuts2.json',             property: 'NUTS_ID' },
  // ...
};
```

`org_geojson` table for customer-uploaded polygons:

```sql
CREATE TABLE org_geojson (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  description     varchar(500),
  url             text NOT NULL,        -- signed S3 URL
  size_bytes      int,
  feature_count   int,                  -- number of polygons
  bounds          jsonb,                 -- [west, south, east, north]
  default_property varchar(64),          -- which feature.property to join on
  created_by      uuid,
  created_on      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);
```

Upload pipeline:

```ts
// POST /geo/upload  multipart geojson file
async function uploadGeoJson(req, res) {
  const file = req.file;
  const text = file.buffer.toString('utf8');
  let geo: any;
  try { geo = JSON.parse(text); }
  catch { return sendResponse(res, false, 400, 'geo.invalid_json'); }
  if (geo.type !== 'FeatureCollection') {
    return sendResponse(res, false, 400, 'geo.not_feature_collection');
  }
  // Validate each feature
  const features = geo.features as any[];
  if (!Array.isArray(features) || features.length === 0) {
    return sendResponse(res, false, 400, 'geo.no_features');
  }
  if (features.length > 10000) {
    return sendResponse(res, false, 400, 'geo.too_many_features');
  }
  // Compute bounds + suggest a join property
  const bounds = computeBounds(features);
  const candidateKeys = inferJoinKeys(features);

  // Upload + persist
  const key = `geo/${res.locals.orgData.id}/${randomUUID()}.geojson`;
  await s3.upload({ Bucket: process.env.GEO_BUCKET!, Key: key, Body: file.buffer }).promise();

  const row = await OrgGeoJson.save({
    organisationId: res.locals.orgData.id,
    name: req.body.name,
    description: req.body.description,
    url: signedUrlForKey(key, 365 * 24 * 3600),
    sizeBytes: file.size,
    featureCount: features.length,
    bounds,
    defaultProperty: candidateKeys[0],
    createdBy: res.locals.loggedInId,
  });
  return sendResponse(res, true, 200, '', { geoJson: row, candidateKeys });
}
```

### 4.3 Point map auto-detect

```ts
// Inside the visual-builder picker, when the user selects "point map":
function autoDetectLatLng(columns: ColumnMeta[]) {
  const latCandidates = ['latitude', 'lat', 'y_coord'];
  const lngCandidates = ['longitude', 'lng', 'long', 'x_coord'];
  const lat = columns.find(c => latCandidates.includes(c.name.toLowerCase()))
           ?? columns.find(c => c.type === 'numeric' && /^lat/i.test(c.name));
  const lng = columns.find(c => lngCandidates.includes(c.name.toLowerCase()))
           ?? columns.find(c => c.type === 'numeric' && /^(lng|lon|long)/i.test(c.name));
  return { lat: lat?.name, lng: lng?.name };
}
```

### 4.4 H3 spatial bucketing for heatmaps

Client-side rendering of 1M points kills the browser. Pre-aggregate
on the BE using H3 hex cells:

```ts
import { latLngToCell, cellToBoundary } from 'h3-js';

// BE: when the chart is configured as heatmap with H3 bucketing,
// the data fetch is wrapped in an aggregation.
async function bucketByH3(rows: any[], latCol: string, lngCol: string, resolution: number, valueCol?: string) {
  const buckets = new Map<string, { value: number; count: number }>();
  for (const r of rows) {
    const lat = Number(r[latCol]);
    const lng = Number(r[lngCol]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cell = latLngToCell(lat, lng, resolution);
    const b = buckets.get(cell) ?? { value: 0, count: 0 };
    b.value += valueCol ? Number(r[valueCol] ?? 0) : 1;
    b.count += 1;
    buckets.set(cell, b);
  }
  return Array.from(buckets.entries()).map(([cell, b]) => ({
    cell,
    boundary: cellToBoundary(cell, true),    // [lng, lat] pairs forming a hex
    value: b.value,
    count: b.count,
  }));
}

// Endpoint
// POST /visuals/:id/heatmap  body: { resolution: 7 }
async function bucketedHeatmap(req, res) {
  const visual = await loadVisual(req.params.id);
  const data = await runVisualQuery(visual);
  const buckets = await bucketByH3(
    data.rows,
    visual.visualConfig.config.latColumn,
    visual.visualConfig.config.lngColumn,
    Number(req.body.resolution ?? 7),
    visual.visualConfig.config.valueColumn,
  );
  return sendResponse(res, true, 200, '', { buckets });
}
```

H3 resolution table (rough hex edge length):

```
0  → 1107 km
1  → 419 km
2  → 158 km
3  → 60 km
4  → 23 km
5  → 8.5 km
6  → 3.2 km
7  → 1.2 km
8  → 460 m
9  → 175 m
10 → 65 m
```

FE picks resolution by zoom level: zoom 4 → resolution 3, zoom 10
→ resolution 7, etc.

### 4.5 Country code normalisation

```ts
// shared/services/geo/countryNormalize.ts
import countryAlpha from 'i18n-iso-countries';

countryAlpha.registerLocale(require('i18n-iso-countries/langs/en.json'));

export function normalizeCountry(input: string): string | null {
  // Accept 'US', 'USA', 'United States', 'us-en', 'États-Unis'
  if (input.length === 2) {
    return countryAlpha.alpha2ToAlpha3(input.toUpperCase()) ? input.toUpperCase() : null;
  }
  if (input.length === 3) {
    return countryAlpha.alpha3ToAlpha2(input.toUpperCase());
  }
  return countryAlpha.getAlpha2Code(input, 'en');
}
```

Applied at dataset-field level: a field marked `valueType: 'country'`
gets normalised at compile time. Custom field formulas use
`normalize_country(col)` to opt in.

### 4.6 Geocoding service

For "convert text address → lat/lng" workflows:

```ts
// shared/services/geo/geocoder.ts
export interface Geocoder {
  forward(address: string): Promise<{ lat: number; lng: number; confidence: number } | null>;
  reverse(lat: number, lng: number): Promise<{ country?: string; region?: string; city?: string } | null>;
}

class MapboxGeocoder implements Geocoder {
  constructor(private apiKey: string) {}
  async forward(address: string) {
    const resp = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${this.apiKey}&limit=1`,
    );
    const j = await resp.json();
    const f = j.features?.[0];
    if (!f) return null;
    return {
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      confidence: f.relevance ?? 0.5,
    };
  }
  async reverse(lat: number, lng: number) {
    /* ... */
  }
}

class NominatimGeocoder implements Geocoder { /* OSM-based, free, rate-limited */ }
class GoogleGeocoder implements Geocoder { /* Maps Geocoding API */ }
```

Endpoint that augments datasets:

```ts
// POST /datasets/:id/geocode  body: { addressColumn, latColumn, lngColumn }
async function geocodeDataset(req, res) {
  const { addressColumn, latColumn, lngColumn } = req.body;
  const cfg = await OrgGeoConfig.findOne({ where: { organisationId: res.locals.orgData.id } });
  const geocoder = providerFor(cfg);

  // Stream rows, call geocoder, write back lat/lng columns
  // Throttle: 5 req/sec to free Nominatim, 10 to Mapbox
  // Cache results — same address shouldn't be geocoded twice
  const cache = new Map<string, { lat: number; lng: number } | null>();
  // ... pseudo-pipeline ...
}
```

### 4.7 Specialty chart wiring — sankey

```ts
// chart-data-transformer.service.ts excerpt
function transformForSankey(rows: any[], config: SankeyConfig) {
  const { sourceColumn, targetColumn, valueColumn } = config;
  const nodes = new Set<string>();
  const links: { source: string; target: string; value: number }[] = [];
  for (const r of rows) {
    nodes.add(r[sourceColumn]);
    nodes.add(r[targetColumn]);
    links.push({
      source: String(r[sourceColumn]),
      target: String(r[targetColumn]),
      value: Number(r[valueColumn] ?? 1),
    });
  }
  return {
    nodes: Array.from(nodes).map(name => ({ name })),
    links,
  };
}

// echarts-option-builder.ts excerpt
function buildSankeyOption(data: SankeyData, options: SankeyOptions) {
  return {
    series: [{
      type: 'sankey',
      data: data.nodes,
      links: data.links,
      nodeAlign: options.nodeAlign ?? 'justify',     // left|right|justify
      orient: options.orient ?? 'horizontal',
      lineStyle: { color: 'gradient', curveness: 0.5 },
      label: { show: options.showLabels ?? true },
    }],
  };
}
```

### 4.8 Parallel coordinates

```ts
function transformForParallel(rows: any[], config: ParallelConfig) {
  const dims = config.dimensionColumns;
  return {
    axes: dims.map((name, i) => ({
      dim: i,
      name,
      type: typeof rows[0]?.[name] === 'number' ? 'value' : 'category',
    })),
    data: rows.map(r => dims.map(d => r[d])),
  };
}

function buildParallelOption(data: ParallelData) {
  return {
    parallelAxis: data.axes,
    series: [{
      type: 'parallel',
      data: data.data,
      lineStyle: { width: 1, opacity: 0.3 },
    }],
  };
}
```

### 4.9 Treemap + sunburst

```ts
function transformForHierarchy(rows: any[], config: HierarchyConfig) {
  const { parentColumn, nameColumn, valueColumn } = config;
  // Build tree from flat rows by parent → child relationship
  const nodeMap = new Map<string, any>();
  for (const r of rows) {
    nodeMap.set(r[nameColumn], {
      name: r[nameColumn],
      value: Number(r[valueColumn] ?? 0),
      children: [],
    });
  }
  const roots: any[] = [];
  for (const r of rows) {
    const node = nodeMap.get(r[nameColumn]);
    const parent = r[parentColumn] ? nodeMap.get(r[parentColumn]) : null;
    if (parent) parent.children.push(node);
    else        roots.push(node);
  }
  return roots;
}

function buildTreemapOption(data: any) {
  return {
    series: [{
      type: 'treemap',
      data,
      breadcrumb: { show: true },
      label: { show: true, formatter: '{b}\n{c}' },
      upperLabel: { show: true },
    }],
  };
}

function buildSunburstOption(data: any) {
  return {
    series: [{
      type: 'sunburst',
      data,
      radius: ['10%', '90%'],
      label: { rotate: 'radial' },
      emphasis: { focus: 'ancestor' },
    }],
  };
}
```

### 4.10 Boxplot

```ts
function transformForBoxplot(rows: any[], config: BoxplotConfig) {
  const { categoryColumn, sampleColumn } = config;
  // Group samples by category
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const c = String(r[categoryColumn]);
    const v = Number(r[sampleColumn]);
    if (!Number.isFinite(v)) continue;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(v);
  }
  // Compute the five-number summary per group
  const categories: string[] = [];
  const boxes: number[][] = [];        // [min, q1, median, q3, max]
  const outliers: [number, number][] = [];
  let xIndex = 0;
  for (const [cat, vals] of groups) {
    vals.sort((a, b) => a - b);
    const q1 = quantile(vals, 0.25);
    const q3 = quantile(vals, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const inliers = vals.filter(v => v >= lower && v <= upper);
    const out = vals.filter(v => v < lower || v > upper);
    categories.push(cat);
    boxes.push([
      inliers[0] ?? lower,
      q1, quantile(vals, 0.5), q3,
      inliers.at(-1) ?? upper,
    ]);
    for (const o of out) outliers.push([xIndex, o]);
    xIndex++;
  }
  return { categories, boxes, outliers };
}

function buildBoxplotOption(data: any) {
  return {
    xAxis: { type: 'category', data: data.categories },
    yAxis: { type: 'value' },
    series: [
      { type: 'boxplot', data: data.boxes },
      { type: 'scatter', data: data.outliers, symbolSize: 6 },
    ],
  };
}
```

### 4.11 Globe / 3D (ECharts-GL)

ECharts-GL adds globe + 3D scatter / bar / surface. Loading it
conditionally because it's ~500KB:

```ts
async function loadGlChartsLazily() {
  if (!(window as any).__echartsGlLoaded) {
    await import('echarts-gl');
    (window as any).__echartsGlLoaded = true;
  }
}

// Before rendering a globe / 3D chart
await loadGlChartsLazily();
```

```ts
function buildGlobeOption(data: any) {
  return {
    globe: {
      baseTexture: '/geo/textures/earth.jpg',
      heightTexture: '/geo/textures/bathymetry.jpg',
      shading: 'realistic',
      light: {
        ambient: { intensity: 0.4 },
        main: { intensity: 1, shadow: true },
      },
      viewControl: { autoRotate: false, projection: 'perspective' },
    },
    series: [{
      type: 'scatter3D',
      coordinateSystem: 'globe',
      data: data.points.map((p: any) => [p.lng, p.lat, p.value]),
      symbolSize: 8,
    }],
  };
}
```

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/geo/config` | Org's tile provider config |
| PUT | `/geo/config` | Update |
| GET | `/geo/providers` | Built-in tile provider presets |
| GET | `/geo/geojsons` | List org's uploaded GeoJSON |
| POST | `/geo/geojsons` | Upload |
| DELETE | `/geo/geojsons/:id` | Remove |
| POST | `/visuals/:id/heatmap` | H3-bucketed heatmap data |
| POST | `/datasets/:id/geocode` | Augment with lat/lng |
| GET | `/geo/builtins` | Built-in geojson catalogue |

## 6. FE specs

### 6.1 Map config panel (in visual builder)

```
Map configuration

  Map style:    [Mapbox Light ▾]
  Projection:   [Mercator ▾]
                 ├ Mercator (default)
                 ├ Albers USA
                 ├ Robinson
                 ├ Orthographic (globe-like)

  Chart type:   ◉ Choropleth  ○ Points  ○ Heatmap  ○ Flow
                 (depending on chart-type:)
                  Choropleth:
                    GeoJSON:   [World countries ▾]   [Upload custom]
                    Join on:   [country_code → ISO_A2]
                    Value:     [revenue ▾]
                    Color:     [#fff → #1e3a8a]
                  Points:
                    Latitude:  [latitude ▾]    (auto-detected)
                    Longitude: [longitude ▾]   (auto-detected)
                    Size by:   [order_count ▾]
                    Color by:  [region ▾]
                  Heatmap:
                    Latitude:  [latitude ▾]
                    Longitude: [longitude ▾]
                    Aggregate: ◉ count  ○ sum of [...]
                    Resolution: [auto ▾]    (H3 resolution 7 at zoom 6+)

  Default center: [-74.0060, 40.7128]  (NYC)
  Default zoom:   [4]
```

## 7. Validators

```ts
export const updateGeoConfigSchema = z.object({
  tileProvider: z.enum(['osm','mapbox','maptiler','google','self']),
  tileUrlTemplate: z.string().url().optional(),
  apiKey: z.string().min(8).max(255).optional(),
  attribution: z.string().max(255),
  maxZoom: z.number().int().min(1).max(22).default(18),
  defaultZoom: z.number().int().min(1).max(22).default(4),
  defaultCenter: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  geocoderProvider: z.enum(['mapbox','nominatim','google']).optional(),
  geocoderKey: z.string().optional(),
});

export const uploadGeoJsonSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const heatmapBucketSchema = z.object({
  resolution: z.number().int().min(0).max(15).default(7),
});
```

## 8. Test plan

```
GEO-CFG-H-01    PUT /geo/config persists tile provider
GEO-CFG-N-01    Mapbox provider without API key → 400
GEO-CFG-H-02    rotate API key → encrypted at rest
GEO-GJ-H-01     upload valid GeoJSON → row created
GEO-GJ-N-01     upload non-FeatureCollection → 400
GEO-GJ-N-02     upload > 10k features → 413
GEO-CHO-H-01    choropleth render with built-in world-countries
GEO-CHO-H-02    null values rendered with nullColor
GEO-PTS-H-01    point map auto-detects lat/lng
GEO-PTS-H-02    cluster markers when 1000+ points
GEO-HM-H-01     H3 heatmap bucketing — 1M points → ~100 cells at res 4
GEO-HM-H-02     resolution 7 at zoom 6+ → ~10k cells
GEO-HM-N-01     non-numeric lat/lng → skipped silently
GEO-NORM-H-01   "United States" → "US"
GEO-NORM-H-02   "USA" → "US"
GEO-NORM-N-01   "Atlantis" → null
GEO-GEOCODE-H-01 forward geocode known address → lat/lng
GEO-GEOCODE-H-02 reverse geocode → country code
GEO-SANKEY-H-01 sankey transforms rows correctly
GEO-PAR-H-01    parallel-coords with 5 dims renders
GEO-TM-H-01     treemap from flat rows builds tree
GEO-BOX-H-01    boxplot computes five-number summary + outliers
GEO-GL-H-01     globe loads ECharts-GL lazily
GEO-GL-N-01     WebGL unsupported → fallback to 2D map
```

## 9. Migration & rollout

1. Phase 1 — tile provider config + presets + map view skeleton.
2. Phase 2 — choropleth with built-in GeoJSON.
3. Phase 3 — point map with auto-detect + cluster markers.
4. Phase 4 — heatmap with H3 bucketing.
5. Phase 5 — GeoJSON upload + custom polygons.
6. Phase 6 — geocoding + reverse-geocoding.
7. Phase 7 — specialty charts (sankey, parallel, tree, sunburst,
   boxplot, candlestick) fully wired.
8. Phase 8 — globe / 3D (ECharts-GL lazy load).

## 10. Open questions

- **Map library**. Mapbox GL JS (paid above free tier),
  Leaflet (free, less performant for >100k points), deck.gl
  (best for large data, complex setup). Recommend Leaflet for v1
  with a deck.gl upgrade path.
- **Tile caching**. Should we proxy tiles through our CDN to
  reduce per-customer Mapbox bills? Yes, with per-tile signed URL
  and a fair-use header.
- **Custom regions** beyond GeoJSON — shapefile import. v2.
- **Globe in PDF export**. ECharts-GL renders to WebGL canvas;
  the export pipeline (puppeteer) captures the rendered canvas
  as PNG — already works.
- **Offline maps**. Tile prefetch for kiosk mode in air-gapped
  deployments — v2.

## 11. References

- ECharts geo: <https://echarts.apache.org/en/option.html#geo>
- ECharts-GL: <https://github.com/ecomfe/echarts-gl>
- h3-js: <https://github.com/uber/h3-js>
- Natural Earth (free GeoJSON): <https://www.naturalearthdata.com/>
- Mapbox tile API: <https://docs.mapbox.com/api/maps/raster-tiles/>
- Nominatim (free geocoding): <https://nominatim.org/release-docs/latest/api/Overview/>
- d3-geo projections: <https://github.com/d3/d3-geo>
- ColorBrewer scales: <https://colorbrewer2.org/>

## Appendix · Review additions

- **Tile provider abstraction with presets** — §4.1.
- **GeoJSON upload + storage** — §4.2.
- **H3 spatial bucketing** for million-point heatmaps — §4.4.
- **Country code normalisation** — §4.5.
- **Forward + reverse geocoding** services — §4.6.
- **Specialty chart wiring** for sankey, parallel, treemap,
  sunburst, boxplot — §4.7–§4.10.
- **ECharts-GL lazy load** for globe / 3D — §4.11.
- **Projection picker** — §6.1.
