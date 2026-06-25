# 15 · Subscriptions / Alerts / Schedules — Deep Test Cases

## Fixtures
- SMTP transport mock (`maildev` running on localhost:1080).
- Slack webhook test URL (mocked).
- Dashboard `Sales Snapshot` for subscription tests.
- Dataset with a numeric metric for alert tests.

## Subscriptions — happy
- **SUB-H-01** · Daily 9am subscription delivers PDF to recipients. P0
- **SUB-H-02** · Weekly delivery on Monday 09:00 local. P1
- **SUB-H-03** · Per-format: PDF, PNG, XLSX. P0
- **SUB-H-04** · Filter state baked into delivery snapshot. P0
- **SUB-H-05** · Multi-channel fan-out (email + Slack + webhook). P1
- **SUB-H-06** · Recipient distribution list. P1

## Subscriptions — negative
- **SUB-N-01** · Empty recipients → reject. P0
- **SUB-N-02** · Cron invalid → reject. P0
- **SUB-N-03** · User without `subscriptions` perm → 401. P0
- **SUB-N-04** · Slack webhook URL invalid format → reject. P1

## Subscriptions — edge
- **SUB-E-01** · DST transition → cron re-evaluated correctly. P1
- **SUB-E-02** · Worker down during scheduled run → backfill on restart. P1
- **SUB-E-03** · Failed delivery retries 3× then DLQ. P0
- **SUB-E-04** · Snooze pauses next run. P1
- **SUB-E-05** · Recipient list updated mid-cron-cycle. P2
- **SUB-E-06** · Webhook HMAC signature verifiable. P1

## Alerts — happy
- **AL-H-01** · Alert fires when threshold crossed. P0
- **AL-H-02** · Consecutive-breach guard fires only after N samples. P1
- **AL-H-03** · Snooze suppresses next firing. P1
- **AL-H-04** · Acknowledge resets state. P1
- **AL-H-05** · Severity routing (critical → PagerDuty). P1

## Alerts — negative
- **AL-N-01** · Expression with side-effecting fn rejected by AST eval. P0 🟣
- **AL-N-02** · Cooldown prevents repeated firing within window. P0
- **AL-N-03** · Alert on cross-org dataset → 404. P0

## Alerts — edge
- **AL-E-01** · Dataset returns 0 rows → alert doesn't fire (unless `count=0` is the condition). P1
- **AL-E-02** · Channel = Slack; recipients = distribution list. P1
- **AL-E-03** · Quiet hours per recipient suppress delivery. P1
- **AL-E-04** · Multiple alerts on same dataset evaluated independently. P1

## Security
- **SUB-S-01** · Webhook HMAC required + verified. P0 🟣
- **SUB-S-02** · Recipient must be in same org. P0 🟣
- **AL-S-01** · Expression sandbox prevents arbitrary JS. P0 🟣

## Performance
- **SCH-P-01** · 1000 subscriptions run in < 60s with 5 workers. P1 ⚡

## Regression buckets
- Scheduler (BullMQ) → SUB-E-01..03, AL-H-01..02
- Email transport → SUB-H-01..06
- Webhook + HMAC → SUB-S-01, AL-H-01
