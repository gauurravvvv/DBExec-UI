# 05 · Connections — Deep Test Cases

## Scope
Per-user DB-credential wrappers around a datasource.

## Fixtures
- Datasource `pg_local`
- Connection `conn_eve` (dbUsername=`eve`)
- Connection `conn_reader` (dbUsername=`reader`)

## Happy
- **CON-H-01** · Add connection with unique name + non-admin creds. P0
- **CON-H-02** · Edit name + password → re-encrypted. P0
- **CON-H-03** · Edit description only → no password rotation. P1
- **CON-H-04** · Toggle status with justification. P1
- **CON-H-05** · Delete connection → cascaded access grants removed. P0
- **CON-H-06** · Filter list by datasource. P2

## Negative
- **CON-N-01** · Name pattern violation. P0
- **CON-N-02** · Name 1 char → tooShort. P0
- **CON-N-03** · Name > 64 → tooLong. P1
- **CON-N-04** · Duplicate name within datasource → 409. P0
- **CON-N-05** · Same name across different datasources → allowed. P1
- **CON-N-06** · dbUsername matches datasource admin → reject "cannot use admin". P0
- **CON-N-07** · Two connections same dbUsername under one datasource → reject. P0
- **CON-N-08** · Datasource id from another org → 404. P0
- **CON-N-09** · Update with `datasource` swap to another org → 404. P0
- **CON-N-10** · Password > 256 → tooLong. P1
- **CON-N-11** · Update without changing name → Not(id) dup-check passes. P1
- **CON-N-12** · User without `connectionManagement` → bounce. P0

## Edge
- **CON-E-01** · Snowflake datasource + role-aware connection user → executes against right role. P1
- **CON-E-02** · Delete connection that has live RLS rules → cascade vs reject (document). P1
- **CON-E-03** · Bulk-delete fails atomic on one in-use connection. P1
- **CON-E-04** · Connection password rotation → in-flight queries finish on old creds. P1
- **CON-E-05** · Name with trailing space → trimmed on save. P2
- **CON-E-06** · Concurrent test-connection same connection → only one underlying call executes. P1

## Security
- **CON-S-01** · Connection password never echoed back. P0 🟣
- **CON-S-02** · "Test connection" gated by feature flag for non-admins. P1
- **CON-S-03** · Connection-test result sanitises driver error messages. P1

## Performance
- **CON-P-01** · 20 concurrent test-connections share pool gracefully. P1

## Regression buckets
- Admin-username guard logic → CON-N-06, CON-N-07
- Cascade delete → CON-H-05, CON-E-02, CON-E-03
