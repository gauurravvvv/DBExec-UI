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
