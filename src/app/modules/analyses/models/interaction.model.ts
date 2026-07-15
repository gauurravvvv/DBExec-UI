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
