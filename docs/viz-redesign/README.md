# Visualization Redesign — docs

Gap analysis + redesign plan for the DBExec visualization tool (Analyses /
Dashboards "visual box"), produced 2026-07-17 from a code audit + market-standard
research (Tableau, Power BI, Metabase, Superset, Looker, Mode, Hex, Sigma, Preset,
Observable Plot).

**Bottom line:** DBExec already ships **24 chart types** — coverage isn't the
problem. The weak points are the **config-panel UX**, the **chart card chrome /
ECharts theme**, and the **interaction model**. Diagnosis + plan only; no code
changed yet.

## Files

- **[GAP-ANALYSIS.md](GAP-ANALYSIS.md)** — the main deliverable. Four focus
  areas (config panel, chart card chrome, chart types & features, interaction),
  each with: what we have today · market must-have checklist ([table-stakes] vs
  [nice-to-have]) · honest gap table (have / partial / missing + P0/P1/P2) ·
  stack-specific (Angular 18 + PrimeNG 19 + ECharts) redesign recommendations.
- **[visual-box-mockup.html](visual-box-mockup.html)** — an interactive HTML
  mockup: before/after of the config panel + chart card, gap tables with status
  pills, and the ship order. Published as an Artifact.
- **APPENDIX-market-research.md** — the raw per-area market research (evidence).
- **APPENDIX-code-audit.md** — the raw current-state code inventory (evidence).

## Ship order (from the plan)

1. **Presentation** (lowest risk, answers "below standard"): config accordion +
   sticky header + search · registered DBExec ECharts theme · kebab header ·
   framed empty/error/loading states.
2. **Structure**: Data/Format tabs + re-query flag · clickable field pills ·
   unified cross-filter + active-state chrome.
3. **Parity**: format live preview · palette swatches · per-column table config ·
   reference lines · consistent number formatting · reset-to-default.
4. **Polish**: raw ECharts JSON escape hatch · map charts · Show-Me picker ·
   tooltip sync · typed config schema (undo/redo, copy-config).

No implementation until sign-off on this plan.
