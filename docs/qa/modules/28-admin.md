# 28 · Admin Console / Backup / GDPR — Deep Test Cases

## Admin console
- **ADM-H-01** · Admin opens console; all tabs visible. P0
- **ADM-H-02** · Non-admin sees 403. P0
- **ADM-H-03** · Switch-org UI for super admin. P1
- **ADM-H-04** · Impersonate user → audit logged. P0
- **ADM-N-01** · Impersonation by non-support → 401. P0 🟣
- **ADM-H-05** · Bulk user CSV import 100 rows. P1
- **ADM-H-06** · Org clone with selective tables. P1

## Backup / Restore
- **BAK-H-01** · Full backup round-trips on restore. P0
- **BAK-CONF-H-01** · Restore with name conflict prompts rename. P1
- **BAK-PITR-H-01** · Restore to T-30min works. P1
- **BAK-VERIFY-H-01** · Weekly restore-into-sandbox passes. P1
- **BAK-KMS-H-01** · KMS-encrypted backup decrypts. P1 🟣
- **BAK-HOLD-N-01** · Legally-held backup cannot be deleted. P1 🟣
- **BAK-SELECT-H-01** · Restore only dashboards leaves users intact. P1

## Plan / billing
- **ADM-PLAN-H-01** · Exceeding seat limit blocks user creation. P0
- **ADM-PLAN-N-01** · Downgrade plan with seats over new limit → warn first. P1

## GDPR
- **GDPR-EXP-H-01** · Data export request fulfilled within SLA (e.g. 7 days). P0 🟣
- **GDPR-DEL-H-01** · Right-to-erasure anonymises user; audit history preserved. P0 🟣
- **GDPR-DEL-N-01** · Erasure of last admin blocked. P1
- **GDPR-EXP-E-01** · Export bundle includes all user-owned objects. P1

## Multi-region
- **REG-N-01** · EU-pinned org user cannot create US datasource. P1

## Security
- **ADM-S-01** · Impersonation event logged with reason. P0 🟣
- **ADM-S-02** · Backup files encrypted at rest. P0 🟣
- **GDPR-S-01** · Erasure preserves audit integrity (only PII anonymised). P0 🟣

## Regression buckets
- Impersonation → ADM-H-04, ADM-N-01, ADM-S-01
- Backup pipeline → BAK-*
- GDPR flows → GDPR-*
