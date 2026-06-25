# 13 · Dashboards — Deep Test Cases

## Fixtures
- Dashboard `Sales Snapshot` published from `Bar Pilot` analysis.
- Dashboard `Live Mode` (mode=live).
- Empty dashboard `New Board` for layout tests.

## Publish — happy
- **DSH-H-01** · Publish analysis as new dashboard with name. P0
- **DSH-H-02** · Re-publish to existing → snapshot replaced; updatedOn bumps. P0
- **DSH-H-03** · Render snapshot dashboard returns frozen rows. P0
- **DSH-H-04** · Render live dashboard re-queries datasets. P0
- **DSH-H-05** · 20-visual dashboard renders grid without overlap. P1
- **DSH-H-06** · Edit description without changing name → persisted. P2
- **DSH-H-07** · Bulk-delete 2 dashboards. P1

## Publish — negative
- **DSH-N-01** · mode='new' missing name → 400. P0
- **DSH-N-02** · mode='new' with dashboardId in body → 400 forbidden. P0
- **DSH-N-03** · mode='existing' without dashboardId → 400. P0
- **DSH-N-04** · mode='existing' with id from another org → 404 inside transaction. P0
- **DSH-N-05** · mode='new' duplicate name → 400. P0
- **DSH-N-06** · name > 255 → tooLong. P1
- **DSH-N-07** · User without `dashboard` permission → bounce. P0
- **DSH-N-08** · analysisId from another org → 404. P0

## Publish — edge
- **DSH-E-01** · Underlying dataset deleted after publish → dashboard still renders; "view source" link broken. P1
- **DSH-E-02** · Two republishes overlap → BE serialises; later wins. P1
- **DSH-E-03** · Snapshot with empty visual filters → renders empty state. P2
- **DSH-E-04** · Geo chart with missing region data → graceful empty. P2
- **DSH-E-05** · Export to PDF non-zero bytes. P0
- **DSH-E-06** · Share URL with embedded token (if supported) opens read-only. P1
- **DSH-E-07** · Rendered to user with reduced permissions → visible visuals only. P0
- **DSH-E-08** · Republish to dashboard with active viewers → next refresh shows new. P1

## Dashboard filter bar
- **DSH-FLT-H-01** · Dashboard filter applies to every visual. P0
- **DSH-FLT-H-02** · Filter scope excludes a specific analysis. P1
- **DSH-FLT-H-03** · "Apply" mode (manual) vs auto-apply toggle. P1

## Live mode
- **DSH-LIVE-H-01** · Live mode re-queries on render. P0
- **DSH-LIVE-H-02** · Snapshot mode returns frozen. P0
- **DSH-LIVE-E-01** · Live mode with Redis down → still queries directly. P1

## Tabs / sections
- **DSH-TAB-H-01** · Multi-tab dashboard renders + remembers tab on reload. P1
- **DSH-TAB-N-01** · Tab name duplicate within board → reject. P2

## Comments / @mentions
- **DSH-COM-H-01** · Add comment with @mention → mentioned user notified. P1
- **DSH-COM-N-01** · @mention non-org user → error. P2
- **DSH-COM-S-01** · XSS in comment escaped on render. P0 🟣

## Presentation / TV mode
- **DSH-TV-H-01** · TV route rotates pages every 30s. P2

## Export
- **DSH-EXP-H-01** · PDF downloads non-zero. P0
- **DSH-EXP-H-02** · PNG per visual matches on-screen. P1
- **DSH-EXP-H-03** · XLSX multi-sheet (one per visual). P1
- **DSH-EXP-N-01** · Visual erroring → placeholder in PDF, others render. P1
- **DSH-EXP-S-01** · Watermark text on every PDF page. P1
- **DSH-EXP-S-02** · Encrypted PDF prompts for password. P1

## Embed
- **DSH-EMB-H-01** · JWT-signed embed loads chrome-less view. P0
- **DSH-EMB-N-01** · Expired JWT → 401 in iframe. P0
- **DSH-EMB-S-01** · Token from another org's signing secret → reject. P0 🟣
- **DSH-EMB-CSP-N-01** · Different host than allowlist → blocked. P0 🟣
- **DSH-EMB-RLS-H-01** · Token attrs flow into RLS (user.region → APAC). P0

## Performance
- **DSH-P-01** · 20-visual dashboard renders < 5s. P1 ⚡
- **DSH-P-02** · Cached snapshot serves < 300ms TTFB. P1 ⚡

## Regression buckets
- Render engine → DSH-H-*, DSH-LIVE-*, DSH-EMB-*
- Export pipeline → DSH-EXP-*
- Comment + mentions → DSH-COM-*
