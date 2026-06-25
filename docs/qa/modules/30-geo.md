# 30 · Geo / Maps — Deep Test Cases

## Fixtures
- GeoJSON for world + sample country.
- Dataset with `country`, `lat`, `lng` columns.

## Happy
- **GEO-WORLD-H-01** · World choropleth renders with revenue colours. P0
- **GEO-COUNTRY-H-01** · Drill from world → country. P1
- **GEO-PIN-H-01** · 10k points clustered, drill on zoom. P1
- **GEO-TILE-H-01** · Tile provider (Mapbox/MapTiler/OSM) tiles load. P1
- **GEO-GEOCODE-H-01** · Address column resolved to lat/lng. P1
- **GEO-H3-H-01** · 100k points bucketed into ~200 hexes. P1
- **GEO-ANIM-H-01** · Time-series animation plays + scrubs. P2
- **GEO-PROJ-H-01** · Projection switch re-renders. P2

## Negative
- **GEO-N-01** · Country code missing from GeoJSON → row dropped with warning. P1
- **GEO-N-02** · Invalid lat/lng (>180 < -180) → drop with warning. P1
- **GEO-N-03** · Tile provider token invalid → fallback to default + banner. P1

## Edge
- **GEO-E-01** · Antimeridian wrap (lng 179 ↔ -179) handled. P1
- **GEO-E-02** · GeoJSON > 5MB → server-side simplification. P2
- **GEO-E-03** · Globe view performance with 1M points → cluster aggressively. P1 ⚡

## Security
- **GEO-S-01** · GeoJSON XSS payload sanitised. P0 🟣
- **GEO-S-02** · Tile provider token never exposed to client (proxied). P1 🟣

## Performance
- **GEO-P-01** · World choropleth first paint < 1.5s. P1 ⚡

## Regression buckets
- GeoJSON validation → GEO-N-01..03
- H3 / clustering → GEO-PIN-H-01, GEO-H3-H-01
