# 23 · Layout / Sidebar / Permissions — Deep Test Cases

## Happy
- **LAY-H-01** · Sidebar shows granted modules after login. P0
- **LAY-H-02** · Pin/unpin survives reload via localStorage. P1
- **LAY-H-03** · Hover-peek expands at ~120ms; collapses at ~200ms. P1
- **LAY-H-04** · Active route highlights row + parent. P1
- **LAY-H-05** · Submenu accordion: open one, others stay closed. P2
- **LAY-H-06** · Locale switch translates labels immediately. P1

## Negative
- **LAY-N-01** · User without `userManagement` opens `/app/users/new` → bounced. P0
- **LAY-N-02** · User without `dataManagement` opens `/app/datasets` → bounced. P0
- **LAY-N-03** · Unknown route → bounced or 404 view. P0
- **LAY-N-04** · Permission tree changes server-side → next login reflects. P1
- **LAY-N-05** · Deep link to forbidden route → bounced, no enumeration leak. P0 🟣

## Edge
- **LAY-E-01** · Malformed sidebar.expanded JSON → fallback to default. P1
- **LAY-E-02** · Viewport < 768 → drawer mode, hover-peek off. P1
- **LAY-E-03** · Tab order keyboard-navigable from logo through nav. P1
- **LAY-E-04** · Esc closes popovers. P1
- **LAY-E-05** · Browser zoom 75% layout holds. P2
- **LAY-E-06** · Browser zoom 200% layout holds (rows wrap; no overlap). P2
- **LAY-E-07** · Theme switch persists across reload. P1
- **LAY-E-08** · Org theme on login; logout clears to default. P0
- **LAY-E-09** · Unsaved-changes guard: dirty form + nav → confirm; "stay" cancels. P0
- **LAY-E-10** · Browser back/forward preserves scroll where appropriate. P2

## Security
- **LAY-S-01** · Permission check on every route guard. P0
- **LAY-S-02** · Sidebar reads from JWT-derived permissions only. P0 🟣

## Accessibility
- **LAY-A-01** · `nav` has `role="navigation"` + `aria-label`. P0 ♿
- **LAY-A-02** · Focus visible on every interactive sidebar element. P0 ♿
- **LAY-A-03** · Skip-to-content link visible on Tab. P1 ♿

## Performance
- **LAY-P-01** · First sidebar paint < 200ms. P1 ⚡

## Regression buckets
- Permission tree change → LAY-N-01..04
- Theme system → LAY-E-07..08
