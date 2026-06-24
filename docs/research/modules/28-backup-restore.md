# 28 · Backup, Restore, Multi-region

## Backup

Already touched in module 24. Bundle is a JSON archive zipped.

### Components

- All org metadata tables (users, roles, datasets, analyses, dashboards, ...)
- Encrypted sensitive fields stay encrypted (org pepper required on
  restore in the same org).
- Optional: uploaded data rows (CSV-backed datasets).

### Schedule

- Manual export anytime.
- Nightly automatic backup → S3 / GCS / Azure Blob (configurable).
- Retention: 30 days hot, 1 year cold.

## Restore

- Different org? Pepper key must be re-supplied for decryption.
- Conflict resolution: skip / overwrite / merge.
- Dry-run mode shows diff before applying.

## Multi-region

For enterprise customers:

- Region-pinned org (data never leaves region).
- DBExec metadata replicated cross-region for HA.
- Customer's source DB always stays in its region.

```sql
ALTER TABLE organisation
  ADD COLUMN region varchar(16) NOT NULL DEFAULT 'us-east-1',
  ADD COLUMN data_residency_constraints jsonb;
```

Region picker on org creation.

## DR posture

- RTO target: 1 hour for SaaS.
- RPO target: 15 minutes (DB WAL streaming to standby).
- Point-in-time recovery via Postgres logical replication slots.

## Tests

- **BAK-H-01** — full backup → restore round-trips with byte-identical data
- **BAK-CONF-H-01** — restore with name conflict → user prompted to rename
- **REG-N-01** — EU-pinned org user cannot create a US datasource
