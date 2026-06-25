# 24 · Branding / Theming / White-label — Deep Test Cases

## Happy
- **BR-H-01** · Primary colour reflected on buttons. P0
- **BR-H-02** · Favicon swap renders on tab. P0
- **BR-H-03** · Logo dark/light auto-swaps with theme. P1
- **BR-H-04** · Login background image renders. P1
- **BR-H-05** · Email branding override (header + footer). P1

## Negative
- **BR-N-01** · Invalid hex colour → reject. P1
- **BR-N-02** · Logo > 1MB → reject. P1
- **BR-N-03** · Custom CSS containing `<script>` → sanitised. P0 🟣

## Edge
- **BR-E-01** · WCAG contrast check rejects failing palette. P0 ♿
- **BR-E-02** · Chart palette respected by all 73 chart types. P1
- **BR-E-03** · Logout clears theme; /login renders default. P0

## White-label
- **WL-H-01** · `embed_chrome=false` hides "Powered by DBExec". P0
- **WL-H-02** · Email templates render org overrides. P1
- **WL-H-03** · Custom domain (CNAME) routes traffic. P1
- **WL-H-04** · Auto-TLS provisioning succeeds (Let's Encrypt). P1
- **WL-N-01** · Unverified domain rejects custom domain. P1 🟣

## Security
- **BR-S-01** · Custom CSS cannot inject arbitrary HTML. P0 🟣
- **BR-S-02** · Custom domain DNS verification required. P0 🟣

## Regression buckets
- Theme system → BR-H-01..05, WL-*
- WCAG contrast → BR-E-01
