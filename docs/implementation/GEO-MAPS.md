# Geo, maps, specialty charts

> Implementation companion to research module 26. Pins the
> tile-provider abstraction, choropleth + point map +
> H3-bucketed heatmap, GeoJSON upload, geocoding, and the
> specialty-chart wiring (sankey, parallel, treemap, sunburst,
> boxplot, candlestick).

**Status:** 🔴 not in product (some chart types exist but not
the geo / spatial path).
**Effort:** M (~2 weeks).

---

## 0. Problem statement

A retail customer wants stores plotted on a US states map
shaded by revenue. A logistics customer wants 5 million GPS
pings rendered as a heatmap without crashing the browser.
A finance customer wants candlestick charts.

The common thread: spatial/specialty visuals need different
data shapes + library choices than standard charts. One
abstraction over tile providers + a per-chart-family adapter
keeps it sane.

---

## 1. Tile provider model

```sql
CREATE TABLE tile_provider (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organisation(id) ON DELETE CASCADE,   -- null = global
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('osm','mapbox','maptiler','google','custom')),
  url_template  TEXT NOT NULL,                          -- 'https://api.mapbox.com/styles/v1/{user}/{styleId}/tiles/{z}/{x}/{y}@2x?access_token={token}'
  attribution   TEXT NOT NULL,
  api_key_enc   BYTEA,                                    -- KMS-wrapped
  max_zoom      INTEGER NOT NULL DEFAULT 19,
  is_default    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE org_geo_config (
  org_id        UUID PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  default_provider_id UUID REFERENCES tile_provider(id),
  default_country_focus TEXT,                             -- ISO-3166-1 alpha-2
  default_center_lat DOUBLE PRECISION,
  default_center_lng DOUBLE PRECISION,
  default_zoom  INTEGER
);

CREATE TABLE org_geojson (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  feature_count INTEGER NOT NULL,
  property_keys TEXT[] NOT NULL,
  storage_key   TEXT NOT NULL,                            -- S3
  byte_size     INTEGER NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES "user"(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Built-in GeoJSON: world-countries (Natural Earth 1:50m),
us-states, us-counties, eu-nuts2. Org-uploaded sits alongside.

---

## 2. Choropleth

A visual with `chartType='choropleth'`. Encoding:

```jsonc
{
  "regionKey":   "country_code",      // column matching GeoJSON feature property
  "value":       "revenue",
  "regionGeoSet": "world-countries"   // built-in name or org_geojson.id
}
```

Builder transforms rows + GeoJSON into ECharts `map` series:

```typescript
// src/app/shared/builders/choropleth.builder.ts
export const buildChoroplethOption: ChartBuilder = async (encoding, config, rows, fields, ctx) => {
  const geo = await loadGeoSet(encoding.regionGeoSet);
  echarts.registerMap(encoding.regionGeoSet, geo);

  const data = rows.map(r => ({
    name: r[encoding.regionKey],
    value: r[encoding.value],
  }));

  const vmax = Math.max(...data.map(d => d.value));
  const vmin = Math.min(...data.map(d => d.value));

  return {
    visualMap: {
      min: vmin, max: vmax,
      left: 'left', top: 'bottom',
      text: ['high', 'low'],
      calculable: true,
      inRange: { color: paletteFor(config.palette, ctx.theme) },
    },
    series: [{
      name: encoding.value, type: 'map',
      map: encoding.regionGeoSet,
      roam: true,
      label: { show: !!config.showLabels },
      emphasis: { label: { show: true } },
      data,
    }],
    tooltip: { trigger: 'item', formatter: (p: any) =>
      `${p.name}: ${ctx.formatService.number(p.value)}` },
  };
};
```

---

## 3. Point map

Encoding:

```jsonc
{ "lat": "latitude", "lng": "longitude", "size": "amount", "label": "name" }
```

Auto-detect: if encoding.lat/lng absent, the builder scans
`fields` for `semantic_type in ('geo_lat','geo_lng')` set during
dataset inference (module 03).

Built on Leaflet (small, free) for tile-only maps + ECharts
GL for very-large point overlays.

---

## 4. H3-bucketed heatmap

```typescript
import h3 from 'h3-js';

export function bucketByH3(points: Array<{ lat: number; lng: number; value?: number }>,
                           zoom: number): Array<{ h3Index: string; count: number; total: number }> {
  const resolution = zoomToResolution(zoom);
  const buckets = new Map<string, { count: number; total: number }>();
  for (const p of points) {
    const idx = h3.latLngToCell(p.lat, p.lng, resolution);
    const b = buckets.get(idx) ?? { count: 0, total: 0 };
    b.count++; b.total += p.value ?? 1;
    buckets.set(idx, b);
  }
  return Array.from(buckets, ([h3Index, b]) => ({ h3Index, ...b }));
}

// Resolution lookup: at zoom 4 use res 3; at zoom 8 use res 6; at zoom 12 use res 9; …
function zoomToResolution(zoom: number): number {
  if (zoom <= 4) return 3;
  if (zoom <= 6) return 5;
  if (zoom <= 8) return 6;
  if (zoom <= 10) return 7;
  if (zoom <= 12) return 9;
  return 10;
}
```

At each zoom level, re-bucket on the client. Avoids sending
5M raw points; ships 5k–20k aggregated hexes per zoom level.

---

## 5. GeoJSON upload + validation

```typescript
export async function validateGeoJson(buf: Buffer): Promise<{ ok: boolean; reason?: string; meta?: any }> {
  const text = buf.toString('utf-8');
  if (buf.byteLength > 50 * 1024 * 1024) return { ok: false, reason: 'TOO_LARGE_50MB' };
  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, reason: 'INVALID_JSON' }; }
  if (parsed.type !== 'FeatureCollection') return { ok: false, reason: 'NOT_FEATURE_COLLECTION' };
  if (!Array.isArray(parsed.features)) return { ok: false, reason: 'NO_FEATURES' };
  for (const f of parsed.features) {
    if (!['Polygon','MultiPolygon'].includes(f.geometry?.type)) {
      return { ok: false, reason: 'UNSUPPORTED_GEOMETRY' };
    }
  }
  const propertyKeys = Array.from(new Set(parsed.features.flatMap((f: any) => Object.keys(f.properties ?? {}))));
  return { ok: true, meta: { featureCount: parsed.features.length, propertyKeys } };
}
```

Stored to S3 (compressed); served via signed URLs with CDN.

---

## 6. Forward + reverse geocoding

`POST /geo/geocode` — forward (address → lat,lng).
`POST /geo/reverse` — reverse (lat,lng → address).

Per-org provider config (Mapbox / Google / built-in Nominatim
self-hosted). Caches results in Redis (24h) to keep cost down.

```typescript
// src/services/geo/geocoder.ts
export async function geocode(query: string, org: Org): Promise<GeocodeResult | null> {
  const cacheKey = `geocode:${org.id}:${sha256(query)}`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const provider = await loadGeocodingProvider(org.id);
  const result = await provider.forward(query);
  if (result) await redis.set(cacheKey, JSON.stringify(result), 'EX', 86_400);
  return result;
}
```

---

## 7. Country-code normalisation

Customer data has "USA" / "U.S." / "United States" — we need
one canonical form for GeoJSON key matching.

```typescript
import countries from 'i18n-iso-countries';

export function normaliseCountry(input: string): string | null {
  // Try alpha2 / alpha3 / numeric / name
  return countries.getAlpha2Code(input, 'en')
      ?? countries.getAlpha2Code(input, 'es')
      ?? countries.getAlpha2Code(input, 'fr')
      ?? null;
}
```

Run at preview-time; surface mismatches in the editor as a
"3 unmatched values" warning with one-click fix-map.

---

## 8. Specialty charts wiring

Each gets a tested builder; ECharts supports them all
natively.

### 8.1 Sankey

```typescript
export const buildSankeyOption: ChartBuilder = (encoding, config, rows, fields, ctx) => {
  const nodes = uniqueValues([
    ...rows.map(r => r[encoding.source]),
    ...rows.map(r => r[encoding.target]),
  ]).map(n => ({ name: n }));

  const links = rows.map(r => ({
    source: r[encoding.source], target: r[encoding.target], value: r[encoding.value],
  }));

  return {
    series: [{
      type: 'sankey',
      data: nodes, links,
      lineStyle: { curveness: 0.5 },
      label: { show: true },
      emphasis: { focus: 'adjacency' },
    }],
    tooltip: { trigger: 'item' },
  };
};
```

### 8.2 Treemap & sunburst

Both consume hierarchical input. We accept either:

- A parent column: `{ value: 'amount', label: 'name', parent: 'parent_name' }`
- Pre-shaped tree: `[{name, children: [{...}], value}]`

Builder reshapes flat into tree on the client.

### 8.3 Boxplot, candlestick, waterfall, funnel, pictorial

Standard ECharts; the per-type builder is 30–60 lines each.
Encoding roles documented per type in `CHART_ROLES`.

---

## 9. ECharts-GL lazy load

3D charts (`bar3d`, `line3d`, `scatter3d`, `surface`,
`globe`, `graphgl`) require `echarts-gl` (~1 MB gzip). Lazy
import only when used:

```typescript
async function ensureEchartsGl() {
  await import('echarts-gl');
}
```

Bundle stays small for the 90% of dashboards that don't use 3D.

---

## 10. Controller — upload geojson

```typescript
// src/controllers/geo/uploadGeojson.ts
const uploadGeojson = async (req: Request, res: Response) => {
  const { name, description, bytes } = req.body;        // bytes: base64 of file
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const buf = Buffer.from(bytes, 'base64');
    const v = await validateGeoJson(buf);
    if (!v.ok) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, GEO_MSG.BAD_GEOJSON, { reason: v.reason });
    }

    const storageKey = `org/${orgData.orgId}/geojson/${crypto.randomUUID()}.json.gz`;
    await storage.writeGz(storageKey, buf);

    const row = await connection.getRepository('OrgGeojson').save({
      orgId: orgData.orgId,
      name, description,
      featureCount: v.meta.featureCount,
      propertyKeys: v.meta.propertyKeys,
      storageKey, byteSize: buf.byteLength,
      uploadedBy: loggedInId,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.GEO, action: AUDIT_ACTIONS.UPLOAD,
      entityName: 'OrgGeojson', entityId: row.id,
      metadata: { featureCount: v.meta.featureCount, byteSize: buf.byteLength },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, GEO_MSG.OK, row);
  } catch (err: any) {
    Logger.error(`Upload GeoJSON failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 11. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_geo_render_ms` | histogram | `chart_type` | per-chart-type latency |
| `dbexec_geo_tile_request_total` | counter | `provider`, `outcome` | tile-API cost tracking |
| `dbexec_geo_geocode_total` | counter | `provider`, `outcome` | geocode cost |
| `dbexec_geo_h3_bucket_count` | histogram | `zoom` | bucketing effectiveness |
| `dbexec_geo_geojson_unmatched_total` | counter | `geojson` | data quality leading indicator |

---

## 12. Security & threat model

| Threat | Mitigation |
|---|---|
| API key for Mapbox in client | Key proxied via our backend; never exposed to client |
| GeoJSON DoS via 100k-point polygon | Per-feature point cap (10k); reject if exceeded |
| ECharts-GL WebGL exploit | Sandboxed via the chart-visual component; CSP allows webgl only on the visual canvas |
| Country code spoof | Normaliser whitelist (ISO-3166); reject unknown |
| Cross-org GeoJSON access | All endpoints scope by org_id |
| Tile provider cost runaway | Per-org daily quota on tile requests; throttle at 80% |

---

## 13. Runbook

**Symptom: choropleth shows blank.**
1. Unmatched country codes — `dbexec_geo_geojson_unmatched_total`.
   Run normaliser; fix data or upload custom GeoJSON.

**Symptom: heatmap laggy on zoom.**
1. H3 resolution too high for zoom level — adjust
   `zoomToResolution` mapping; favour fewer-but-larger hexes.

**Symptom: tile cost spike.**
1. Public dashboard with high traffic. Cache tiles at our
   CDN; switch to a flat-pricing provider (Mapbox business).

---

## 14. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Choropleth render (200 features) | 80 ms | 250 ms | 1 s |
| Point map (1k points) | 60 ms | 200 ms | 1 s |
| Heatmap H3 bucket (1M points) | 400 ms | 1.5 s | 5 s |
| GeoJSON upload + validate (10 MB) | 1 s | 3 s | 30 s |
| Geocode (cached) | 5 ms | 20 ms | 100 ms |
| Geocode (cold) | 100 ms | 500 ms | 5 s |

---

## 15. Migration & rollout

1. **Migrations:** `tile_provider`, `org_geo_config`, `org_geojson`.
2. **Seed:** insert global OSM provider, plus a free
   built-in GeoJSON set.
3. **Feature flag:** `feature.geo`. Off by default.
4. **Cost telemetry:** module 27 hooks into tile + geocode
   counts.

---

## 16. Open questions

1. **Vector tiles vs raster** — Mapbox GL JS for vector;
   nicer rendering, more dev cost. Defer to v2.
2. **Custom tile server** — orgs in data-sovereign regions want
   their own tile server. Tile_provider.kind='custom' handles
   this generically.
3. **Time-animated map** — points moving over time. Defer.

---

## 17. References

- [26-geo-maps.md](../research/modules/26-geo-maps.md)
- [06-analysis-visual-builder.md](../research/modules/06-analysis-visual-builder.md)
- [27-cost-observability.md](../research/modules/27-cost-observability.md)
- ECharts map / sankey / treemap docs
- uber/h3-js README
- Natural Earth data
- i18n-iso-countries npm
