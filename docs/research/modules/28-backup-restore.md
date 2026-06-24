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

## Appendix · Review additions

- **PITR** (Point-in-time recovery) beyond logical backups.
- **Cross-tenant restore** (M&A).
- **Selective restore** — only dashboards, not users.
- **Backup verification** — periodic restore-into-sandbox.
- **Customer-managed encryption keys** (BYOK / KMS).
- **Compliance retention** — legal holds.

### Schema delta

```sql
CREATE TABLE backup_artifact (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  kind            varchar(16) NOT NULL,  -- full|incremental|logical
  location_uri    text NOT NULL,         -- s3://...
  size_bytes      bigint,
  checksum_sha256 varchar(64),
  encrypted_by    varchar(64),           -- 'kms:arn:...' or 'aes-256-gcm:vault-key'
  created_at      timestamptz NOT NULL DEFAULT now(),
  verified_at     timestamptz,
  verified_ok     boolean,
  retention_until timestamptz,
  legal_hold      boolean NOT NULL DEFAULT false
);
CREATE INDEX ON backup_artifact (organisation_id, created_at DESC);
```

### KMS encryption

```ts
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
const kms = new KMSClient({ region: 'us-east-1' });
const { CiphertextBlob } = await kms.send(new EncryptCommand({
  KeyId: kmsKeyArn,
  Plaintext: backupBytes,
}));
```

### Verification job

Weekly BullMQ job picks a random backup, restores into a throw-away
schema, runs a row-count parity check, deletes the schema, updates
`verified_at + verified_ok`.

### Test IDs

- BAK-PITR-H-01 — restore to T-30min works
- BAK-VERIFY-H-01 — weekly restore-into-sandbox passes
- BAK-KMS-H-01 — KMS-encrypted backup decrypts
- BAK-HOLD-N-01 — legally-held backup cannot be deleted by org admin
- BAK-SELECT-H-01 — restore only dashboards, leave users intact
