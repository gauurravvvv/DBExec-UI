# 21 · Mobile, PWA, Offline

## PWA shell

Angular ships `@angular/pwa`:

```bash
ng add @angular/pwa
```

Generates `ngsw-config.json`. Configure:

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    { "name": "app", "installMode": "prefetch",
      "resources": { "files": ["/favicon.ico", "/index.html", "/*.css", "/*.js"] } },
    { "name": "assets", "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": { "files": ["/assets/**", "/*.(svg|png|jpg|webp)"] } }
  ],
  "dataGroups": [
    { "name": "api-perf", "urls": ["/api/v1/dashboard/list", "/api/v1/dashboard/get/**"],
      "cacheConfig": {
        "maxSize": 100, "maxAge": "1d", "strategy": "performance"
      } }
  ]
}
```

## Offline cache

- Dashboards: snapshot JSON cached per dashboard. "Last refreshed N
  minutes ago" badge when offline.
- Datasets: not cached offline (too large).
- Analyses: read-only snapshot.

## Mobile breakpoints

- `< 768px` — drawer sidebar; visuals auto-stack vertically.
- `< 480px` — chart sizes scale; legend moves below.

## Touch interactions

- Long-press = right-click (open visual properties).
- Pinch-zoom on chart canvas.
- Pull-to-refresh on home.

## Tests

- **MOB-LAY-H-01** — sidebar collapses to drawer at < 768
- **MOB-PWA-H-01** — manifest + service worker installable
- **MOB-OFF-H-01** — last-viewed dashboard renders offline

## Appendix · Review additions

- **Bottom tab bar** for mobile navigation.
- **App-install prompt** capture (`beforeinstallprompt`).
- **Web push** for notifications.
- **Native wrappers** later via Capacitor (iOS / Android stores).
- **Adaptive icons** per device.
- **Splash screen** branded per org.
- **Pinch-zoom on charts**.
- **Pull-to-refresh** on home / list pages.

### beforeinstallprompt capture

```ts
let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  this.showInstallButton.set(true);
});
async function install() {
  if (!deferred) return;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  this.showInstallButton.set(false);
}
```

### Test IDs

- MOB-INSTALL-H-01 — install prompt shows once per visitor
- MOB-PUSH-H-01 — subscribed user receives push
- MOB-PTR-H-01 — pull-to-refresh re-fetches
- MOB-ICON-H-01 — adaptive icon picked correctly
