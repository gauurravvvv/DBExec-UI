# 20 · Theming, Branding, White-label

> Make DBExec look like the customer's product, not DBExec. Per-org
> theme tokens, custom logo, custom domain, dark/light variants,
> PDF / email header bound to the same palette. The hardest part
> is keeping every surface (web, PDF, email) consistent.
>
> Sister modules:
> [14 · Sharing & Embed](14-share-embed.md) (per-link theme overrides
> for embedded clients), [13 · Export](13-export-download.md) (PDF
> watermark + header), [16 · Notifications](16-notifications.md) (email
> templates inherit branding).

**Depends on:** Org (admin module), CSS / Angular Material theming
**Unblocks:** White-label customers, multi-product deployments
**Maturity:** 🟡 partial — branding entity exists, but a tight
  variable set; no custom domain, no email-template branding

---

## 1. Industry baseline

| Tool | Tokens | Custom logo | Custom domain | Email branding | Dark/Light |
|---|---|---|---|---|---|
| **Tableau Server** | colour + fonts | ✓ | ✓ | partial | manual |
| **Power BI** | colour theme JSON | ✓ | only via app token | ✗ | ✓ |
| **Looker** | tokens via Embed SDK | ✓ | ✓ (custom domain on Embed) | ✓ | ✓ |
| **Hex** | tokens | ✓ | ✓ (enterprise) | ✓ | ✓ |
| **Metabase** | enterprise white-label | ✓ | ✓ (paid) | ✓ | ✓ |
| **Superset** | CSS variables override | ✓ | ✓ (self-host) | manual | ✓ |
| **Sigma** | extensive theme tokens | ✓ | ✓ | ✓ | ✓ |
| **Linear** | accent + grayscale | ✓ | n/a | ✓ | ✓ |

**The patterns to copy:**

- **Token-driven**, not CSS-string overrides. The FE consumes
  `--ds-color-primary`, `--ds-radius-sm`, etc. The brand record
  is JSON; the FE injects it as CSS variables. PDF templates read
  the same JSON.
- **Custom domain via CNAME**, not a subdomain assignment. Customer
  sets `analytics.acme.com` CNAME-ing to `app.dbexec.com`; DBExec
  reads the Host header, finds the matching org, applies theme.
  TLS via Let's Encrypt + cert auto-renewal.
- **Light + dark variants** authored together. Don't ship a theme
  that only works in one mode.
- **Logos in three sizes** (mark, lockup, square favicon). Authoring
  one and computing the others always looks worse than letting the
  customer upload all three.
- **WCAG contrast check at save time** — refuse to ship a theme
  with `primary` on `background` that's below AA contrast.

## 2. DBExec today

- `branding` entity per org with `primary_color`, `accent_color`,
  `logo_url`, `display_name`.
- Sidebar header reads it; nothing else does. PDF templates and
  emails are hardcoded with DBExec's default palette.
- No custom domain. No dark/light split. No favicon override.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| BR-G01 | Token-driven theme (15+ semantic tokens) | P0 | M |
| BR-G02 | Light + dark variants in one save | P0 | S |
| BR-G03 | Logo in 3 sizes (mark, lockup, favicon) | P0 | S |
| BR-G04 | Cover background / hero image | P1 | S |
| BR-G05 | Custom domain with auto-TLS | P0 | L |
| BR-G06 | Email template branding (header + footer) | P0 | M |
| BR-G07 | PDF template branding (header + watermark) | P0 | M |
| BR-G08 | Sidebar / topbar layout density choice | P2 | S |
| BR-G09 | Font family override (Google Fonts + custom) | P1 | M |
| BR-G10 | Border-radius / shape tokens | P1 | S |
| BR-G11 | Custom CSS power-user override | P2 | S |
| BR-G12 | WCAG contrast validation at save | P1 | M |
| BR-G13 | Per-team / per-collection brand override | P2 | M |
| BR-G14 | "Login page" branding (when SSO chooses dbexec.com) | P1 | S |
| BR-G15 | Brand audit history (who changed colour when) | P2 | S |
| BR-G16 | Brand preset gallery (recommended palettes) | P2 | S |

## 4. Target architecture

### 4.1 Token list

```ts
// shared/types/branding.ts
export interface BrandTokens {
  // Identity
  organisationDisplayName: string;
  logoUrl: string;              // mark — square, ~512×512
  logoLockupUrl?: string;       // horizontal lockup with text
  faviconUrl?: string;          // 32×32 / 64×64
  coverImageUrl?: string;       // login / share landing background

  // Colours (light)
  light: {
    primary: string;            // brand accent
    primaryContrast: string;    // text on primary
    background: string;
    surface: string;            // cards / panels
    surfaceVariant: string;
    onBackground: string;
    onSurface: string;
    onSurfaceVariant: string;
    border: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  // Colours (dark)
  dark: { /* same shape */ };

  // Type
  fontFamilyBody?: string;      // e.g. "Inter, sans-serif"
  fontFamilyMono?: string;
  fontUrl?: string;             // for self-hosted custom fonts

  // Shape
  borderRadius: 'sharp' | 'rounded' | 'pill';     // → 0, 6, 12

  // Density
  density: 'compact' | 'comfortable' | 'spacious';

  // Power-user
  customCss?: string;

  // Email + PDF
  emailHeader?: {
    backgroundColor: string;
    textColor: string;
    logoVariant: 'mark' | 'lockup';
    footerHtml?: string;        // legal text / unsubscribe
  };
  pdfHeader?: {
    showLogo: boolean;
    headerText?: string;
    footerText?: string;        // can include {page}/{total}
    backgroundColor?: string;
  };
}
```

### 4.2 Schema

```sql
-- migration: 2027-02-XX_branding_v2.sql

CREATE TABLE org_branding (
  organisation_id  uuid PRIMARY KEY,
  tokens           jsonb NOT NULL,            -- the BrandTokens above
  active           boolean NOT NULL DEFAULT true,
  created_on       timestamptz NOT NULL DEFAULT now(),
  updated_on       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_branding_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  tokens_before    jsonb,
  tokens_after     jsonb NOT NULL,
  changed_by       uuid NOT NULL,
  changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_custom_domain (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL,
  domain             varchar(255) NOT NULL UNIQUE,
  verification_token varchar(64) NOT NULL,
  verified_at        timestamptz,
  tls_status         varchar(16) NOT NULL DEFAULT 'pending',
                                              -- pending | active | renewing | failed
  tls_expires_at     timestamptz,
  acme_challenge     varchar(255),
  created_on         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brand_asset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  kind            varchar(32) NOT NULL,       -- logo | logo_lockup | favicon | cover | font
  url             text NOT NULL,
  size_bytes      int,
  mime_type       varchar(64),
  uploaded_by     uuid,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);
```

### 4.3 Token → CSS variables

```ts
// src/app/shared/services/theme/applyTokens.ts
export function applyTokens(tokens: BrandTokens, mode: 'light'|'dark' = 'light') {
  const root = document.documentElement;
  const palette = tokens[mode];
  const setVar = (k: string, v: string) => root.style.setProperty(`--ds-${k}`, v);

  for (const [name, value] of Object.entries(palette)) {
    setVar(`color-${kebab(name)}`, value);
  }

  setVar('radius-base',
    tokens.borderRadius === 'sharp' ? '0' :
    tokens.borderRadius === 'pill'  ? '999px' : '6px');

  setVar('density-row',
    tokens.density === 'compact'    ? '32px' :
    tokens.density === 'spacious'   ? '56px' : '44px');

  if (tokens.fontFamilyBody) setVar('font-body', tokens.fontFamilyBody);
  if (tokens.fontFamilyMono) setVar('font-mono', tokens.fontFamilyMono);

  // Custom font loading
  if (tokens.fontUrl) {
    if (!document.querySelector(`link[data-brand-font]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = tokens.fontUrl;
      link.dataset.brandFont = '1';
      document.head.appendChild(link);
    }
  }

  // Logo / favicon
  const fav = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (fav && tokens.faviconUrl) fav.href = tokens.faviconUrl;

  // Power-user CSS appended to a sentinel style tag
  let sentinel = document.getElementById('brand-custom-css');
  if (!sentinel) {
    sentinel = document.createElement('style');
    sentinel.id = 'brand-custom-css';
    document.head.appendChild(sentinel);
  }
  sentinel.textContent = tokens.customCss ?? '';
}

const kebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
```

### 4.4 Dark / light selection

```ts
// User preference cascade:
//   user.theme = 'light' | 'dark' | 'system'  ← user setting
//   org.tokens.preferredMode = ...             ← org default
//   prefers-color-scheme media query           ← OS

function resolveMode(user, org): 'light' | 'dark' {
  if (user.theme === 'light' || user.theme === 'dark') return user.theme;
  if (org.preferredMode === 'light' || org.preferredMode === 'dark') return org.preferredMode;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Reapply on system theme change
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (user.theme === 'system') applyTokens(tokens, resolveMode(user, org));
});
```

### 4.5 WCAG contrast validation

```ts
import { hex, contrast } from 'wcag-contrast';   // or compute manually

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const toLin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface ContrastIssue {
  pair: string;
  ratio: number;
  required: number;
  severity: 'fail' | 'warn';
}

export function checkContrast(tokens: BrandTokens, mode: 'light'|'dark'): ContrastIssue[] {
  const p = tokens[mode];
  const checks = [
    { pair: 'onBackground on background', fg: p.onBackground,        bg: p.background, required: 4.5 },
    { pair: 'onSurface on surface',       fg: p.onSurface,           bg: p.surface,    required: 4.5 },
    { pair: 'primaryContrast on primary', fg: p.primaryContrast,     bg: p.primary,    required: 4.5 },
    { pair: 'onSurfaceVariant on surface',fg: p.onSurfaceVariant,    bg: p.surface,    required: 3.0 },
    { pair: 'border vs background',       fg: p.border,              bg: p.background, required: 3.0 },
  ];
  const issues: ContrastIssue[] = [];
  for (const c of checks) {
    const ratio = contrastRatio(c.fg, c.bg);
    if (ratio < c.required) issues.push({
      pair: c.pair, ratio: Math.round(ratio * 100) / 100,
      required: c.required,
      severity: ratio < (c.required - 1) ? 'fail' : 'warn',
    });
  }
  return issues;
}

// PUT /branding — runs checks; failures block save unless ?force=true
async function updateBranding(req, res) {
  const tokens = req.body.tokens as BrandTokens;
  const force = req.query.force === 'true';

  const lightIssues = checkContrast(tokens, 'light');
  const darkIssues  = checkContrast(tokens, 'dark');
  const fails = [...lightIssues, ...darkIssues].filter(i => i.severity === 'fail');
  if (fails.length > 0 && !force) {
    return sendResponse(res, false, 400, 'branding.contrast.failed',
      { issues: [...lightIssues, ...darkIssues] });
  }
  // Save + history row
  await master_db_connection.transaction(async (tx) => {
    const prev = await tx.getRepository(OrgBranding).findOne({ where: { organisationId: res.locals.orgData.id } });
    await tx.getRepository(OrgBranding).upsert({
      organisationId: res.locals.orgData.id, tokens, updatedOn: new Date(),
    }, ['organisationId']);
    await tx.getRepository(OrgBrandingHistory).save({
      organisationId: res.locals.orgData.id,
      tokensBefore: prev?.tokens, tokensAfter: tokens,
      changedBy: res.locals.loggedInId,
    });
  });
}
```

### 4.6 Custom domain + TLS

Two-step flow:

```
1. Admin enters acme.com
2. DBExec stores it + creates verification token
3. Admin adds DNS TXT record: _dbexec-verify.acme.com → <token>
4. Admin clicks Verify
5. BE checks DNS record matches
6. BE adds the domain to its ACME client (Let's Encrypt)
7. ACME HTTP-01 challenge succeeds → cert issued
8. tls_status = active
```

```ts
// src/shared/services/branding/customDomain.ts
import * as dns from 'node:dns/promises';
import { Client } from 'acme-client';

export async function verifyDomain(domainId: string) {
  const cd = await OrgCustomDomain.findOne({ where: { id: domainId } });
  if (!cd) throw new Error('not found');

  const records = await dns.resolveTxt(`_dbexec-verify.${cd.domain}`).catch(() => []);
  const flat = records.flat();
  if (!flat.includes(cd.verificationToken)) {
    throw new BadRequest('DNS verification record not found');
  }

  await OrgCustomDomain.update(cd.id, { verifiedAt: new Date() });
  await scheduleQueue.add('domain:issue-tls', { domainId: cd.id });
}

// Worker: ACME flow
export default async function issueTls({ domainId }: { domainId: string }) {
  const cd = await OrgCustomDomain.findOne({ where: { id: domainId } });
  if (!cd?.verifiedAt) return;

  const client = new Client({
    directoryUrl: process.env.ACME_DIRECTORY_URL!,
    accountKey: process.env.ACME_ACCOUNT_KEY!,
  });

  await OrgCustomDomain.update(cd.id, { tlsStatus: 'renewing' });

  try {
    const [key, csr] = await Client.crypto.createCsr({
      altNames: [cd.domain],
    });
    const cert = await client.auto({
      csr,
      email: process.env.ACME_EMAIL!,
      termsOfServiceAgreed: true,
      challengeCreateFn: async (auth, ch, kt) => {
        await OrgCustomDomain.update(cd.id, { acmeChallenge: kt });
        // The web server serves /.well-known/acme-challenge/<token> from
        // org_custom_domain.acme_challenge
      },
      challengeRemoveFn: async () => {
        await OrgCustomDomain.update(cd.id, { acmeChallenge: null });
      },
    });

    await storeCertificate(cd.id, cert.toString(), key.toString());
    await OrgCustomDomain.update(cd.id, {
      tlsStatus: 'active',
      tlsExpiresAt: extractExpiry(cert.toString()),
    });
  } catch (e) {
    await OrgCustomDomain.update(cd.id, { tlsStatus: 'failed' });
    throw e;
  }
}

// Renewal — nightly job picks domains expiring in <30 days
async function renewSweep() {
  const cutoff = new Date(Date.now() + 30 * 24 * 3600_000);
  const due = await OrgCustomDomain.find({
    where: { tlsStatus: 'active', tlsExpiresAt: LessThan(cutoff) },
  });
  for (const d of due) {
    await scheduleQueue.add('domain:issue-tls', { domainId: d.id });
  }
}
```

Production deployments typically delegate TLS to a load balancer
(AWS ALB / Cloudflare); the same domain table powers a
`CertificateManager` API call instead of in-app ACME. Both shapes
covered by the worker abstraction.

### 4.7 Host-based org resolution

```ts
// shared/middleware/resolveOrgByHost.middleware.ts
export default async function resolveOrgByHost(req, res, next) {
  const host = req.hostname;
  if (host === DEFAULT_HOST) return next();   // app.dbexec.com

  const cd = await OrgCustomDomain.findOne({
    where: { domain: host, tlsStatus: 'active' },
  });
  if (!cd) return next();    // fall through — login screen shows generic

  res.locals.brandHostOrgId = cd.organisationId;
  // Note: this only sets the brand context. Auth + per-request orgId
  // still flow from JWT. Custom domain doesn't auto-authenticate.
  next();
}
```

### 4.8 Email + PDF inheritance

```ts
// src/shared/services/branding/getBrandingFor.ts
export async function getBrandingFor(orgId: string): Promise<BrandTokens> {
  const row = await OrgBranding.findOne({ where: { organisationId: orgId } });
  if (!row) return DEFAULT_BRAND_TOKENS;
  return row.tokens as BrandTokens;
}

// Email template (Handlebars)
export async function renderEmail(orgId: string, templateName: string, data: any) {
  const tokens = await getBrandingFor(orgId);
  const tpl = templates[templateName];
  return tpl({
    ...data,
    brand: {
      logo: tokens.emailHeader?.logoVariant === 'lockup'
              ? tokens.logoLockupUrl : tokens.logoUrl,
      primaryColor: tokens.light.primary,
      headerBg: tokens.emailHeader?.backgroundColor ?? tokens.light.surface,
      headerText: tokens.emailHeader?.textColor ?? tokens.light.onSurface,
      footerHtml: tokens.emailHeader?.footerHtml ?? '',
      displayName: tokens.organisationDisplayName,
    },
  });
}

// Email-template variables read these from `brand`:
// {{brand.logo}}, {{brand.primaryColor}}, {{brand.headerBg}}, etc.
```

PDF templates (used by the export pipeline):

```ts
// FE print route /embed/dashboard/:id?print=true reads tokens from
// the host's org (resolveOrgByHost above) and applies them via the
// same applyTokens function. PDF renderer hits this route; PDF
// inherits theme automatically.

// Headers and footers are HTML strings rendered by puppeteer's
// headerTemplate / footerTemplate options:
return await page.pdf({
  displayHeaderFooter: true,
  headerTemplate: `
    <div style="font-size:9px; padding:8px 16px; width:100%;
                background:${tokens.pdfHeader?.backgroundColor ?? '#fff'};
                color:${tokens.light.onSurface};">
      ${tokens.pdfHeader?.showLogo
         ? `<img src="${tokens.logoLockupUrl ?? tokens.logoUrl}" style="height:18px"/>`
         : ''}
      ${tokens.pdfHeader?.headerText ?? ''}
    </div>`,
  footerTemplate: `
    <div style="font-size:8px; padding:4px 16px; width:100%; text-align:center;
                color:${tokens.light.onSurfaceVariant};">
      ${tokens.pdfHeader?.footerText ?? ''}
      <span style="float:right">
        <span class="pageNumber"></span>/<span class="totalPages"></span>
      </span>
    </div>`,
});
```

### 4.9 Brand preset gallery

A handful of curated palettes shipped in code:

```ts
export const BRAND_PRESETS: Record<string, Partial<BrandTokens>> = {
  classic: { light: { primary: '#2563eb', /* ... */ }, dark: { /* ... */ } },
  emerald: { light: { primary: '#059669', /* ... */ }, dark: { /* ... */ } },
  rose:    { light: { primary: '#e11d48', /* ... */ }, dark: { /* ... */ } },
  slate:   { light: { primary: '#475569', /* ... */ }, dark: { /* ... */ } },
  amber:   { light: { primary: '#d97706', /* ... */ }, dark: { /* ... */ } },
};
```

UI: "Start from preset" button on the branding screen.

### 4.10 Asset upload

```ts
// POST /branding/assets  (multipart)
// kind: logo | logo_lockup | favicon | cover | font
async function uploadBrandAsset(req, res) {
  const file = req.file;
  if (!file) return sendResponse(res, false, 400, 'no file');
  const orgId = res.locals.orgData.id;
  const { kind } = req.body;

  // Validate by kind
  if (kind === 'favicon' && file.size > 100 * 1024)
    return sendResponse(res, false, 400, 'favicon.too_large');
  if (kind === 'logo' && file.size > 1024 * 1024)
    return sendResponse(res, false, 400, 'logo.too_large');
  if (kind === 'logo' && !['image/png','image/svg+xml'].includes(file.mimetype))
    return sendResponse(res, false, 400, 'logo.format');

  const key = `branding/${orgId}/${kind}/${randomUUID()}/${file.originalname}`;
  await s3.upload({ Bucket: process.env.BRAND_BUCKET!, Key: key, Body: file.buffer }).promise();
  const url = `${process.env.BRAND_CDN_URL}/${key}`;

  await BrandAsset.save({
    organisationId: orgId, kind, url, sizeBytes: file.size,
    mimeType: file.mimetype, uploadedBy: res.locals.loggedInId,
  });

  return sendResponse(res, true, 200, '', { url });
}
```

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/branding` | Current tokens for my org |
| PUT | `/branding` | Update tokens |
| POST | `/branding/contrast-check` | Dry-run validation |
| GET | `/branding/history` | History of changes |
| POST | `/branding/assets` | Upload logo / favicon / cover |
| DELETE | `/branding/assets/:id` | Remove |
| POST | `/branding/domains` | Register custom domain |
| GET | `/branding/domains` | List my domains |
| POST | `/branding/domains/:id/verify` | DNS verification step |
| POST | `/branding/domains/:id/renew-tls` | Force renewal |
| DELETE | `/branding/domains/:id` | Remove |
| GET | `/branding/presets` | Preset gallery |
| GET | `/branding/effective` | Tokens including org / user mode resolution |

## 6. FE specs

### 6.1 Branding editor

```
Branding — "Acme Analytics"

  ┌──Identity─────────────────────────────────┐
  │ Display name:      [Acme Analytics___]    │
  │ Logo (mark):       [▣ upload]            │
  │ Logo (lockup):     [▣ upload]  optional   │
  │ Favicon:           [▣ upload]  32×32      │
  │ Cover image:       [▣ upload]  optional   │
  └────────────────────────────────────────────┘

  ┌──Palette──────────────────────────────────┐
  │  [Start from preset ▾]                    │
  │                                            │
  │  Mode:    ◉ Edit light  ○ Edit dark       │
  │                                            │
  │  Primary:          [#2563eb] ▣            │
  │  Primary contrast: [#ffffff] ▣  (AAA)     │
  │  Background:       [#ffffff] ▣            │
  │  Surface:          [#f8fafc] ▣            │
  │  On background:    [#0f172a] ▣  (AAA)     │
  │  ...                                       │
  │                                            │
  │  ⚠ "border on background" only 2.4 (AA needs 3.0)
  │     [Force save] [Auto-fix to nearest]    │
  └────────────────────────────────────────────┘

  ┌──Type & Shape─────────────────────────────┐
  │  Body font:    [Inter ▾]                  │
  │  Mono font:    [JetBrains Mono ▾]         │
  │  Corner radius: ○ Sharp  ◉ Rounded  ○ Pill │
  │  Density:      ◉ Comfortable              │
  └────────────────────────────────────────────┘

  ┌──Email & PDF──────────────────────────────┐
  │  Email header background: [#f8fafc]       │
  │  Email footer HTML:       [textarea]      │
  │  PDF: show logo on every page    ☑        │
  │  PDF footer text:         [textarea]      │
  └────────────────────────────────────────────┘

  ┌──Live preview────────────────────────┐
  │  (rendered preview of a sample        │
  │   dashboard with current tokens       │
  │   in both light + dark)               │
  └───────────────────────────────────────┘

  [Cancel]  [Save & apply]
```

### 6.2 Custom domain wizard

```
Custom domain

  Step 1: Choose domain
  [analytics.acme.com_____________]   [Continue]

  Step 2: Verify ownership
  Add this TXT record to your DNS:
    Name:  _dbexec-verify.acme.com
    Value: dbexec-verify-3f9aa01b...
  [I've added it · Verify]

  Step 3: Point your domain
  Add a CNAME record:
    Name:  analytics
    Value: app.dbexec.com

  Step 4: TLS provisioning (auto)
  ✓ Domain verified
  ⏳ Issuing certificate (Let's Encrypt)... 30s
  ✓ Certificate active until 2027-04-15

  Your dashboards are now available at
  https://analytics.acme.com
```

### 6.3 Login screen branding

When a user lands on `analytics.acme.com/login`, the host-resolution
middleware sets `brandHostOrgId`; the login UI reads tokens from
that org. Result: the login page already shows Acme's logo and
palette before the user enters anything.

If they enter an email that matches a *different* org, the page
quickly reverts to dbexec.com branding — that's a deliberate
signal that they're about to sign in elsewhere.

## 7. Validators

```ts
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const paletteSchema = z.object({
  primary: colorSchema,
  primaryContrast: colorSchema,
  background: colorSchema,
  surface: colorSchema,
  surfaceVariant: colorSchema,
  onBackground: colorSchema,
  onSurface: colorSchema,
  onSurfaceVariant: colorSchema,
  border: colorSchema,
  success: colorSchema,
  warning: colorSchema,
  danger: colorSchema,
  info: colorSchema,
});

export const brandTokensSchema = z.object({
  organisationDisplayName: z.string().min(1).max(100),
  logoUrl: z.string().url(),
  logoLockupUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
  light: paletteSchema,
  dark: paletteSchema,
  fontFamilyBody: z.string().max(128).optional(),
  fontFamilyMono: z.string().max(128).optional(),
  fontUrl: z.string().url().optional(),
  borderRadius: z.enum(['sharp','rounded','pill']),
  density: z.enum(['compact','comfortable','spacious']),
  customCss: z.string().max(20_000).optional(),
  emailHeader: z.object({
    backgroundColor: colorSchema,
    textColor: colorSchema,
    logoVariant: z.enum(['mark','lockup']),
    footerHtml: z.string().max(5000).optional(),
  }).optional(),
  pdfHeader: z.object({
    showLogo: z.boolean(),
    headerText: z.string().max(255).optional(),
    footerText: z.string().max(255).optional(),
    backgroundColor: colorSchema.optional(),
  }).optional(),
});

export const customDomainSchema = z.object({
  domain: z.string()
    .min(4).max(255)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/),
});
```

## 8. Test plan

```
BR-TOK-H-01    PUT /branding → tokens persisted
BR-TOK-H-02    GET /branding returns tokens
BR-TOK-H-03    invalid hex colour → 400
BR-TOK-N-01    customCss > 20k → 400
BR-TOK-H-04    history row written on every update

BR-CONT-H-01   contrast check returns AA/AAA flag per pair
BR-CONT-N-01   fails block save without ?force=true
BR-CONT-H-02   force=true saves with fail in metadata for audit

BR-APPLY-H-01  applyTokens sets CSS variables on document.documentElement
BR-APPLY-H-02  dark mode swaps palette but other vars retained
BR-APPLY-H-03  user pref system → respects prefers-color-scheme media query

BR-FONT-H-01   fontUrl injects link tag; subsequent saves replace
BR-FONT-H-02   no fontUrl → no link tag

BR-LOGO-H-01   upload PNG logo → BrandAsset row + URL returned
BR-LOGO-N-01   non-image mime → 400
BR-LOGO-N-02   > 1 MiB → 400
BR-FAV-N-01    favicon > 100 KiB → 400

BR-DOMAIN-H-01 register domain → verification token created
BR-DOMAIN-H-02 verify → DNS TXT match → verified_at set
BR-DOMAIN-N-01 verify with wrong TXT → 400
BR-DOMAIN-H-03 issue-tls worker → cert active
BR-DOMAIN-N-02 ACME challenge fails → tls_status=failed
BR-DOMAIN-H-04 renew sweep picks domains ≤30 days from expiry
BR-DOMAIN-H-05 host-based org resolution sets brandHostOrgId

BR-EMAIL-H-01  email template uses brand.logo + brand.primaryColor
BR-EMAIL-H-02  emailHeader.footerHtml appears in rendered email
BR-PDF-H-01    PDF export includes logo on first page when configured
BR-PDF-H-02    footerText with {page}/{total} renders correctly

BR-PRESET-H-01 GET /presets returns named palettes
BR-PRESET-H-02 applying preset populates tokens; user can still edit

BR-DARK-H-01   dark contrast checks run on dark palette too
BR-DARK-N-01   dark palette failing AA → blocked unless forced
```

## 9. Migration & rollout

1. Phase 1 — `org_branding` schema + token-driven CSS variables;
   migrate existing primary/accent colours into the new shape.
2. Phase 2 — branding editor UI + contrast check + preset gallery.
3. Phase 3 — asset upload (logo, favicon, cover, font).
4. Phase 4 — email + PDF template branding inheritance.
5. Phase 5 — custom domain + ACME flow.
6. Phase 6 — branding history + per-team override (defer).

## 10. Open questions

- **Font licensing** — customers upload commercial fonts; we host
  + serve. License is theirs. Document responsibility.
- **CSS injection safety** — `customCss` is a power-user feature.
  Sanitise with `cssnano`+`postcss` to strip `@import`, `expression()`,
  `behaviour:`, etc. Doc the threat model.
- **Wildcard custom domains** (`*.acme.com`) — likely v2.
- **Cert storage** — depends on deployment (k8s Secret, AWS ACM,
  Cloudflare-managed). Abstract via `CertificateStore` interface.
- **Per-team branding** — a "Marketing" team inside Acme wants a
  green palette while everyone else uses blue. Deferred to v2;
  branding is currently per-org.

## 11. References

- ACME (RFC 8555): <https://datatracker.ietf.org/doc/html/rfc8555>
- acme-client npm: <https://github.com/publishlab/node-acme-client>
- WCAG contrast: <https://www.w3.org/WAI/WCAG21/quickref/#contrast-minimum>
- Material Design colour tokens: <https://m3.material.io/styles/color/system/overview>
- Tailwind colour scale: <https://tailwindcss.com/docs/customizing-colors>

## Appendix · Review additions

- **Custom domain with ACME auto-TLS** — §4.6.
- **WCAG AA contrast checks at save** — §4.5.
- **Light + dark variants** in one save — §4.4.
- **PDF + email template inheritance** — §4.8.
- **Brand history table** for audit — §4.2.
- **Power-user customCss with sanitiser** — open question.
- **Preset gallery** — §4.9.
- **Three logo sizes** — §4.1 token list.
