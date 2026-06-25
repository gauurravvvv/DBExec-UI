# 17 · Notifications — Deep Test Cases

## Fixtures
- User `alice@…` with default prefs
- User `bob@…` with DND 22:00-07:00
- Web Push subscription registered for `alice`

## Happy
- **NOT-H-01** · `group_added` notification appears on bell. P0
- **NOT-H-02** · `group_removed` notification. P1
- **NOT-H-03** · `mention` notification on @mention in comment. P1
- **NOT-H-04** · `subscription_delivered` summary notification. P1
- **NOT-H-05** · `alert_fired` notification. P1
- **NOT-H-06** · Mark all read resets badge. P0
- **NOT-H-07** · Mark single as unread. P2
- **NOT-H-08** · SSE stream pushes new notification within 5s. P1

## Negative
- **NOT-N-01** · User cannot read another user's notification. P0 🟣
- **NOT-N-02** · Notification for cross-org event → not delivered. P0 🟣

## Edge
- **NOT-E-01** · 5 same-category events within 5 min → bundle to 1. P1
- **NOT-E-02** · DND window queues, delivers after. P1
- **NOT-E-03** · Daily digest summarises unread. P1
- **NOT-E-04** · SSE reconnects after network blip. P1
- **NOT-E-05** · Web Push delivered for subscribed user. P1

## Performance
- **NOT-P-01** · 1000 simultaneous SSE clients sustained. P1 ⚡

## Regression buckets
- Delivery channels (in-app, email, push, slack) → NOT-H-*, NOT-E-05
- DND + bundling → NOT-E-01..03
