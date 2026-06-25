# 99 · Cross-cutting Security, Performance, Reliability — Deep Test Cases

## Security

### Authn / Authz
- **XCS-AUTH-N-01** · JWT tamper detected on every endpoint. P0 🟣
- **XCS-AUTH-N-02** · Expired JWT 440 → forced refresh. P0
- **XCS-AUTH-N-03** · Token reuse-detection kills all sessions. P0 🟣
- **XCS-AUTH-N-04** · Step-up required for sensitive actions. P0
- **XCS-AUTH-N-05** · API token cannot escalate to UI session. P0 🟣

### Tenant isolation
- **XCS-TEN-N-01** · Crafted UUID from another org → 404 (not 403). P0 🟣
- **XCS-TEN-N-02** · JWT-source-of-truth for org id (header/body/param ignored). P0 🟣
- **XCS-TEN-N-03** · Cross-tenant probe on every endpoint (generated suite). P0 🟣

### Input safety
- **XCS-XSS-N-01** · XSS payloads in every text input → never executed. P0 🟣
- **XCS-SQL-N-01** · SQL injection in every text input that feeds preview → parameterised. P0 🟣
- **XCS-SSRF-N-01** · Datasource host pointed at AWS metadata → blocked. P0 🟣
- **XCS-CSRF-N-01** · Cross-origin POST without auth → 401. P0 🟣
- **XCS-CSP-N-01** · X-Frame-Options / frame-ancestors set; clickjacking blocked. P0 🟣

### Sensitive data
- **XCS-PII-N-01** · Passwords, refresh tokens, pepper keys never in any GET response. P0 🟣
- **XCS-PII-N-02** · Audit metadata redacts PII columns. P0 🟣

### Rate limiting
- **XCS-RL-H-01** · Login throttled by IP + by username. P0
- **XCS-RL-H-02** · Public endpoints rate-limited per IP. P0
- **XCS-RL-H-03** · API token rate-limited per token. P0

### Cryptography
- **XCS-CRYPTO-H-01** · Encryption at rest for sensitive fields (password, pepper, refresh). P0 🟣
- **XCS-CRYPTO-H-02** · TLS 1.2+ on every public endpoint. P0 🟣
- **XCS-CRYPTO-H-03** · JWT signing keys rotated quarterly. P1 🟣

## Performance

- **XCS-PERF-H-01** · Login p95 < 1.5s. P1 ⚡
- **XCS-PERF-H-02** · Datasets list (100 rows) renders < 1s. P1 ⚡
- **XCS-PERF-H-03** · Analysis canvas 5 charts first-paint < 3s. P1 ⚡
- **XCS-PERF-H-04** · Sidebar pin/unpin animation runs at 60fps. P1 ⚡
- **XCS-PERF-H-05** · Memory: 20 route navigations, heap doesn't monotonically grow > 50MB after GC. P1 ⚡
- **XCS-PERF-H-06** · Echarts instances disposed on route leave. P1 ⚡
- **XCS-PERF-H-07** · Bundle size < 1MB gzipped for initial JS. P1 ⚡
- **XCS-PERF-H-08** · Time-to-interactive on /login < 2s on 4G. P1 ⚡

## Reliability

- **XCS-REL-H-01** · Health endpoints `/healthz/live` + `/healthz/ready`. P0
- **XCS-REL-H-02** · /healthz/ready returns 200 only when DB + Redis + email transport up. P0
- **XCS-REL-N-01** · DB connection lost mid-request → request fails fast with retry-after. P1
- **XCS-REL-N-02** · Redis lost → cache miss path engages. P0
- **XCS-REL-N-03** · BullMQ worker crash → job retried on restart. P0

## Browser matrix
- **XCS-BR-H-01** · Chromium full suite green. P0
- **XCS-BR-H-02** · Firefox full suite green. P1
- **XCS-BR-H-03** · WebKit (Safari) full suite green. P1
- **XCS-BR-N-01** · IE11 unsupported → friendly banner. P2

## Compliance touchpoints

- **XCS-GDPR-H-01** · Data export request (Art 20) yields complete bundle. P0
- **XCS-GDPR-H-02** · Right-to-erasure (Art 17) succeeds. P0
- **XCS-SOC2-H-01** · Audit log immutable for 7 years (configurable). P0
- **XCS-HIPAA-H-01** · Encrypted at rest + TLS 1.2+ + BAA documented. P0

## Observability

- **XCS-OBS-H-01** · OpenTelemetry spans on every endpoint. P1
- **XCS-OBS-H-02** · Prometheus metrics at /metrics. P1
- **XCS-OBS-H-03** · Correlation id propagated through nested calls. P1
- **XCS-OBS-H-04** · Errors grouped by fingerprint (Sentry-style). P1
- **XCS-OBS-H-05** · SSE live audit stream for support. P2

## Regression buckets
- Auth surface → XCS-AUTH-* + XCS-TEN-*
- Input safety → XCS-XSS-*, XCS-SQL-*, XCS-SSRF-*
- Rate limits → XCS-RL-*
- Health + reliability → XCS-REL-*
