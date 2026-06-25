# 04 · Datasources — Deep Test Cases

## Scope
Add / edit / delete / validate / schema explore / activity for all
supported engines.

## Fixtures
- Postgres `pg_local`
- MySQL `mysql_local` (optional)
- Snowflake `sf_test` (skip if not configured)
- BigQuery (future)

## Add

### Happy
- **DS-H-01** · Postgres add with valid creds; test-connection green; row in list. P0
- **DS-H-02** · Snowflake add reveals account+warehouse; submit accepted. P0
- **DS-H-03** · MySQL default port 3306 auto-fills on type change. P1
- **DS-H-04** · MariaDB OK. P1
- **DS-H-05** · MSSQL default port 1433. P1
- **DS-H-06** · Oracle default port 1521. P1
- **DS-H-07** · Description blank accepted. P2
- **DS-H-08** · Unicode in description accepted. P2

### Negative
- **DS-N-01** · Name leading space → reject. P0
- **DS-N-02** · Port = 0 → reject. P0
- **DS-N-03** · Port > 65535 → reject. P0
- **DS-N-04** · Port non-numeric → reject. P0
- **DS-N-05** · Host invalid (`not a host!`) → reject. P0
- **DS-N-06** · Host IPv6 → reject (driver limitation, documented). P1
- **DS-N-07** · Hostname > 255 → reject. P1
- **DS-N-08** · Database name with spaces → reject. P0
- **DS-N-09** · Database with semicolons → reject. P0
- **DS-N-10** · Username > 128 → reject. P1
- **DS-N-11** · Password > 256 → reject. P1
- **DS-N-12** · Empty password → reject (on add). P0
- **DS-N-13** · Duplicate display name in same org → 409 ALREADY_EXISTS. P0
- **DS-N-14** · Snowflake without account → reject. P0
- **DS-N-15** · Snowflake without warehouse → reject. P0
- **DS-N-16** · Snowflake account > 128 → reject. P1
- **DS-N-17** · Type not in enum → reject. P0
- **DS-N-18** · Save without test-connect → BE retests; rejects if bad. P0
- **DS-N-19** · User without `dataManagement.datasourceManagement` writes → bounce. P0
- **DS-N-20** · SSRF host = `169.254.169.254` → blocked / sanitised. P0 🟣
- **DS-N-21** · SSRF host = `localhost:22` → fail cleanly, no port-scan oracle. P0 🟣

### Edge
- **DS-E-01** · Two users add same name in race → first wins, second 409. P1
- **DS-E-02** · Password contains `;` → driver escapes; works. P1
- **DS-E-03** · IPv4 (`127.0.0.1`) → accepted. P1
- **DS-E-04** · Hostname exactly 255 → accepted (boundary). P2
- **DS-E-05** · Display name exactly 2 chars → accepted (boundary). P2
- **DS-E-06** · Display name exactly 64 → accepted. P2
- **DS-E-07** · Display name 65 → reject. P2
- **DS-E-08** · Database name with hyphens + underscores → accepted. P2
- **DS-E-09** · Concurrent add same name → second fails cleanly. P1

## Validate

- **DS-H-20** · POST /validate Postgres ok → 200 ok. P0
- **DS-H-21** · Snowflake validate with correct account+warehouse → 200. P0
- **DS-N-30** · Wrong password → 400; driver msg sanitised. P0
- **DS-N-31** · Wrong host → friendly "could not connect". P1

## Update

- **DS-H-30** · Edit name/desc only, password empty → stored password unchanged. P0
- **DS-H-31** · Edit password → re-encrypted; subsequent queries use new. P0
- **DS-H-32** · Toggle status active↔inactive with justification. P1

- **DS-N-40** · `type` in payload silently ignored. P0
- **DS-N-41** · Status flip without justification → reject (audit gate). P1
- **DS-N-42** · Update id from another org → 404. P0

## Delete

- **DS-H-40** · Delete unused → soft-deleted. P0
- **DS-H-41** · Bulk-delete with justification → both gone, audit captured. P1

- **DS-N-50** · Delete with datasets attached → reject. P0
- **DS-N-51** · Bulk-delete empty ids → 400. P1
- **DS-N-52** · Delete id from another org → 404. P0

## Schema explorer

- **DS-E-20** · 1000+ tables lazy-load; no freeze. P1 ⚡
- **DS-E-21** · 0 schemas → empty state, not infinite spinner. P2
- **DS-E-22** · Column copy-to-clipboard. P2
- **DS-E-23** · Reserved-keyword column names quoted in copy. P1

## Activity / cancel / terminate

- **DS-E-30** · activity/refresh shows live conns; terminate one; gone next poll. P1
- **DS-E-31** · Cancel finished query → idempotent ok. P2
- **DS-E-32** · Terminate during long query → errors gracefully. P1

## Security

- **DS-S-01** · Datasource password not in any GET response. P0 🟣
- **DS-S-02** · Test-connection runs with bounded statement timeout (no DoS). P1
- **DS-S-03** · SSL cert fingerprint mismatch → abort handshake. P1 (when TLS pinning)

## Performance

- **DS-P-01** · Schema list 5000 tables completes < 3s with lazy load. P1
- **DS-P-02** · 50 concurrent test-connects → no pool starvation. P1

## Regression buckets
- Driver layer changed → DS-H-01..06, DS-N-30..31, DS-E-30..32
- SSL / IAM added → DS-S-03, DS-H-20..21, DS-N-20..21
