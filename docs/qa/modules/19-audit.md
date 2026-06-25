# 19 · Audit Logs & Login Activity — Deep Test Cases

## Audit Logs

### Happy
- **AUD-H-01** · List renders recent CUD rows. P0
- **AUD-H-02** · Filter by module=USER. P1
- **AUD-H-03** · Filter by action=DELETE. P1
- **AUD-H-04** · Date-range filter. P1
- **AUD-H-05** · Search by entityId or userId. P1
- **AUD-H-06** · Export PDF non-zero. P0
- **AUD-H-07** · Sort timestamp asc/desc. P2
- **AUD-H-08** · Pagination preserves filters. P2

### Negative
- **AUD-N-01** · User without `auditLogs` → 401. P0
- **AUD-N-02** · Malformed date → 400. P1
- **AUD-N-03** · Module not in enum → 400. P1
- **AUD-N-04** · Export > 10K rows hits cap with warning. P1
- **AUD-N-05** · Cross-org via crafted orgId → 401 (JWT source of truth). P0 🟣

### Edge
- **AUD-E-01** · Large metadata truncated with `_truncated: true`. P1
- **AUD-E-02** · Bulk action emits ONE row with array entityIds. P1
- **AUD-E-03** · Soft-deleted user's audit rows still show stored name. P1
- **AUD-E-04** · Times displayed in viewer's locale. P2
- **AUD-E-05** · Hash chain verifies; tampering breaks. P1 🟣
- **AUD-E-06** · Filter by soft-deleted user → still finds rows. P2
- **AUD-E-07** · Retention policy hides aged rows. P2

## Login Activity

### Happy
- **LGN-H-01** · Successful + failed attempts logged with reason. P0
- **LGN-H-02** · IP + UA captured. P0
- **LGN-H-03** · Export PDF. P0
- **LGN-H-04** · Filter by status. P1

### Negative
- **LGN-N-01** · Failure reason recorded server-side; not echoed to user. P0 🟣
- **LGN-N-02** · Unknown-username attempts also generate log rows. P0 🟣
- **LGN-N-03** · User without `loginActivity` → 401. P0

## Performance
- **AUD-P-01** · 1M audit rows page-1 renders < 1s with index. P1 ⚡

## Regression buckets
- Audit emission per module → AUD-H-01..03 across modules
- Hash chain integrity → AUD-E-05
