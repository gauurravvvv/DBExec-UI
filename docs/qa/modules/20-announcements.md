# 20 · Announcements — Deep Test Cases

## Happy
- **ANN-H-01** · Admin posts announcement; next login banner appears. P0
- **ANN-H-02** · Multiple announcements queue, auto-rotate every 8s. P1
- **ANN-H-03** · Click banner → modal with full description. P1
- **ANN-H-04** · "Don't show again" + Dismiss → persists; refresh confirms. P0
- **ANN-H-05** · Admin updates content; users see new on next login. P1
- **ANN-H-06** · Soft-delete announcement → banner clears next login. P1
- **ANN-H-07** · Filter by status active/inactive; sort by createdOn. P2

## Negative
- **ANN-N-01** · Non-admin POST /announcement → 401. P0
- **ANN-N-02** · Title empty → required. P0
- **ANN-N-03** · Title > 255 → tooLong. P1
- **ANN-N-04** · Message empty → required. P0
- **ANN-N-05** · Message > 5000 → tooLong. P1
- **ANN-N-06** · type not in enum → reject. P1
- **ANN-N-07** · Dismissal of id from another org → 404. P0
- **ANN-N-08** · bgColor not valid hex → reject. P1
- **ANN-N-09** · XSS in title/message → rendered as text. P0 🟣

## Edge
- **ANN-E-01** · System Admin never sees banner (no org context). P0
- **ANN-E-02** · Announcement expired mid-session → still shown until next login (snapshot). P1
- **ANN-E-03** · Typewriter mid-message + rotation timer → restarts cleanly. P1
- **ANN-E-04** · Re-activate after dismiss → returns on next login. P1
- **ANN-E-05** · Emoji + RTL chars render correctly. P2
- **ANN-E-06** · Markdown not parsed (plain text policy). P2
- **ANN-E-07** · Long single-word wraps. P2
- **ANN-E-08** · Targeted to specific groups (when supported) only those users see. P1

## Regression buckets
- Banner display + typewriter → ANN-H-01..04, ANN-E-03
- XSS hardening → ANN-N-09
