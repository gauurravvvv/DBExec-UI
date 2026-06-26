# Mobile, PWA, offline

> Implementation companion to research module 21. Pins the
> org-branded manifest, service worker with per-resource cache
> strategies, install UX, mobile dashboard layouts, periodic
> background sync, and WebAuthn biometric unlock.

**Status:** 🔴 not in product.
**Effort:** M (~2-3 weeks).

---

## 0. Problem statement

Execs want the dashboard on their phone, on the plane, with no
Wi-Fi. The PWA path delivers an installable, offline-capable
experience from one codebase. The bar is "looks like a real
app on the home screen, opens to the latest cached state when
offline, doesn't lie about staleness".

---

## 1. Manifest

Served from `/manifest.webmanifest`, **org-branded**:

```typescript
// src/controllers/pwa/manifest.ts
const manifest = async (req: Request, res: Response) => {
  const org = await loadOrgByHostname(req.hostname);
  const branding = await loadBranding(org.id);

  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: branding.brandName ?? 'DBExec',
    short_name: branding.brandName ?? 'DBExec',
    start_url: '/app',
    display: 'standalone',
    theme_color: branding.tokens['color-primary'].light,
    background_color: branding.tokens['color-bg'].light,
    icons: [
      { src: branding.faviconUrl_192 ?? '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: branding.faviconUrl_512 ?? '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: branding.faviconUrl_maskable ?? '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    orientation: 'any',
    categories: ['business', 'productivity'],
  });
};
```

iOS Safari: also serve `<link rel="apple-touch-icon">` and an
inline install hint banner (Safari doesn't fire
`beforeinstallprompt`).

---

## 2. Service worker

Workbox-based. Per-route cache strategy:

```typescript
// src/sw/service-worker.ts
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

precacheAndRoute(self.__WB_MANIFEST);

// JS/CSS: long cache + revalidate
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'static-resources' }),
);

// API GETs: network-first with 5s timeout, fall back to cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 3600 })],
  }),
  'GET',
);

// Images: cache-first (1 day)
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'images', plugins: [new ExpirationPlugin({ maxAgeSeconds: 86_400 })] }),
);

// HTML shell: network-first with fallback to /offline.html
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'navigation',
    networkTimeoutSeconds: 3,
    plugins: [{
      handlerDidError: async () => caches.match('/offline.html'),
    }],
  }),
);
```

Angular has built-in `@angular/pwa` (ngsw) — pick one path
(Workbox or ngsw). The strategies above translate 1:1 to ngsw
config.

---

## 3. Install UX

```typescript
// src/app/core/pwa/install-prompt.service.ts
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private deferred: any = null;
  readonly canInstall = signal(false);

  init() {
    window.addEventListener('beforeinstallprompt', (ev: any) => {
      ev.preventDefault();
      this.deferred = ev;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.canInstall.set(false);
      this.analytics.track('pwa.installed');
    });
  }

  async prompt() {
    if (!this.deferred) return;
    this.deferred.prompt();
    const choice = await this.deferred.userChoice;
    this.analytics.track('pwa.install_prompt', { outcome: choice.outcome });
    this.deferred = null;
    this.canInstall.set(false);
  }

  isIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
  }
}
```

UI: a slim banner on first visit. iOS Safari banner explains
"tap Share → Add to Home Screen". Dismiss persistence
respects `localStorage('pwa.install.dismissed_until')`.

---

## 4. Mobile dashboard layout

Dashboards re-flow on narrow viewports:

- **Desktop:** grid layout from `dashboard_visual.position`.
- **Mobile:** stack visuals vertically, ignore desktop grid;
  use a separate `mobile_position` column for the order, or
  derive from `display_order`.

```typescript
// src/app/modules/dashboards/dashboard-tab.component.ts
@Component(...)
export class DashboardTabComponent {
  isMobile = computed(() => window.matchMedia('(max-width: 768px)').matches);

  layoutFor(visual: DashboardVisual) {
    if (this.isMobile()) {
      return { x: 0, y: visual.displayOrder, w: 12, h: visual.mobileHeight ?? 5 };
    }
    return visual.position;
  }
}
```

Add `mobile_height` and `mobile_visible` columns to
`dashboard_visual`. Some visuals (huge tables) hide on mobile.

---

## 5. Periodic background sync

For execs who want fresh KPI tiles when they open the app
after a flight:

```typescript
// In service worker
self.addEventListener('periodicsync', (ev: any) => {
  if (ev.tag === 'kpi-refresh') {
    ev.waitUntil(refreshKpiData());
  }
});

async function refreshKpiData() {
  const dashboards = await getFavouriteDashboards();
  for (const d of dashboards) {
    try { await fetch(`/api/dashboard/${d.id}/kpi-summary`); } catch {}
  }
}
```

Registered from the page:

```typescript
if ('periodicSync' in navigator.serviceWorker) {
  const reg = await navigator.serviceWorker.ready;
  try {
    await (reg as any).periodicSync.register('kpi-refresh', { minInterval: 24 * 60 * 60 * 1000 });
  } catch (e) {
    // user denied or feature absent
  }
}
```

---

## 6. Biometric unlock

When the app cold-starts on a registered device, ask for
biometric instead of re-typing password. Uses WebAuthn
(module 10):

```typescript
// On install / first auth
const credential = await navigator.credentials.create({
  publicKey: {
    rp: { name: 'DBExec', id: location.hostname },
    user: { id: encode(userId), name: email, displayName: name },
    challenge: await fetchChallenge(),
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
    timeout: 60_000,
  },
});
// Register with server (module 10 user_mfa_factor)
```

On subsequent cold-starts, `navigator.credentials.get(...)`
asks for fingerprint/Face ID; we exchange the assertion for a
fresh JWT.

---

## 7. Offline-safe write semantics

We do NOT support offline writes. Writes need server validation
(RLS, etc.). When offline, the UI:

1. Shows a yellow "Offline — read-only" banner.
2. Disables CUD buttons.
3. Continues to render cached dashboards with a "Last updated
   at HH:mm" pill on each tile.

Online again: banner disappears; the SW refreshes API data via
NetworkFirst.

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_pwa_install_total` | counter | `platform` | install rate |
| `dbexec_pwa_offline_session_total` | counter | — | how often offline kicks in |
| `dbexec_pwa_periodic_sync_total` | counter | `outcome` | bg-sync reliability |
| `dbexec_pwa_sw_cache_hit_rate` | gauge | — | sampled on the client |
| `dbexec_pwa_install_prompt_outcome` | counter | `outcome` | accepted/dismissed |
| `dbexec_pwa_webauthn_unlock_total` | counter | `outcome` | biometric usage |

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| Stale cached data displayed without warning | Per-tile "last updated" + offline banner; cache-age threshold makes "data may be stale" warning at 1h |
| Service worker hijacked via XSS | HTTPS only; CSP `script-src 'self'`; SW served with strict cache headers |
| Manifest spoof (other org's branding) | Manifest endpoint resolves by hostname; cross-org request returns 404 |
| Sensitive data in long-lived cache | API GETs only kept 1 hour; sensitive routes (exports) bypass SW with `no-store` directive |
| Bookmark-leak via shared cache | Per-user cache key includes user ID; admin bash command `caches.delete()` on logout |
| ACME / custom-domain SW conflict | Each origin has its own SW; verified across both default and custom-domain hostnames |

---

## 10. Runbook

**Symptom: PWA stuck on old version.**
1. SW skip-waiting: bump SW version → SW recognises new, calls
   `self.skipWaiting()` after `controllerchange`, app reloads.

**Symptom: install prompt doesn't appear.**
1. Manifest invalid? `chrome://flags#manifest-installable`
   has criteria; check console.
2. iOS Safari: prompt is the manual share-add-to-home flow.
   Our banner explains.

**Symptom: offline page blank.**
1. `/offline.html` not in precache. Add to Workbox precache
   manifest.

---

## 11. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| SW activation | 50 ms | 200 ms | 1 s |
| Cold launch (cached) | 600 ms | 1.5 s | 5 s |
| Cold launch (network) | 1.5 s | 4 s | 15 s |
| Biometric unlock | 1 s | 3 s | 30 s (timeout) |
| Periodic sync per dashboard | 500 ms | 2 s | 30 s |

---

## 12. Migration & rollout

1. **Migrations:** `mobile_height`, `mobile_visible` columns on
   `dashboard_visual`; `mobile_default` boolean on `dashboard_tab`.
2. **Backfill:** default `mobile_visible=true` everywhere; per-
   visual heights derived from desktop height ratio.
3. **Feature flag:** `feature.pwa`. Off by default; enable when
   icons / manifest are in.
4. **iOS app:** native wrapper via Capacitor is a v2 lift; PWA
   carries first.

---

## 13. Open questions

1. **Push registration before login** — Web Push requires
   user gesture; can't pre-register. Documented.
2. **App Store presence** — TWA on Play Store is cheap; iOS
   App Store requires a Capacitor or React Native wrapper.
   Defer.
3. **Offline edits with conflict-merge** — defer (write
   semantics need a careful design).

---

## 14. References

- [21-mobile-pwa.md](../research/modules/21-mobile-pwa.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [16-notifications.md](../research/modules/16-notifications.md)
- Workbox docs, ngsw docs
- WebAuthn Level 3 (W3C)
- Periodic Background Sync API (Chrome)
