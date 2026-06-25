# 03 · Users / Roles / Groups — Deep Test Cases

## Scope
- `/app/users` CRUD + bulk-add CSV
- `/app/roles` CRUD + permission grid
- `/app/groups` CRUD
- Group membership notifications
- Self-edit restriction

## Fixtures
- `master_admin`, `eve_user`, `reader_user`
- Groups `Sales`, `Engineering`
- Role `DataAnalyst`

## Users

### Happy
- **USR-H-01** · Add user → welcome email → setup link → sign-in works. P0
- **USR-H-02** · Edit firstName + groupIds; persisted. P1
- **USR-H-03** · Soft-delete user; cannot log in. P0
- **USR-H-04** · Bulk-add 5 valid users via CSV. P1
- **USR-H-05** · Bulk-add 2 valid + 2 invalid rows; outcome reported per row. P1
- **USR-H-06** · Unlock locked user; sign in. P0
- **USR-H-07** · Filter list by status active/inactive/locked. P1
- **USR-H-08** · Sort by username / createdOn / lastLogin. P2
- **USR-H-09** · Pagination preserves sort. P2
- **USR-H-10** · View read-only details with role + groups. P1

### Negative
- **USR-N-01** · Username < 6 chars. P0
- **USR-N-02** · Username > 30 chars. P0
- **USR-N-03** · Username starts with digit (pattern violation). P0
- **USR-N-04** · Username contains spaces. P0
- **USR-N-05** · Username SQL injection — stored safely or rejected. P0 🟣
- **USR-N-06** · Email malformed. P0
- **USR-N-07** · Email > 254 chars. P1
- **USR-N-08** · Email Unicode TLD (policy decision: allow/reject + document). P2
- **USR-N-09** · First name with digits. P1
- **USR-N-10** · First name 1 char. P1
- **USR-N-11** · Last name with special chars beyond `'-`. P1
- **USR-N-12** · Duplicate username in same org. P0
- **USR-N-13** · Duplicate email in same org. P0
- **USR-N-14** · Delete bootstrap admin (`isDefault=true`) → reject. P0
- **USR-N-15** · User without `userManagement` opens `/app/users/new` → bounce. P0
- **USR-N-16** · Edit own row from grid → reject "use Profile". P1
- **USR-N-17** · Update with role from another org → 404. P0
- **USR-N-18** · Update with group from another org → 404. P0
- **USR-N-19** · Bulk-delete with empty ids → 400. P1
- **USR-N-20** · XSS in firstName → escaped on render. P0 🟣

### Edge
- **USR-E-01** · Update without changing username — `Not(id)` dup-check passes. P1
- **USR-E-02** · Unicode in firstName (José, 山田) → accepted + rendered. P1
- **USR-E-03** · Soft-delete then re-create same username → independent user; audit history preserved. P1
- **USR-E-04** · CSV with BOM parsed. P2
- **USR-E-05** · CSV with quoted commas parsed. P2
- **USR-E-06** · CSV CRLF line endings parsed. P2
- **USR-E-07** · Concurrent edit from two tabs → last-write-wins OR stale-row prompt (document policy). P1
- **USR-E-08** · User in 50 groups → list renders without overflow. P2
- **USR-E-09** · Net-zero edit (add + remove same user) → no spurious notifications. P1
- **USR-E-10** · lastLogin shown in viewer's locale. P2

## Roles

### Happy
- **ROL-H-01** · Create role with at least one granted permission. P0
- **ROL-H-02** · Edit role grid; on next login, assigned users see updated sidebar. P0
- **ROL-H-03** · Soft-delete role; assigned users fall back to no-permission state. P1
- **ROL-H-04** · Duplicate role from existing. P2
- **ROL-H-05** · Filter active/inactive; sort by name. P2

### Negative
- **ROL-N-01** · Role name pattern violation. P0
- **ROL-N-02** · Save with all NONE → reject. P0
- **ROL-N-03** · Delete bootstrap `Administrator` role → reject. P0
- **ROL-N-04** · Role name collides case-insensitive → reject. P0
- **ROL-N-05** · User without `roleManagement` opens grid → bounce. P0
- **ROL-N-06** · Grant WRITE on child while parent NONE → auto-promote or reject (document). P1
- **ROL-N-07** · Permission id from another org → 404. P0

### Edge
- **ROL-E-01** · New permission added server-side → editing old role shows it with NONE default. P1
- **ROL-E-02** · Role with 100+ permissions → grid renders without lag. P1
- **ROL-E-03** · Renaming a role does not change assigned users' permission tree. P1

## Groups

### Happy
- **GRP-H-01** · Create group; appears in user-edit dropdown. P0
- **GRP-H-02** · Remove user → `group_removed` notification. P1
- **GRP-H-03** · Add user → `group_added` notification. P1
- **GRP-H-04** · Filter / sort. P2
- **GRP-H-05** · Edit description; persisted. P2

### Negative
- **GRP-N-01** · Name pattern violation. P0
- **GRP-N-02** · Case-insensitive name collision → 409. P0
- **GRP-N-03** · User id from another org → 404. P0
- **GRP-N-04** · Delete group with active access grants → reject "in use". P0

### Edge
- **GRP-E-01** · Net-zero edit no notification. P1
- **GRP-E-02** · Soft-deleted user still resolves for ACL. P1
- **GRP-E-03** · Group with 1000 members → paginated. P2
- **GRP-E-04** · Empty group (0 users) → legal. P2

## Security / a11y / perf

- **USR-S-01** · Cross-org probe with crafted UUID → 404. P0 🟣
- **USR-S-02** · API token with `users:read` can only list, not write. P0
- **USR-A-01** · User table announces role of column headers. P1 ♿
- **USR-P-01** · Page render with 10k users → < 2s with virtualisation. P1 ⚡

## Regression buckets
- User schema or Zod validators changed → USR-N-01..20
- Permission tree changed → ROL-E-01, USR-H-01..03
- Group membership flow → GRP-H-02..03, GRP-E-01
