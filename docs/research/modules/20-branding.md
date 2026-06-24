# 20 · Theming, Branding, White-label

DBExec has per-org theme + branding. Extensions:

## Schema delta

```sql
ALTER TABLE org_brand
  ADD COLUMN favicon_url text,
  ADD COLUMN login_background_url text,
  ADD COLUMN logo_dark_url text,
  ADD COLUMN logo_light_url text,
  ADD COLUMN email_template_overrides jsonb,
  ADD COLUMN font_family varchar(64),
  ADD COLUMN custom_css text,
  ADD COLUMN embed_chrome boolean NOT NULL DEFAULT true,   -- show DBExec branding in embed
  ADD COLUMN dashboard_chart_palette text[];                -- chart colour cycle
```

## White-label

If `embed_chrome=false`:

- Footer hides "Powered by DBExec".
- Email templates render `org_brand.email_template_overrides`.
- Login page uses `login_background_url`.
- Favicon swapped to org's.

## Theme variables

CSS variables resolved at runtime from org_brand. The theme service
emits them into `:root` on login. Charts pick up
`--chart-palette-1`...`--chart-palette-10`.

## Tests

- **BR-H-01** — primary colour reflected on buttons
- **BR-H-02** — favicon swap renders on tab
- **BR-WL-H-01** — embed iframe hides "Powered by" footer

## Appendix · Review additions

- **Email branding** — per-tenant email template override (header
  image, footer text).
- **Custom domain** (`analytics.acme.com` CNAME) with auto-TLS via
  Caddy / Traefik / Let's Encrypt.
- **Brand-applied chart palette** with WCAG contrast check before
  save.
- **Logo dark/light** auto-swap based on theme.
- **Login background** image / video / pattern.
- **Custom CSS injection** with sanitisation.

### Schema delta

```sql
CREATE TABLE custom_domain (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL UNIQUE,
  hostname        varchar(255) NOT NULL UNIQUE,
  status          varchar(16) NOT NULL DEFAULT 'pending', -- pending|verified|failed
  cert_arn        varchar(255),                          -- ACM ARN
  verified_at     timestamptz,
  cname_target    varchar(255) NOT NULL,
  created_on      timestamptz NOT NULL DEFAULT now()
);
```

### WCAG contrast check

```ts
import { contrast } from 'wcag-contrast';
function validatePalette(fg: string, bg: string) {
  const ratio = contrast.hex(fg, bg);
  if (ratio < 4.5) throw new Error(`contrast ${ratio} < 4.5`);
}
```

### Test IDs

- BR-DOM-H-01 — CNAME verified, traffic routes through
- BR-DOM-TLS-H-01 — TLS cert provisioned automatically
- BR-PAL-WCAG-N-01 — palette failing contrast rejected
- BR-LOGO-DARK-H-01 — dark theme swaps to logo_dark_url
- BR-EMAIL-H-01 — sent email reflects org template overrides
