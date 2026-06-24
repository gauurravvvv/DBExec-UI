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
