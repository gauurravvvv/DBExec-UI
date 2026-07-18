/**
 * Cross-filter & drill-down interaction models (spec §6).
 *
 * These describe the in-FE action bus that connects sibling visuals on
 * the same analysis: a click on one chart's data point emits a
 * CrossFilterEvent; the interaction service turns it into an
 * AppliedFilter that re-queries the other visuals. Drill-down maintains
 * an ordered DrillLevel stack (the "dimension stack") with a breadcrumb.
 */

/**
 * Emitted by a visual when the user clicks a data point AND that visual
 * has cross-filtering enabled. Carries enough to resolve a filter against
 * the clicked dimension.
 */
export interface CrossFilterEvent {
  /** Visual that originated the click (excluded when applying siblings). */
  sourceVisualId: string;
  /** Dataset column the clicked series/category maps to (the dimension). */
  columnName: string;
  /** The clicked category value (name of the bar / slice / axis tick). */
  value: string | number;
}

/**
 * Cross-filter target scope (Wave 6). Mirrors the dashboard viewer's
 * CrossFilterTargets so a single authored shape (config.interaction.
 * crossFilter.targets) drives BOTH the analyses editor and the published
 * dashboard. In the analyses editor 'dashboard' means "every other visual
 * on the analysis"; 'same-tab' restricts to the source's tab; {visualIds}
 * targets only the listed visuals.
 */
export type CrossFilterTargets =
  | 'same-tab'
  | 'dashboard'
  | { visualIds: string[] };

/**
 * Active SCOPED cross-filter (Wave 6). Unlike AppliedCrossFilter (which the
 * legacy global bus applied to every sibling), this carries the author's
 * target scope so only the resolved target visuals re-run. Single active
 * scoped filter at a time — last click wins, matching the dashboard.
 */
export interface ScopedCrossFilterState {
  /** Source visual that originated the click. */
  sourceVisualId: string;
  /** Source visual's owning tab (for 'same-tab' resolution). null = first tab. */
  sourceTabId: string | null;
  /** Dataset column the clicked category maps to. */
  columnName: string;
  /** The clicked category value. */
  value: string | number;
  /** Author-configured target scope off the source visual's config. */
  targets: CrossFilterTargets;
}

/**
 * A drill-to-detail request (Wave 6, §C). Carries the visual whose
 * underlying rows are wanted plus the exact scope (base cross-filter + drill
 * predicates + the clicked mark) so the raw-row query is filtered to what the
 * user clicked. The editor turns this into a runAnalysisQuery with NO
 * aggregation block (raw underlying rows) and shows them in a panel.
 */
export interface DrillToDetailRequest {
  /** Visual the detail rows belong to. */
  visualId: string;
  /** Human title for the detail panel header. */
  title: string;
  /** Run-query filters[] scoping the raw rows (category EQUALS predicates). */
  filters: any[];
}

/**
 * One resolved cross-filter currently constraining the analysis. Shaped
 * to slot straight into the run-query `filters[]` payload (category /
 * EQUALS single-value) that filterEngine.service consumes on the BE.
 */
export interface AppliedCrossFilter {
  sourceVisualId: string;
  columnName: string;
  value: string | number;
}

/**
 * One level of an active drill path. The stack is ordered outer→inner:
 * index 0 is the first descent, the last element is the current focus.
 * Ascending pops from the end.
 *
 * Each level records the descent that created it: the user was viewing
 * `parentColumn`, clicked `value`, and descended into `columnName`. That
 * makes the scoping predicate unambiguous — `parentColumn = value` — for
 * every level, including the first (whose parentColumn is the source
 * visual's top dimension).
 */
export interface DrillLevel {
  /** Dimension column drilled INTO at this level (the new focus). */
  columnName: string;
  /** The column the user was viewing when they clicked to descend. */
  parentColumn: string;
  /** Value clicked at `parentColumn` that scopes this level. */
  value: string | number;
  /** Human label for the breadcrumb chip. */
  label: string;
}

/** Snapshot of the interaction state for a single analysis. */
export interface AnalysisInteractionState {
  /** Active cross-filters keyed for quick replace-by-column semantics. */
  crossFilters: AppliedCrossFilter[];
  /** Ordered drill path (dimension stack). */
  drillPath: DrillLevel[];
}
