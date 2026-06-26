# Branding, theming, white-label

> Implementation companion to research module 20. Pins the
> token-driven brand model, dark mode pairing, custom-domain
> auto-TLS, email and PDF template inheritance, and
> WCAG-contrast validation.

**Status:** 🔴 not in product.
**Effort:** M-L (~3 weeks).

---

## 0. Problem statement

White-label customers want DBExec to look like *their*
product. The shopping list:

- Custom logo (light + dark variants).
- Brand colours that propagate through 200+ CSS tokens.
- Custom domain (`analytics.acme.com`) with auto-TLS.
- Email templates branded.
- PDF exports branded (cover sheet logo + colours).
- Login screen branded (per-domain).

The hard part is making it all driven from a small set of
*tokens* so adding a new component doesn't require touching
brand config.

---

## 1. Data model

```sql
CREATE TABLE org_branding (
  org_id        UUID PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  brand_name    TEXT,                                    -- "Acme Analytics" — overrides "DBExec"
  -- 15 semantic tokens, each stored as { light: '#rrggbb', dark: '#rrggbb' }
  tokens        JSONB NOT NULL DEFAULT '{}',
  font_family   TEXT,
  font_url      TEXT,                                     -- self-hosted woff2; we proxy
  favicon_asset_id UUID REFERENCES brand_asset(id),
  logo_light_asset_id UUID REFERENCES brand_asset(id),
  logo_dark_asset_id  UUID REFERENCES brand_asset(id),
  email_from_name  TEXT,                                   -- "Acme Analytics"
  email_reply_to   TEXT,
  email_footer     TEXT,
  pdf_cover_template TEXT,                                 -- inline HTML, sanitised
  pdf_footer_text  TEXT,
  hide_powered_by  BOOLEAN NOT NULL DEFAULT false,         -- premium plan only
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES "user"(id)
);

CREATE TABLE brand_asset (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                          -- 'logo_light' | 'logo_dark' | 'favicon' | 'pdf_logo'
  storage_key   TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  byte_size     INTEGER NOT NULL,
  width_px      INTEGER,
  height_px     INTEGER,
  uploaded_by   UUID NOT NULL REFERENCES "user"(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_custom_domain (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  hostname      TEXT NOT NULL UNIQUE,                    -- 'analytics.acme.com'
  status        TEXT NOT NULL DEFAULT 'pending',         -- 'pending' | 'verifying' | 'issued' | 'failed' | 'revoked'
  verification_token TEXT,                                  -- TXT record value
  tls_issued_at TIMESTAMPTZ,
  tls_expires_at TIMESTAMPTZ,
  tls_cert_pem  TEXT,                                       -- encrypted at rest
  tls_key_pem_enc BYTEA,
  last_renew_at TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. The 15 semantic tokens

The minimum set that lets components render without knowing
the brand:

```
--color-primary             // brand primary
--color-primary-contrast
--color-secondary
--color-accent
--color-bg
--color-bg-elevated
--color-fg
--color-fg-muted
--color-border
--color-success
--color-warning
--color-danger
--color-info
--color-link
--color-overlay
```

Plus shape tokens:

```
--radius-sm  --radius-md  --radius-lg
--shadow-1   --shadow-2   --shadow-3
--font-family-base
--font-family-mono
```

Each colour token stored as `{ light, dark }`; the FE applies
the right pair based on theme.

---

## 3. Application at runtime

A `<style>` block injected at app bootstrap from the org's
branding row:

```typescript
// src/app/core/branding/branding.service.ts
@Injectable({ providedIn: 'root' })
export class BrandingService {
  apply(branding: OrgBranding, theme: 'light' | 'dark'): void {
    const root = document.documentElement;
    for (const [token, pair] of Object.entries(branding.tokens)) {
      root.style.setProperty(`--${token}`, pair[theme]);
    }
    if (branding.fontFamily) root.style.setProperty('--font-family-base', branding.fontFamily);
    document.title = branding.brandName ?? 'DBExec';
    if (branding.faviconUrl) this.setFavicon(branding.faviconUrl);
  }
}
```

All component CSS reads from these vars — no hard-coded
colours anywhere.

---

## 4. WCAG-contrast validation

```typescript
import { rgbToLuminance } from './color';

export function contrastRatio(fg: string, bg: string): number {
  const lf = rgbToLuminance(fg);
  const lb = rgbToLuminance(bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

export function validateBrandingContrast(tokens: BrandTokens): ContrastReport {
  const issues: ContrastIssue[] = [];
  for (const theme of ['light', 'dark'] as const) {
    const pairs = [
      ['color-fg', 'color-bg', 4.5],
      ['color-primary', 'color-bg', 3],
      ['color-primary-contrast', 'color-primary', 4.5],
      ['color-link', 'color-bg', 4.5],
      ['color-warning', 'color-bg', 3],
      ['color-danger', 'color-bg', 3],
    ];
    for (const [fg, bg, minRatio] of pairs) {
      const r = contrastRatio(tokens[fg][theme], tokens[bg][theme]);
      if (r < (minRatio as number)) {
        issues.push({ theme, fg, bg, ratio: r, required: minRatio });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
```

Save endpoint rejects unless ALL contrast checks pass — or the
admin sets `acceptContrastIssues: true` after seeing the
warnings (we log the override).

---

## 5. Custom domain — ACME flow

```
1. Admin enters hostname 'analytics.acme.com'
2. We return verification: "set TXT record _dbexec.<hostname> = <token>"
3. Admin sets the record
4. Verify endpoint: we DNS-lookup the TXT; on match, status = 'verifying'
5. ACME challenge: HTTP-01 served from our edge
6. Certificate issued; status = 'issued'
7. Renewal cron 30 days before expiry
8. Auto-revoke on org disable
```

Library: `acme-client` (battle-tested, no native deps). Let's
Encrypt is the default ACME directory; configurable per
deployment.

```typescript
// src/services/branding/acme.ts
export async function provisionCert(domain: OrgCustomDomain): Promise<void> {
  const client = new acme.Client({
    directoryUrl: process.env.ACME_DIRECTORY_URL!,
    accountKey: await loadOrCreateAccountKey(),
  });

  const [key, csr] = await acme.crypto.createCsr({ commonName: domain.hostname });

  const cert = await client.auto({
    csr,
    email: process.env.ACME_CONTACT_EMAIL!,
    termsOfServiceAgreed: true,
    challengeCreateFn: async (auth, ch, key) => {
      // HTTP-01: respond with the key authorization at /.well-known/acme-challenge/<token>
      await redis.set(`acme:${ch.token}`, key, 'EX', 600);
    },
    challengeRemoveFn: async (_a, ch) => { await redis.del(`acme:${ch.token}`); },
  });

  const { enc } = await encryptSecret(key.toString(), domain.orgId);
  await connection.getRepository('OrgCustomDomain').update({ id: domain.id }, {
    status: 'issued',
    tlsIssuedAt: new Date(),
    tlsExpiresAt: addDays(new Date(), 90),
    tlsCertPem: cert,
    tlsKeyPemEnc: enc,
  });
}
```

Renewal cron runs daily; renews any cert whose
`tls_expires_at < NOW() + 30 days`.

---

## 6. Edge TLS termination

The HTTPS endpoint hot-loads certs by SNI:

```typescript
import https from 'https';
import tls from 'tls';

const server = https.createServer({
  SNICallback: async (servername: string, cb: any) => {
    const domain = await loadDomainByHostname(servername);
    if (!domain || domain.status !== 'issued') return cb(new Error('Unknown SNI'));
    const cert = domain.tlsCertPem;
    const key = await decryptSecret(domain.tlsKeyPemEnc, domain.tlsKeyDekId, domain.orgId);
    cb(null, tls.createSecureContext({ cert, key }));
  },
}, app);
```

In practice we usually front this with a TLS-terminating
load balancer (AWS NLB + ACM, or Cloudflare custom domains).
Either way, the cert provisioning logic above applies.

---

## 7. Email & PDF templates

Email templates use MJML with placeholder slots for tokens.
At render time:

```typescript
import mjml2html from 'mjml';

export function renderEmail(template: string, branding: OrgBranding, ctx: any): string {
  const mjml = template
    .replace(/{{logoUrl}}/g, branding.logoLightUrl ?? DEFAULT_LOGO)
    .replace(/{{primary}}/g, branding.tokens['color-primary'].light)
    .replace(/{{footer}}/g, branding.emailFooter ?? DEFAULT_FOOTER);
  return mjml2html(mjml).html;
}
```

PDF cover-sheet template: a constrained HTML subset (no
scripts, no external resources except the logo); rendered via
Puppeteer (module 13 export pipeline).

---

## 8. Controller — save branding

```typescript
// src/controllers/branding/save.ts
const saveBranding = async (req: Request, res: Response) => {
  const { brandName, tokens, fontFamily, emailFromName, emailReplyTo, emailFooter,
          pdfCoverTemplate, pdfFooterText, acceptContrastIssues } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    // Validate tokens shape + contrast
    if (tokens) {
      const report = validateBrandingContrast(tokens);
      if (!report.ok && !acceptContrastIssues) {
        await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, BRAND_MSG.CONTRAST, { issues: report.issues });
      }
    }
    // Sanitise PDF template
    const safePdfCover = pdfCoverTemplate
      ? sanitiseHtml(pdfCoverTemplate, { allowedTags: ['div','span','p','h1','h2','h3','img','strong','em','br'],
                                          allowedSchemes: ['https'], allowedAttributes: { img: ['src','alt','width','height'] } })
      : null;

    const existing = await connection.getRepository('OrgBranding').findOne({ where: { orgId: orgData.orgId } });
    const next = await connection.getRepository('OrgBranding').save({
      ...existing,
      orgId: orgData.orgId,
      brandName, tokens, fontFamily,
      emailFromName, emailReplyTo, emailFooter,
      pdfCoverTemplate: safePdfCover, pdfFooterText,
      updatedBy: loggedInId,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.BRANDING, action: AUDIT_ACTIONS.UPDATE,
      entityName: 'OrgBranding', entityId: orgData.orgId,
      metadata: { acceptContrastIssues: !!acceptContrastIssues },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, BRAND_MSG.OK, next);
  } catch (err: any) {
    Logger.error(`Save branding failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 9. FE — branding editor

Inside admin console: a tabbed panel.

```
[ Tokens ]  [ Logo ]  [ Email ]  [ PDF ]  [ Custom domain ]

Tokens:
  Primary:          [#1f5fef] / [#5a8aff]   ← light / dark
  Primary contrast: [#ffffff] / [#0e1116]
  Background:       [#ffffff] / [#0e1116]
  ...

  Preview:
  ┌────────────────────────────────────────┐
  │  (live sample app shell, dark+light)  │
  └────────────────────────────────────────┘

  Contrast report:
   ✓ fg on bg (light): 12.3:1
   ✓ fg on bg (dark):   8.8:1
   ⚠ primary on bg (dark): 2.4:1 (need 3:1)

  [Save]
```

---

## 10. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_branding_save_total` | counter | `org` | usage |
| `dbexec_branding_contrast_override_total` | counter | — | quality canary |
| `dbexec_custom_domain_status` | gauge | `domain`, `status` | per-domain state |
| `dbexec_custom_domain_renewal_attempt_total` | counter | `outcome` | renewal health |
| `dbexec_custom_domain_renewal_ms` | histogram | — | ACME latency |
| `dbexec_brand_asset_bytes` | gauge | `org` | quota tracking |

---

## 11. Security & threat model

| Threat | Mitigation |
|---|---|
| Logo upload as malicious SVG with embedded script | SVG sanitised at upload (strip `<script>`, `on*` attrs); served with `Content-Type: image/svg+xml`; `Content-Security-Policy` blocks inline JS in served images |
| XSS via PDF cover template | sanitise-html allowlist; no scripts, no inline event handlers |
| Custom domain takeover (DNS dangling) | Verify TXT before cert provision; periodic re-check on renewal |
| ACME rate-limit lockout | Let's Encrypt: 50 certs/domain/week; per-org rate limit at our layer |
| Cert key leak | Keys KMS-wrapped at rest; only decrypted into HTTPS process memory |
| Branding bypass (user-supplied URL replaces logo) | Logos served from our CDN only; signed URLs |
| Insufficient contrast = a11y regression | Validator default-rejects below WCAG AA |

---

## 12. Runbook

**Symptom: custom domain stuck verifying.**
1. DNS TXT record correct? Lookup directly:
   `dig +short TXT _dbexec.<host>`.
2. CNAME for the hostname pointing at us? Some customers
   forget.

**Symptom: cert renewal fails.**
1. `last_error` populated. Common: ACME rate limit; wait 24h.
2. If domain expired (registrar lapse) — alert customer.

**Symptom: dark mode looks wrong.**
1. Tokens may have light-only values. Validator should have
   caught — check whether `acceptContrastIssues` was set.

---

## 13. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Apply branding (FE bootstrap) | 5 ms | 20 ms | 100 ms |
| Save branding | 80 ms | 250 ms | 2 s |
| Validate contrast | 5 ms | 15 ms | 50 ms |
| Custom domain verify | 200 ms | 1 s | 5 s |
| Cert provision (ACME) | 30 s | 90 s | 5 min |
| SNI cert lookup | 1 ms | 5 ms | 50 ms |

---

## 14. Migration & rollout

1. **Migrations:** `org_branding`, `brand_asset`,
   `org_custom_domain`. Indexes per hostname.
2. **Backfill:** default branding row per existing org with
   DBExec defaults.
3. **Feature flag:** `feature.white_label`. Subscription tier
   gates the `hide_powered_by` toggle.
4. **Custom domain beta:** one design partner first.

---

## 15. Open questions

1. **Per-user theme override** — user picks dark while org
   default is light. We do per-user; document.
2. **Multi-brand orgs** — a parent org with multiple sub-brands
   per share-link. Defer.
3. **Wildcard certs vs SAN** — single SAN per custom domain
   is simpler; wildcards (`*.acme.com`) need DNS-01 challenge,
   bigger lift. Defer.

---

## 16. References

- [20-branding.md](../research/modules/20-branding.md)
- [13-export-download.md](../research/modules/13-export-download.md)
- [16-notifications.md](../research/modules/16-notifications.md)
- WCAG 2.1 SC 1.4.3 (contrast minimum)
- RFC 8555 ACME, RFC 8737 ACME TLS-ALPN
- mjml.io reference
- sanitize-html npm
