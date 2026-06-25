# 25 · Mobile / PWA / Offline — Deep Test Cases

## Happy
- **MOB-LAY-H-01** · Sidebar collapses to drawer at < 768px. P0
- **MOB-LAY-H-02** · Bottom tab bar visible on mobile. P1
- **MOB-PWA-H-01** · Manifest + service worker installable. P0
- **MOB-PWA-H-02** · `beforeinstallprompt` capture shows custom CTA. P1
- **MOB-PUSH-H-01** · Subscribed user receives push notification. P1
- **MOB-OFF-H-01** · Last-viewed dashboard renders offline. P1
- **MOB-PTR-H-01** · Pull-to-refresh re-fetches. P2
- **MOB-PINCH-H-01** · Pinch-zoom on chart canvas. P2
- **MOB-ICON-H-01** · Adaptive icon picked correctly per device. P2

## Negative
- **MOB-OFF-N-01** · Mutations attempted offline → queued and surfaced when online. P1
- **MOB-OFF-N-02** · Forbidden access while offline → friendly message, not raw error. P1

## Edge
- **MOB-LAY-E-01** · Rotation portrait → landscape preserves state. P1
- **MOB-LAY-E-02** · Charts resize on orientation change. P1
- **MOB-PWA-E-01** · App update prompt offered after SW update. P1

## Security
- **MOB-S-01** · No tokens stored in plain `localStorage` on iOS Safari (use IndexedDB or HttpOnly cookie). P0 🟣

## Performance
- **MOB-P-01** · First Contentful Paint < 2s on 4G simulated. P1 ⚡

## Regression buckets
- Mobile layout → MOB-LAY-*
- PWA install + offline → MOB-PWA-*, MOB-OFF-*
