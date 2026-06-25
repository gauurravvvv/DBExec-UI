# 06 · Access Manager — Deep Test Cases

## Scope
- POST `/access/grant` { datasource, connection, users, groups }
- GET `/access/details/:connectionId`

## Fixtures
- Datasource + 2 connections
- Group `Sales` with 3 members
- Group `Engineering` with 2 members

## Happy
- **ACC-H-01** · Grant connection to 2 users + 1 group; details panel reflects all. P0
- **ACC-H-02** · Re-grant with `users=[]` and `groups=[]` → revokes everything. P0
- **ACC-H-03** · Grant only `users`; existing group grants preserved. P0
- **ACC-H-04** · Grant only `groups`; existing user grants preserved. P0
- **ACC-H-05** · Grantees can run datasets via connection; non-grantees get 403. P0
- **ACC-H-06** · `details` endpoint lists grants by display name. P1

## Negative
- **ACC-N-01** · Datasource id from another org → 404. P0
- **ACC-N-02** · Connection not under named datasource → 404. P0
- **ACC-N-03** · `users` empty string → `subject.invalid`. P0
- **ACC-N-04** · `users` non-UUID string → reject. P0
- **ACC-N-05** · `groups` element is a user id (wrong type) → 404. P1
- **ACC-N-06** · Caller without `accessManagement` → 401. P0
- **ACC-N-07** · Datasource present, connection deleted → 404. P0

## Edge
- **ACC-E-01** · Same user listed twice in `users` → dedup. P1
- **ACC-E-02** · User in `users` AND a granted group → access granted, no duplicate rows. P1
- **ACC-E-03** · Soft-deleted user in array → accepted; user can't log in anyway. P1
- **ACC-E-04** · Granted group with 0 members → legal; nothing happens until members added. P2
- **ACC-E-05** · Add user to granted group AFTER grant → access automatically. P1
- **ACC-E-06** · Remove user from group with access → access ends immediately OR next login (document). P1
- **ACC-E-07** · Datasource deleted → grants cascade-deleted. P1

## Security
- **ACC-S-01** · Cross-org access grant attempted via crafted UUIDs → 404. P0 🟣
- **ACC-S-02** · Audit log row per grant + revoke. P0
- **ACC-S-03** · Grant with stale connection (deleted in race) → atomic reject. P1

## Performance
- **ACC-P-01** · Grant to group with 5000 members completes < 3s. P1 ⚡

## Regression buckets
- Cascade behaviour → ACC-E-05..07
- Validation envelope → ACC-N-03..05
