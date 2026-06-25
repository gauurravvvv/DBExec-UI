# 18 · Search / Tags / Collections / Favourites — Deep Test Cases

## Happy
- **SR-H-01** · Cmd-K opens palette. P0
- **SR-H-02** · Search returns dashboards by partial name. P0
- **SR-H-03** · Result ordering: recency × popularity × personal. P1
- **SR-H-04** · Search includes datasets + analyses + people. P1
- **SR-FUZZY-H-01** · `dashbord` finds `dashboard` (pg_trgm). P1
- **SR-VEC-H-01** · "revenue trends" returns related dashboards (pgvector). P2
- **SR-TAG-H-01** · Tag created, attached, filtered. P1
- **SR-COL-H-01** · Collection contains 3 objects, ordering preserved. P1
- **SR-FAV-H-01** · Favourite star pins to home. P1
- **SR-RECENT-H-01** · Recently-viewed list per user. P1
- **SR-TRENDING-H-01** · Top-viewed in 7d. P2
- **SR-SAVED-H-01** · Saved-search alerts on new match. P2

## Negative
- **SR-N-01** · Query length > 200 → reject. P2
- **SR-N-02** · Cross-org probe → results filtered to caller's org. P0 🟣

## Edge
- **SR-E-01** · Search with no results → empty state. P2
- **SR-E-02** · Search debounce 150ms. P2
- **SR-E-03** · Unicode query. P2
- **SR-E-04** · Tag rename propagates to filter chips. P1

## Performance
- **SR-P-01** · Cmd-K result < 200ms for 10k objects. P1 ⚡

## Regression buckets
- pg_trgm / pgvector extensions → SR-FUZZY-H-01, SR-VEC-H-01
- Tag/collection schema → SR-TAG-*, SR-COL-*
