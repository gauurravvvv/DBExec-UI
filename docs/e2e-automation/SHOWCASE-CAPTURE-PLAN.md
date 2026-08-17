# DBExec — Showcase Data + Screenshot/PPT/Landing Capture Plan

> **Purpose (different from `PLAN.md`).** `PLAN.md` is an E2E *correctness*
> script (prove the app works). **This** doc is a **marketing-showcase capture
> pipeline**: populate a real org with **high-volume, relatable, real-world
> data across every module**, capture **polished screenshots + a short screen
> recording**, and assemble them into an **HTML slide deck (PPT)** and the
> **landing page**. It reuses `PLAN.md`'s technical machinery (readiness polls,
> the schema-isolation constraint, the `app-custom-*` selector cookbook, the
> Monaco/control drivers, the evidence plan) — read `PLAN.md` §1–§5 for those
> and don't re-derive them here.
>
> **Status: PLAN ONLY.** Nothing is executed until the user provides the org
> DB details (§1) and gives explicit go-ahead (this creates real, high-volume
> data — see §8 Risks).

---

## 0. The mental model you MUST get right first

DBExec is **DB-per-org** with a hard split between two kinds of data. Confusing
them is the #1 way this goes wrong.

| Layer | What it is | How data gets in | Volume target |
|---|---|---|---|
| **A. Source warehouse** | The org's *business* data users analyse (orders, patients, tickets…). Lives in a **dedicated schema** on the Postgres the datasource points at. | **Raw SQL** (`generate_series` bulk insert). This is the ONLY table-level insert step. | **HIGH** — 100k–1M+ rows across a star schema |
| **B. Org app DB** | The org's DBExec *config/content*: users, groups, roles, datasources, connections, datasets, calculated fields, saved queries, analyses, visuals, dashboards, alerts, RLS rules, announcements, theme/branding. | **By USING the app** (UI or API). You do NOT raw-insert these — they're app-generated config keyed to internal ids; hand-inserting them produces broken/unrenderable rows. | Enough per module to look real (see §4 per-module targets) |

**Consequence for "insert data into all tables one by one":** it splits into
(1) one big raw-SQL warehouse seed (§3), then (2) a **guided app-drive** that
*creates* the app-DB content module by module (§4) — because a dashboard/
analysis/dataset only means something when built through the app against the
warehouse. A few app-DB tables (users, groups, announcements) *can* be API/SQL
seeded for volume; the rest must be app-built. §4 says which is which.

---

## 1. Inputs the user must provide (blockers)

Before anything runs, collect and record these (fill the table, keep it out of git):

| Input | Why | Example |
|---|---|---|
| **Org name + admin login** | to log into the web UI | `AcmeRetail` / `administrator` / `Pass@1234` |
| **Warehouse Postgres DSN** | where the source data + datasource point | `host / port / db / user / password` |
| **Warehouse schema name** | isolated schema for showcase data | `retail_demo` (NOT `public`, NOT the org's app schema) |
| **App DB details** (if different) | only if app master/org DB ≠ warehouse server | usually the same server |
| **Domain choice** | drives the whole story (see §2) | Retail / SaaS / Logistics / Fintech / Healthcare |
| **Capture target** | resolution + light/dark | 1920×1080, light (landing) + a dark set |

> **Schema-isolation constraint (from `PLAN.md` §0):** the showcase schema must
> NOT be `public` (app master tables) or the org's app schema (e.g. `dbexec`).
> Use a dedicated schema so cleanup is one `DROP SCHEMA <name> CASCADE`.

---

## 2. Pick ONE domain and commit to a narrative

Screenshots sell a *story*, not features. Choose a domain the target audience
relates to, then every dataset/analysis/dashboard tells one coherent story.

**Recommended default: Retail / E-commerce** — universally relatable, rich
star schema, obvious KPIs (revenue, AOV, top products, region maps, cohort
retention), and time-series that look great in charts.

Star schema (the shape §3 builds):

```
dim_customer (100k)  ─┐
dim_product  (5k)    ─┤
dim_store    (200)   ─┼─<  fact_order (1M)  >─  fact_order_item (3–4M)
dim_date     (5y)    ─┤
dim_channel  (6)     ─┘
                         + fact_inventory_daily (store×product×date, sampled)
                         + fact_web_session (2M) for funnel/marketing story
```

Alternatives if the audience is vertical-specific: **SaaS** (accounts, users,
subscriptions, MRR, churn, usage events), **Logistics** (shipments, routes,
carriers, SLA), **Fintech** (accounts, transactions, fraud flags). The existing
`sample-clinical-data.sql` is the **Healthcare** option, ready to reuse/scale.

---

## 3. Step A — Seed the source warehouse (raw SQL, high volume)

Deliverable: **`showcase-<domain>-data.sql`** (new file next to
`sample-clinical-data.sql`). Build it like the clinical SQL but at showcase
scale, using `generate_series` + `random()` so it's fast and self-contained.

**Rules for realistic-looking volume:**
- **Referential integrity**: FKs valid (order → real customer/store/product).
- **Skew, not uniform**: Pareto the products (top 20% = 80% of sales), weight
  channels, make a few stores dominate — flat/uniform data looks fake in charts.
- **Time trend**: 3–5 years with weekly seasonality + an upward trend + a
  couple of promo spikes → time-series and YoY visuals look alive.
- **Real vocabulary**: product names, categories, city/region names, plausible
  price bands, statuses (`paid/shipped/returned/cancelled`). No `Lorem`, no
  `item_1`. Curate ~200 product names + categories; random-pick from lists.
- **Geo**: real city + lat/lon (a small curated list) so the map visual plots.
- **A dedicated ANALYTICS VIEW** (like clinical's `encounter_analytics`) that
  pre-joins the star into one wide, friendly table — the dataset can point at
  the view for the simplest "wow" screenshots.
- **Volume knobs at the top** of the file (`\set customers 100000` etc.) so you
  can dial down for a laptop or up for a beefy box. Insert in batches; add
  indexes AFTER bulk insert (faster). `ANALYZE` at the end.

Run it against the warehouse DSN (§1). Verify row counts + that the view
returns rows. This is the only non-UI data step.

---

## 4. Step B — Populate every app module (module-by-module capture order)

Walk the app in an order where each module's screenshot builds on the last, so
the whole run doubles as the demo narrative. For each: **what to create**, **how
(UI vs API/SQL)**, **volume**, **the screenshot(s) to grab**.

> Drive the UI with the `PLAN.md` §2 selector cookbook + §5 control/Monaco
> drivers. Where "API/SQL" is noted, a bulk seed is fine for volume and won't
> look broken (these tables aren't render-config).

1. **Login / theme / branding** — apply a showcase Theme preset (one of the
   seeded ones or a brand-matched custom) + a Branding watermark; capture the
   themed **login** page (pre-auth `/theme/public` paints it). *Shot: login.*
2. **Datasource** — create one pointing at the warehouse DSN/schema. *Shot:
   datasource list + the connected-successfully state.*
3. **DB Access Management** — create a couple of live Postgres roles/users +
   grants (Studio pillar). *Shot: roles/privileges composer.*
4. **Query Executor (Studio)** — open a connection, run 2–3 real queries
   (a top-N, an aggregate, a join) against the warehouse; show IntelliSense +
   the result grid + EXPLAIN. *Shots: editor with results, autocomplete open.*
5. **Saved Queries** — save those queries (owner-private). *Shot: saved-query
   list + reopen.*
6. **Datasets** — create 2–3 datasets on the warehouse (one on the wide view,
   one multi-table join). Add **calculated fields** (both engines) + typed
   fields + a parameter. *Shots: dataset SQL editor, field list, calc-field
   dialog.*
7. **Query Builder** — build one visual (no-SQL) query on the star schema
   (joins + columns + filters). *Shots: QB design (form/joins/columns), compose,
   SQL preview.*
8. **Users / Groups / Roles** — seed **volume** (e.g. 40–60 users across 6–8
   groups, 4–5 roles) — **API/SQL OK** for the bulk; create a couple via UI for
   the "add user" shot. *Shots: user list (full), group list, role composer.*
9. **RLS rules** — add a row rule + a column mask on a dataset (e.g. store
   managers see only their region). *Shot: RLS rule editor + a masked result.*
10. **Analyses (BI)** — build **one flagship maximal analysis** (the money
    shot): 5–6 tabs, ~18–22 visuals across families (bar/line/area/pie/KPI/
    table/pivot/geo), Top-N, time-intelligence, reference line, cross-filter,
    drill. Save + reload-verify. Reuse `PLAN.md` §3 Step 6 verbatim. *Shots:
    each tab, plus close-ups of the best 4–5 visuals.*
11. **Visuals / conditional formatting** — show a configurable chart with
    conditional formatting + a KPI big-number row. *Shot: formatted chart.*
12. **Dashboards** — assemble a dashboard from the analysis widgets: scoped
    filters, cross-filter, a couple of KPI tiles, then **publish a snapshot** +
    grab a **public/embed share link**. *Shots: dashboard (light + dark),
    the embed/public view.*
13. **Dashboard subscriptions** — schedule a delivery (the new email!). *Shot:
    subscription config + the delivered email (render via the email harness).*
14. **Alerts** — create a threshold alert on a dataset (e.g. revenue drop). Let
    it fire (or simulate). *Shots: alert config, fired notification (bell/SSE),
    the alert email.*
15. **Announcements** — post an org-wide announcement (now group-less). *Shot:
    the banner across the top of the app.*
16. **Notifications / sharing** — share an asset with a group; show the SSE
    bell + notifications page. *Shot: notification panel.*
17. **Audit logs / login activity** — after all the above, the audit log is
    naturally full. *Shots: audit log list with real entries, login activity.*
18. **Settings hubs** — App Settings (theme/branding/announcement tabs) +
    System Settings (SSO/email/security/AI). *Shots: both hubs.*
19. **Home** — the landing dashboard/home with the announcement banner + tiles.
    *Shot: the "first thing a user sees" hero.*

**App-DB volume seeding (API/SQL) for a fuller look:** users, groups, roles,
saved queries, announcements, audit rows can be bulk-seeded so lists aren't
sparse. Datasets/analyses/dashboards/visuals/alerts/RLS are **app-built** (their
JSON config is generated by the app; hand-inserting = broken renders).

---

## 5. Step C — Screenshot capture standards (so they look pro)

Drive with Playwright (the `PLAN.md` §5 harness). Standards:

- **Viewport 1920×1080**, `deviceScaleFactor: 2` (retina-crisp for slides).
- **Two theme passes**: light (default, for the landing page) + a dark pass for
  variety in the deck. Toggle via the theme preset / `emulateMedia` for emails.
- **Seed determinism**: the SQL uses `random()` — after seeding, the data is
  fixed, so screenshots are stable across reruns. (Don't re-seed between shots.)
- **Wait for data, not time**: assert a row/canvas is present before shooting
  (never `sleep`); charts need a `waitForFunction` on the ECharts canvas.
- **Naming**: `NN-module-state[-theme].png` (e.g. `10-analysis-tab3-dark.png`)
  in a `showcase/` output dir, zero-padded so slide order = file order.
- **Chrome-clean**: hide the cursor, dismiss transient toasts, ensure no
  half-loaded skeletons. Grab full-page for lists, element-clip for hero shots.
- **A shot manifest** (`shots.json`): `{file, title, caption, module}` — feeds
  both the PPT and the landing page automatically (see §6).

---

## 6. Step D — Assemble the HTML PPT + fold into the landing page

**HTML slide deck (PPT):** produce a single-file 1920×1080 fixed-canvas deck in
the DBExec house style (blue/orange, Inter, gradient "Exec" wordmark) — the
`client-deck` skill produces exactly this. One slide per milestone:
`title → screenshot → 1-line caption of the value`. Drive it from `shots.json`
so adding a screenshot = a new slide. Sections mirror the four pillars
(Studio / Data Management / BI / Reporting) + Admin.

**Landing page:** the landing pages already exist (`dbexec.html` /
`dbexec-v2.html` + `landing-page-context.md`). Fold the best 6–10 shots into the
existing feature sections — a "See it in action" gallery / per-pillar feature
rows with the real screenshot beside each claim. Keep the existing design
language; swap placeholder/mock imagery for the captured shots. Use the
light-theme set for the landing page.

**Deliverables:** `showcase/` screenshots + `shots.json`, `showcase-deck.html`
(the PPT), and an updated landing page referencing the chosen shots.

---

## 7. Step E — Short screen-recorded video (later)

After the static assets land, record a ~60–90s walkthrough of the *actual*
tool (not slides):

- **Script it from §4** — a linear path: login → run a query → open the
  flagship dashboard → cross-filter/drill → show an alert firing → done. The
  same narrative the deck tells, now live.
- **Capture**: Playwright can record video (`recordVideo` context option) for a
  deterministic, cursor-clean run; or a manual QuickTime/Loom pass for natural
  pacing + voiceover. Playwright first for a clean base, then optionally a human
  voiceover pass.
- **1080p, trimmed, no dead air.** Export MP4; embed a poster-framed `<video>`
  in the landing page hero and link it from the deck's first slide.

---

## 8. Risks & the destructive-operation callout

- **Creates real, high-volume data** in the user's warehouse + org app DB. Get
  explicit go-ahead. Record what was created for cleanup.
- **Cleanup**: warehouse = one `DROP SCHEMA <name> CASCADE`. App-DB content
  (datasets/dashboards/etc.) is deletable via the app or left as a permanent
  demo org — decide up front whether this is a throwaway or a keeper demo org.
- **Never** run with `DB_SYNC=true` / `DB_CLEAR=true` on the BE (mutates the app
  DB). Never point the warehouse seed at `public` or the org app schema.
- **Volume vs machine**: 1M+ rows is fine on a decent box; dial the §3 knobs
  down for a laptop. Seed once; screenshots are stable afterward.
- **Secrets**: the DSN/password live only in a local, git-ignored inputs file.

---

## 9. Execution order (the one-page runbook)

1. **User provides** §1 inputs + picks §2 domain + gives go-ahead.
2. Bring the stack up (`PLAN.md` §1 readiness polls). Confirm warehouse reachable.
3. **Write + run** `showcase-<domain>-data.sql` (§3). Verify counts + view.
4. **Bulk-seed** app-DB volume tables (users/groups/roles/announcements) via API/SQL (§4).
5. **App-drive** module by module (§4 order), **capturing as you go** (§5), writing `shots.json`.
6. Build the **flagship analysis + dashboard**, publish snapshot + embed link.
7. Generate the **HTML deck** from `shots.json` (§6, `client-deck` skill).
8. **Fold** the best shots into the **landing page** (§6).
9. (Later) record + embed the **video** (§7).
10. Decide keep-vs-cleanup (§8).

---

## Reuse map (don't reinvent)

| Need | Reuse from |
|---|---|
| Readiness polls, stack bring-up, schema-isolation constraint | `PLAN.md` §0–§1 |
| `app-custom-*` selector cookbook + control/Monaco drivers | `PLAN.md` §2, §5 |
| Maximal-analysis build script (the flagship BI shot) | `PLAN.md` §3 Step 6 |
| A ready healthcare warehouse (if Healthcare chosen) | `sample-clinical-data.sql` |
| House-style HTML deck | `client-deck` skill |
| Existing landing pages to fold shots into | `dbexec.html`, `dbexec-v2.html`, `landing-page-context.md` |
| Email screenshots (subscription/alert/welcome) in light+dark | the email render harness (this session) |
