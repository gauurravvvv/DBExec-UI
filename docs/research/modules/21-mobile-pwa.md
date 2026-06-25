# 21 · Mobile, PWA, Offline

> The "I want this dashboard on my phone" surface. Progressive Web
> App shell, service worker caching, install-to-home-screen,
> web-push integration, offline awareness, mobile-responsive
> layouts. No native iOS/Android app for v1 — PWA is sufficient
> for the executive-on-the-go use case.
>
> Sister modules:
> [08 · Dashboard](08-dashboard.md) (mobile layout), [16 ·
> Notifications](16-notifications.md) (web push channel),
> [14 · Sharing & Embed](14-share-embed.md) (mobile-friendly
> embed clients).

**Depends on:** Auth (10), Notifications (16), Dashboard (08)
**Unblocks:** Mobile users, exec-on-the-go, kiosk mode
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Tool | Mobile path | Offline | Push |
|---|---|---|---|
| **Tableau** | Native iOS/Android apps | partial (favourites cached) | ✓ |
| **Power BI** | Native iOS/Android + PWA | yes | ✓ |
| **Looker** | Mobile web | n/a | ✓ |
| **Metabase** | Mobile web | n/a | ✗ |
| **Hex** | Web-only (responsive) | n/a | ✓ |
| **Notion** | Native apps + PWA | yes | ✓ |
| **Linear** | Native + PWA | yes | ✓ |

**The patterns to copy:**

- **PWA before native.** Adoption cost for native apps is high
  (Apple review, two codebases). A solid PWA + responsive layout
  covers ~90% of the use case. Build native later if data shows
  it's needed.
- **App-shell architecture.** The shell (sidebar, topbar, routing)
  is the service worker's cache target. Content loads via API.
  First load is ~30KB.
- **Read-only offline**. Editing offline is hard; viewing
  previously-loaded dashboards while air-gapped is easy and
  high-value. Show clearly when data is stale.
- **Web Push** ties into module 16 — same VAPID keys, same
  registration, but the PWA can keep pushing notifications even
  when the tab is closed.
- **Beforeinstallprompt** for opt-in install. Don't show "install
  this app" banners on every visit; show after the user is engaged.

## 2. DBExec today

- Responsive layouts exist in pieces but not consistently.
  Dashboard view collapses badly below 768px.
- No service worker, no manifest, no install prompt, no offline.
- Web Push is in module 16's scope but no PWA hookup.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| MO-G01 | Web App Manifest | P0 | S |
| MO-G02 | Service worker with app-shell caching | P0 | M |
| MO-G03 | Workbox-based caching strategies | P0 | M |
| MO-G04 | Install prompt UX | P1 | S |
| MO-G05 | Mobile-responsive dashboard layout | P0 | M |
| MO-G06 | Mobile-responsive filter sidebar (slide-out) | P0 | M |
| MO-G07 | Mobile-responsive analysis builder (view only) | P1 | M |
| MO-G08 | Touch-friendly chart interactions (tap-to-tooltip, pinch-to-zoom) | P1 | M |
| MO-G09 | Bottom-nav for primary actions on mobile | P1 | S |
| MO-G10 | Offline indicator + last-fetched timestamp | P1 | S |
| MO-G11 | Read-only offline render of cached dashboards | P1 | L |
| MO-G12 | Web push subscription handshake | P0 | S |
| MO-G13 | "Add to Home Screen" button | P1 | S |
| MO-G14 | iOS Safari quirks workaround (no `beforeinstallprompt`) | P1 | S |
| MO-G15 | Capacitor wrapper for App Store / Play Store | P2 | L |
| MO-G16 | Biometric unlock (WebAuthn) on PWA | P2 | M |
| MO-G17 | Kiosk mode (full-screen dashboard rotation) | P2 | S |

## 4. Target architecture

### 4.1 Web App Manifest

```json
// public/manifest.webmanifest
{
  "name": "DBExec",
  "short_name": "DBExec",
  "description": "Data visualisation and analytics",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0f172a",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-mask.svg",  "sizes": "any",     "type": "image/svg+xml", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Home", "url": "/?source=shortcut", "icons": [{ "src": "/icons/home.png", "sizes": "96x96" }] },
    { "name": "My dashboards", "url": "/dashboards?source=shortcut", "icons": [{ "src": "/icons/dash.png", "sizes": "96x96" }] }
  ]
}
```

Per-org branding (module 20) overrides theme_color, background_color,
icons, and short_name at runtime via a generated manifest endpoint:

```ts
// GET /manifest.webmanifest — host-aware
app.get('/manifest.webmanifest', async (req, res) => {
  const orgId = res.locals.brandHostOrgId;
  if (!orgId) return res.sendFile('public/manifest.webmanifest');
  const tokens = await getBrandingFor(orgId);
  res.set('Content-Type', 'application/manifest+json');
  res.json({
    name: tokens.organisationDisplayName,
    short_name: tokens.organisationDisplayName.slice(0, 12),
    theme_color: tokens.light.primary,
    background_color: tokens.light.background,
    icons: [
      { src: tokens.logoUrl, sizes: '192x192', type: 'image/png' },
      { src: tokens.logoUrl, sizes: '512x512', type: 'image/png' },
    ],
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
  });
});
```

### 4.2 Service worker (Workbox)

```ts
// src/sw.ts — compiled to public/sw.js by Angular service worker config
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 1. Precache the app shell (manifest entries generated at build)
precacheAndRoute(self.__WB_MANIFEST);

// 2. Navigation routes → cached shell
const handler = new NetworkFirst({
  cacheName: 'shell',
  networkTimeoutSeconds: 3,
});
registerRoute(new NavigationRoute(handler));

// 3. Static assets (JS/CSS) → SWR
registerRoute(
  ({ request }) => ['style','script'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'static',
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 3600, maxEntries: 100 }),
    ],
  }),
);

// 4. Images → CacheFirst with size limit
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 3600, maxEntries: 200 }),
    ],
  }),
);

// 5. API calls → network-only (don't cache freshness-sensitive data)
//    EXCEPT for dashboard render results (cached for offline)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/dashboards/') && url.pathname.endsWith('/render'),
  new StaleWhileRevalidate({
    cacheName: 'dashboard-render',
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 3600, maxEntries: 50 }),
    ],
  }),
);

// 6. Push event handler — see §4.5
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: { url: data.url, notificationId: data.notificationId },
    actions: data.actions,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const url = event.notification.data?.url ?? '/';
        const focus = clients.find(c => c.url.includes(url));
        if (focus) return focus.focus();
        return self.clients.openWindow(url);
      })
  );
});

// 7. Periodic background sync (where supported) for dashboard refresh
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-favourite-dashboards') {
    event.waitUntil(refreshFavouriteDashboards());
  }
});
```

### 4.3 Angular service worker config

```ts
// angular.json — enable service worker for production
"projects/dbexec/architect/build/configurations/production": {
  "serviceWorker": "ngsw-config.json"
}

// ngsw-config.json (Angular's built-in SW, alternative to Workbox)
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app-shell",
      "installMode": "prefetch",
      "updateMode": "prefetch",
      "resources": {
        "files": ["/favicon.ico", "/manifest.webmanifest", "/index.html",
                   "/*.css", "/*.js"],
        "urls": ["https://fonts.googleapis.com/**"]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": { "files": ["/assets/**", "/*.(svg|png|jpg|jpeg|gif|webp)"] }
    }
  ],
  "dataGroups": [
    {
      "name": "dashboard-renders",
      "urls": ["/api/v1/dashboards/*/render"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxSize": 50,
        "maxAge": "1d",
        "timeout": "3s"
      }
    }
  ]
}
```

(Use Workbox for finer-grained control; ngsw is simpler and works
out of the box.)

### 4.4 Install prompt

```ts
// src/app/core/services/pwaInstall.service.ts
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferredPrompt: any = null;
  promptAvailable$ = new BehaviorSubject<boolean>(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.promptAvailable$.next(true);
    });
    window.addEventListener('appinstalled', () => {
      this.promptAvailable$.next(false);
      this.deferredPrompt = null;
      // Track install — useful telemetry
      analytics.track('pwa.installed');
    });
  }

  async promptInstall(): Promise<'accepted'|'dismissed'> {
    if (!this.deferredPrompt) return 'dismissed';
    this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.promptAvailable$.next(false);
    return choice.outcome;
  }
}
```

iOS Safari (which doesn't fire `beforeinstallprompt`) is detected
separately:

```ts
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInStandaloneMode = (navigator as any).standalone === true;
const showIosInstallHint = isIos && !isInStandaloneMode;
```

The UI then shows the iOS-specific share-sheet hint ("Tap ⎙ →
Add to Home Screen").

### 4.5 Web Push integration

The push subscription flow (also referenced in module 16):

```ts
// FE side — after explicit user consent
async function enableWebPush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await fetch('/api/v1/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      userAgent: navigator.userAgent,
    }),
    credentials: 'include',
  });
}

function urlBase64ToUint8Array(s: string): Uint8Array {
  const padding = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
```

The BE side is in module 16 §4.7 — sendWebPush with the
`web-push` npm.

### 4.6 Mobile-responsive dashboard

```scss
// src/app/modules/dashboards/components/view-dashboard/view-dashboard.component.scss
.dashboard-canvas {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  padding: 24px;

  .visual {
    grid-column: span var(--visual-col-span, 6);
    grid-row: span var(--visual-row-span, 1);
  }
}

@media (max-width: 768px) {
  .dashboard-canvas {
    grid-template-columns: 1fr;     // single-column stack
    gap: 12px;
    padding: 12px;

    .visual {
      grid-column: span 1;
      min-height: 280px;            // bigger touch target
    }
  }

  // Hide filter sidebar; convert to slide-out
  .filter-sidebar {
    position: fixed;
    top: 0;
    right: -100%;
    width: 90vw;
    height: 100vh;
    transition: right 200ms ease;
    z-index: 100;

    &.open { right: 0; }
  }
}
```

```html
<!-- view-dashboard.component.html (mobile) -->
<button class="filter-toggle md:hidden" (click)="openFilters()">
  Filters <span class="badge" *ngIf="activeFilterCount() > 0">{{ activeFilterCount() }}</span>
</button>
<div class="filter-sidebar" [class.open]="filtersOpen()">
  <button class="close" (click)="closeFilters()">×</button>
  <app-filter-bar [filters]="filters" ...></app-filter-bar>
</div>
```

### 4.7 Touch interactions

ECharts handles touch natively, but a few defaults change for
mobile:

```ts
const isMobile = window.innerWidth < 768;

const baseOption = {
  tooltip: {
    trigger: isMobile ? 'item' : 'axis',
    triggerOn: isMobile ? 'click' : 'mousemove',
    // On mobile, tap-to-show tooltip; on desktop hover.
  },
  dataZoom: isMobile ? [
    { type: 'inside', xAxisIndex: 0 },     // pinch-to-zoom
    { type: 'slider', height: 30 },         // taller for touch
  ] : [
    { type: 'inside' },
    { type: 'slider', height: 20 },
  ],
  toolbox: { show: !isMobile },             // hide toolbox on phone
};
```

### 4.8 Offline indicator

```ts
// src/app/core/services/network.service.ts
@Injectable({ providedIn: 'root' })
export class NetworkService {
  online$ = new BehaviorSubject<boolean>(navigator.onLine);
  constructor() {
    window.addEventListener('online', () => this.online$.next(true));
    window.addEventListener('offline', () => this.online$.next(false));
  }
}

// In the topbar:
@if (!(networkService.online$ | async)) {
  <div class="offline-banner">
    🚫 You are offline. Showing cached dashboards.
    Last refresh: {{ lastRefreshedAt | timeAgo }}
  </div>
}
```

### 4.9 Read-only offline cache

```ts
// FE caches the render response keyed by dashboardId in IndexedDB
// (via Workbox) so re-opening the dashboard offline returns the
// last seen render.

// dashboard.service.ts excerpt
async loadDashboardRender(id: string): Promise<RenderResponse> {
  if (!navigator.onLine) {
    const cached = await idb.get(`render:${id}`);
    if (cached) return { ...cached, _stale: true, _stale_at: cached.savedAt };
    throw new Error('offline.no_cache');
  }
  const resp = await this.http.get<RenderResponse>(`/api/v1/dashboards/${id}/render`).toPromise();
  await idb.put(`render:${id}`, { ...resp, savedAt: Date.now() });
  return resp;
}
```

The view component flags stale renders:

```html
@if (render?._stale) {
  <div class="stale-banner">
    ⚠ Showing data from {{ render._stale_at | date:'short' }} — offline
  </div>
}
```

### 4.10 Periodic background sync

Where supported (Chrome desktop + Android):

```ts
// app.ts — request permission once after install
async function registerPeriodicSync() {
  if (!('periodicSync' in (await navigator.serviceWorker.ready) as any)) return;
  const status = await navigator.permissions.query({ name: 'periodic-background-sync' as any });
  if (status.state !== 'granted') return;
  try {
    await (await navigator.serviceWorker.ready as any).periodicSync.register('refresh-favourite-dashboards', {
      minInterval: 12 * 3600 * 1000,    // every 12 hours
    });
  } catch { /* not supported */ }
}
```

The SW's `periodicsync` handler then refreshes each of the user's
favourite dashboards into the cache so they're warm next time
they open the app.

### 4.11 Capacitor wrapper (deferred)

For app stores (iOS + Android), wrap the PWA with Capacitor:

```
capacitor.config.ts
  appId: 'com.dbexec.app',
  webDir: 'dist/dbexec',
  server: { url: 'https://app.dbexec.com', cleartext: false },
```

Native plugins for biometric unlock (Face ID / fingerprint),
deep-link handling, share-extension. Defer to v2; PWA covers v1.

### 4.12 Biometric unlock (WebAuthn)

```ts
// FE — register a passkey on first install
async function enrolPasskey() {
  const challenge = await fetch('/api/v1/auth/passkey/challenge').then(r => r.arrayBuffer());
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'DBExec' },
      user: {
        id: new TextEncoder().encode(currentUser.id),
        name: currentUser.email,
        displayName: currentUser.firstName + ' ' + currentUser.lastName,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
    },
  });
  await fetch('/api/v1/auth/passkey/register', {
    method: 'POST',
    body: JSON.stringify({ credential: cred }),
  });
}

// On subsequent login
async function loginWithPasskey() {
  const challenge = await fetch('/api/v1/auth/passkey/challenge').then(r => r.arrayBuffer());
  const assertion = await navigator.credentials.get({
    publicKey: { challenge, userVerification: 'required' },
  });
  const resp = await fetch('/api/v1/auth/passkey/verify', {
    method: 'POST',
    body: JSON.stringify({ assertion }),
  });
  // resp returns JWT — same as password login
}
```

Defer to v1.5 — requires module 10 (auth) to register the
WebAuthn endpoint pair.

### 4.13 Kiosk mode

For TVs / wall-displays / executive dashboards:

```ts
// URL params: ?kiosk=true&rotation=30&tabs=all
// FE strips all chrome, enters fullscreen, auto-rotates between
// tabs every N seconds.

if (route.queryParams.kiosk === 'true') {
  document.documentElement.requestFullscreen();
  setInterval(() => {
    cycleToNextTab();
  }, Number(route.queryParams.rotation || 30) * 1000);
}
```

Requires a separate kiosk-friendly auth flow — typically a
long-lived service token bound to a specific device. Deferred.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/manifest.webmanifest` | Org-branded manifest |
| GET | `/sw.js` | Service worker (cached forever client-side via integrity hash) |
| POST | `/notifications/push/subscribe` | (module 16) |
| POST | `/auth/passkey/register` | (module 10) |
| GET | `/healthz/pwa` | Static "ok" used by SW for connectivity ping |

## 6. FE specs

### 6.1 Install prompt UX

After the user has visited 3+ times AND been on a dashboard for
≥30s, show an unobtrusive prompt:

```
┌──────────────────────────────────────────────────────┐
│ 📱 Add DBExec to your home screen?                   │
│ Faster access + push notifications.                  │
│ [Install]  [Not now]  [Don't ask again]              │
└──────────────────────────────────────────────────────┘
```

iOS-Safari variant:

```
┌──────────────────────────────────────────────────────┐
│ 📱 Install DBExec                                    │
│ Tap ⎙ at the bottom of Safari, then                  │
│ "Add to Home Screen".                                │
│ [Got it]  [Don't show again]                         │
└──────────────────────────────────────────────────────┘
```

### 6.2 Bottom nav (mobile)

```
[ Home ]  [ Search ]  [ + ]  [ Inbox ]  [ Me ]
```

Standard 5-tab pattern. Tabs collapse on landscape orientation
to give back vertical space for content.

### 6.3 Mobile dashboard layout

- Single-column stack.
- Filter sidebar becomes slide-out.
- Visual heights minimum 280px.
- Tooltips on tap, not hover.
- "..." overflow menu replaces hover toolboxes.

### 6.4 Offline banner

Sticky top banner when `navigator.onLine === false`:

```
🚫 Offline · Last refresh 2h ago
```

When opening a dashboard that's not in cache:

```
This dashboard hasn't been loaded recently.
Connect to view its data.
```

## 7. Validators

(Mostly schema-less — most of this module is FE/SW, with the
push-subscribe + manifest endpoints handled by modules 16 and 20
respectively.)

## 8. Test plan

```
MO-MAN-H-01     /manifest.webmanifest returns valid JSON
MO-MAN-H-02     org-branded manifest reflects org tokens
MO-MAN-H-03     short_name truncated to ≤12 chars

MO-SW-H-01      service worker installs on first visit
MO-SW-H-02     /index.html cached after first visit; offline next visit serves shell
MO-SW-H-03      /api/v1/dashboards/X/render cached → offline serves stale
MO-SW-H-04      static asset version bump invalidates cache (hash in URL)
MO-SW-H-05      push event → notification shown by SW
MO-SW-H-06      notificationclick → opens target URL

MO-INST-H-01    beforeinstallprompt captured, prompt available
MO-INST-H-02    appinstalled fires → install banner hides
MO-INST-H-03    iOS Safari: no beforeinstallprompt → iOS hint shown

MO-RESP-H-01    viewport ≤768 → single-column dashboard
MO-RESP-H-02    filter sidebar slides over content
MO-RESP-H-03    tooltips fire on tap (not hover)
MO-RESP-H-04    visual minimum height 280px

MO-PUSH-H-01    push permission granted → subscription POSTed
MO-PUSH-H-02    permission denied → silently fallback
MO-PUSH-H-03    push payload too large (>4KB) → SW renders truncated
                  with "Tap to see details" CTA

MO-OFF-H-01     navigator.onLine false → banner shown
MO-OFF-H-02     online again → banner hides
MO-OFF-H-03     open uncached dashboard offline → friendly error

MO-CACHE-H-01   re-open recently-viewed dashboard offline → cached render renders
MO-CACHE-H-02   stale banner shows last-fetched timestamp

MO-PSYNC-H-01   periodic sync registered → favourites refreshed in background
MO-PSYNC-N-01   unsupported → silent skip

MO-A11Y-H-01    mobile UI keyboard-navigable with on-screen keyboard
MO-A11Y-H-02    bottom nav reachable by screen reader rotor
```

## 9. Migration & rollout

1. Phase 1 — manifest + Angular service worker (ngsw) + install
   prompt.
2. Phase 2 — Workbox migration for finer cache control. Mobile-
   responsive dashboard view.
3. Phase 3 — Web Push subscription handshake (FE side of module 16).
4. Phase 4 — offline read-only with IndexedDB cache + stale banner.
5. Phase 5 — periodic background sync.
6. Phase 6 — kiosk mode + WebAuthn passkey.
7. Phase 7 — Capacitor wrapper for App Store / Play Store
   (deferred; PWA covers most use cases).

## 10. Open questions

- **Auth token storage in PWA** — localStorage works but is
  vulnerable to XSS. HttpOnly cookies work cross-origin only with
  SameSite=None + Secure, which complicates the share-link flow.
  Pick token-in-cookie for the primary app + localStorage for
  embeds.
- **Service worker update lifecycle** — when do we force-refresh
  on version bump? Show a "New version available — refresh" banner
  and let the user pick.
- **iOS push** — historically limited; Safari 16.4+ supports Web
  Push with caveats. Test heavily.
- **Browser storage limits** — Chrome gives ~6% of disk per origin
  (60% if persistent storage approved). Document the cache cap
  in product copy.
- **Notification permission UX** — never ask on page load; only
  after user explicitly clicks "Enable notifications". Auto-ask
  is the fastest way to permanent permission denial.

## 11. References

- Workbox: <https://developer.chrome.com/docs/workbox>
- Angular service worker: <https://angular.dev/ecosystem/service-workers>
- beforeinstallprompt: <https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent>
- Web App Manifest: <https://www.w3.org/TR/appmanifest/>
- Push API: <https://www.w3.org/TR/push-api/>
- Periodic Background Sync: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API>
- Capacitor: <https://capacitorjs.com/docs>
- iOS PWA push: <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>

## Appendix · Review additions

- **beforeinstallprompt** with deferred prompt UX — §4.4.
- **Web Push integration end-to-end** (FE + SW + module 16 BE) —
  §4.5.
- **Capacitor wrapper** path documented for v2 — §4.11.
- **Periodic background sync** for favourite refresh — §4.10.
- **WebAuthn biometric unlock** — §4.12 (deferred).
- **iOS Safari quirks** — §4.4, §10.
- **Offline read-only render** with stale banner — §4.8 + §4.9.
- **Kiosk mode** — §4.13.
