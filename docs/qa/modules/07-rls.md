# 07 · RLS + Column Security — Deep Test Cases

## Fixtures
- Dataset `chart_demo`
- Users `alice@apac.com`, `bob@emea.com`
- Group `Sales` (alice + bob)
- User attribute `region` (alice=`APAC`, bob=`EMEA`)

## RLS Rules — happy
- **RLS-H-01** · region=APAC for user alice (op EQUALS) → alice sees only APAC rows; bob sees all. P0
- **RLS-H-02** · Group rule with IN [A,B] → members see A or B only. P0
- **RLS-H-03** · Operator NOT_IN → inverse. P1
- **RLS-H-04** · Operator BETWEEN [10,20] on numeric col. P1
- **RLS-H-05** · Disable rule → affected users see all rows immediately. P0
- **RLS-H-06** · Re-enable rule. P1
- **RLS-H-07** · Delete rule → predicate removed. P0
- **RLS-H-08** · Multiple rules same dataset same user → AND (intersection). P0
- **RLS-H-09** · User rule + group rule both apply (intersection). P0

## RLS Rules — negative
- **RLS-N-01** · Dataset id from another org → 404. P0
- **RLS-N-02** · Scope user id from another org → 404 "user not found". P0
- **RLS-N-03** · Scope group id from another org → 404 "group not found". P0
- **RLS-N-04** · BETWEEN length != 2 → reject. P0
- **RLS-N-05** · EQUALS values length > 1 → reject. P0
- **RLS-N-06** · Operator not in enum → reject. P0
- **RLS-N-07** · Scope not in {user, group} → reject. P0
- **RLS-N-08** · Empty values → reject `atLeastOne`. P0
- **RLS-N-09** · Column not in dataset → save accepted but preview errors. P1
- **RLS-N-10** · Name > 100 → tooLong. P1
- **RLS-N-11** · Name pattern violation. P1
- **RLS-N-12** · User without `rlsManagement` → bounce. P0
- **RLS-N-13** · SQL injection in values → parameterised; safe. P0 🟣

## RLS Rules — edge
- **RLS-E-01** · PATCH change scope user→group + scopeId in one body → validated. P1
- **RLS-E-02** · PATCH only scopeId (same scope type) → merges with stored. P1
- **RLS-E-03** · Rule against calc field → applied at right SQL stage. P1
- **RLS-E-04** · Values change type post-dataset-rebuild (string → number) → coerce or reject. P1
- **RLS-E-05** · Rule on soft-deleted dataset → preserved; preview errors. P2
- **RLS-E-06** · Disabled rule no audit emit on every preview. P2
- **RLS-E-07** · 1000+ values → SQL IN chunked or size-guarded. P1 ⚡
- **RLS-E-08** · BETWEEN on timestamptz → UTC interpretation. P1

## Column Security — happy
- **COL-H-01** · Non-admin sees masked SSN; admin sees raw. P0
- **COL-H-02** · `{{user.region}}` substitutes attr value. P0
- **COL-H-03** · PII auto-tag on SSN-shaped column after sample scan. P1

## Column Security — negative
- **COL-N-01** · Mask pattern with unknown placeholder → reject on save. P1
- **COL-N-02** · User without column access tries to filter by it → control disabled. P0

## Column Security — edge
- **COL-E-01** · User + group rule on same column → strictest wins (intersection). P1
- **COL-E-02** · Empty stored value → mask applied to empty string returns empty. P2

## Security
- **RLS-S-01** · User without rule sees their default → if `deny_by_default=true`, returns 0 rows. P0 🟣
- **RLS-S-02** · Test-as-user requires elevated permission. P0
- **RLS-S-03** · Effective-permissions endpoint scoped to org. P0 🟣

## Performance
- **RLS-P-01** · Compile + run with 50 active rules → p95 < 500ms overhead. P1 ⚡

## Regression buckets
- Compiler → RLS-H-01..09, RLS-E-01..04
- Column security → COL-H-01..03, COL-N-01..02
