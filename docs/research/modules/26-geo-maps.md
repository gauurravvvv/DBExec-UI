# 26 · Geo, Maps, Specialty Charts

## Geo data sources

| Source | Use case |
|---|---|
| GeoJSON | Custom regions (sales territories) |
| Country / state / city codes (ISO) | World/country/state choropleth |
| lat/lng pairs | Pin maps, density heatmaps |
| H3 / S2 cells | Aggregated geo bucketing |

## Schema delta

```sql
CREATE TABLE geo_resource (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  kind            varchar(16) NOT NULL,        -- world|country|state|custom
  geojson         jsonb NOT NULL,
  bbox            geometry,                     -- PostGIS optional
  centroid        geometry,
  created_on      timestamptz DEFAULT now()
);
```

## Chart families

- World map (existing)
- Country map (drill from world → country)
- State / region map
- Pin map (clustered for performance)
- Density / hex map (H3)
- Globe (3D, special)
- Lines (origin → dest flow)

## ECharts integration

Use `echarts-extension-amap` for Amap or `echarts-extension-bmap` for
Baidu; for vendor-free, use GeoJSON `registerMap`:

```ts
import echarts from 'echarts';
const geo = await fetch('/api/v1/geo/world').then(r => r.json());
echarts.registerMap('world', geo);
const opt = {
  series: [{
    type: 'map', map: 'world',
    data: rows.map(r => ({ name: r.country, value: r.revenue })),
  }],
};
```

## Pin map clustering

Server-side: compute cluster cells via Supercluster (npm) when row count
> 5000. Client receives clusters + drill-on-zoom.

## Tests

- **GEO-WORLD-H-01** — world choropleth renders with revenue colours
- **GEO-DRILL-H-01** — click country → drill into states
- **GEO-PIN-H-01** — 10k points clustered, opens to individual on zoom
- **GEO-N-01** — country code missing from GeoJSON → row dropped with warning

## Appendix · Review additions

- **Tile provider config** (Mapbox / MapTiler / OSM / Google Maps)
  with token management.
- **Address geocoding** (street → lat/lng) via Mapbox / Photon.
- **Reverse geocoding**.
- **Time-series animation** (heatmap evolving over a date range).
- **Route / line rendering** between two points.
- **GeoJSON validation** via turf.js.
- **H3 hex bins** (uber/h3-js) for high-density data.
- **Projection picker** (Mercator / Albers / Robinson).

### Schema delta

```sql
CREATE TABLE tile_provider (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  kind            varchar(16) NOT NULL,  -- mapbox|maptiler|osm|google
  token_enc       bytea,
  default_style   varchar(64),
  attribution     varchar(255)
);
```

### h3-js bucketing

```ts
import { latLngToCell, cellToBoundary } from 'h3-js';
const buckets = new Map<string, number>();
for (const r of rows) {
  const cell = latLngToCell(r.lat, r.lng, 7);  // resolution 7 ≈ ~5km hex
  buckets.set(cell, (buckets.get(cell) ?? 0) + 1);
}
const features = [...buckets.entries()].map(([cell, count]) => ({
  type: 'Feature',
  properties: { count },
  geometry: { type: 'Polygon', coordinates: [cellToBoundary(cell, true)] },
}));
```

### Test IDs

- GEO-TILE-H-01 — chosen tile provider's tiles load
- GEO-GEOCODE-H-01 — address column resolved to lat/lng
- GEO-ANIM-H-01 — time-series animation plays + scrubs
- GEO-H3-H-01 — 100k points bucketed into ~200 hexes
- GEO-PROJ-H-01 — projection switch re-renders without distortion
