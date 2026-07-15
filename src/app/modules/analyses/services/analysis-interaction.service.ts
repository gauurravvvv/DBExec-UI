import { Injectable, signal } from '@angular/core';
import type {
  AppliedCrossFilter,
  CrossFilterEvent,
  DrillLevel,
} from '../models/interaction.model';

/**
 * AnalysisInteractionService — the in-FE action bus (spec §6) that wires
 * sibling visuals on a single analysis together.
 *
 * The analysis view owns one instance (provided at the view component, so
 * each open editor gets its own clean state). Visuals forward their
 * echart-visual / table-visual `chartSelect` clicks in; the service turns
 * a click into either:
 *   - a cross-filter (a category=value predicate applied to the OTHER
 *     visuals), when the source visual opted into cross-filtering, or
 *   - a drill descent (push the next dimension onto the drill path), when
 *     the source visual declares a drillDimensions stack.
 *
 * State is exposed as signals so the view can react without an extra
 * store slice — this is ephemeral, per-session interaction state, not
 * something we persist. Consumers read `crossFilters()` / `drillPath()`
 * and re-run the analysis query with the derived run-query filters.
 */
@Injectable()
export class AnalysisInteractionService {
  /** Active cross-filters (one per source visual, replace-on-repeat). */
  private _crossFilters = signal<AppliedCrossFilter[]>([]);
  /** Ordered drill path (dimension stack). */
  private _drillPath = signal<DrillLevel[]>([]);

  readonly crossFilters = this._crossFilters.asReadonly();
  readonly drillPath = this._drillPath.asReadonly();

  /** True when any interaction is currently constraining the analysis. */
  hasActiveInteractions(): boolean {
    return this._crossFilters().length > 0 || this._drillPath().length > 0;
  }

  // ── Cross-filter ───────────────────────────────────────────────────

  /**
   * Apply (or replace) a cross-filter from a chart click. A second click
   * on the same source visual + column replaces the value; a click with a
   * different column from the same source replaces the previous one so a
   * single visual only ever contributes one active cross-filter (avoids a
   * confusing pile-up of predicates from one chart).
   */
  applyCrossFilter(event: CrossFilterEvent): void {
    const next = this._crossFilters().filter(
      cf => cf.sourceVisualId !== event.sourceVisualId,
    );
    next.push({
      sourceVisualId: event.sourceVisualId,
      columnName: event.columnName,
      value: event.value,
    });
    this._crossFilters.set(next);
  }

  /** Remove the cross-filter contributed by a specific source visual. */
  clearCrossFilterFrom(sourceVisualId: string): void {
    this._crossFilters.set(
      this._crossFilters().filter(cf => cf.sourceVisualId !== sourceVisualId),
    );
  }

  /** Drop every active cross-filter. */
  clearAllCrossFilters(): void {
    this._crossFilters.set([]);
  }

  // ── Drill-down ─────────────────────────────────────────────────────

  /**
   * Descend one drill level. `dimensions` is the source visual's ordered
   * drill stack; `clickedValue` is the category the user clicked at the
   * current focus. The dimension currently in focus is dimensions[depth]
   * (dimensions[0] at the root); we descend INTO dimensions[depth+1],
   * recording the parent column + clicked value so the scope is exact.
   * No-op once the stack is exhausted (nothing deeper to drill into).
   */
  drillDown(
    dimensions: string[],
    clickedValue: string | number,
    label?: string,
  ): void {
    const path = this._drillPath();
    const depth = path.length; // 0 at root
    if (depth + 1 >= dimensions.length) return; // nothing deeper
    const parentColumn = dimensions[depth];
    const nextColumn = dimensions[depth + 1];
    const level: DrillLevel = {
      columnName: nextColumn,
      parentColumn,
      value: clickedValue,
      label: label ?? String(clickedValue),
    };
    this._drillPath.set([...path, level]);
  }

  /**
   * Ascend to a breadcrumb level by index. Passing -1 (or a negative
   * value) resets to the root (empty path). Index i keeps levels [0..i].
   */
  drillUpTo(index: number): void {
    if (index < 0) {
      this._drillPath.set([]);
      return;
    }
    this._drillPath.set(this._drillPath().slice(0, index + 1));
  }

  /** Pop the innermost drill level (breadcrumb "back"). */
  drillUpOne(): void {
    const path = this._drillPath();
    if (path.length === 0) return;
    this._drillPath.set(path.slice(0, -1));
  }

  /** Reset the drill path entirely. */
  clearDrill(): void {
    this._drillPath.set([]);
  }

  // ── Derived run-query payload ───────────────────────────────────────

  /**
   * Build the run-query `filters[]` contribution from the current
   * interaction state. Both cross-filters and drill scoping become
   * category EQUALS predicates — the shape filterEngine.service consumes.
   * The caller merges these with the analysis's own applied filters.
   *
   * Drill levels with a non-null `value` scope the parent dimension, so
   * they contribute a predicate on the PARENT level's column. We walk the
   * path and, for each level beyond the root, add an EQUALS on the column
   * the previous level focused.
   */
  toRunQueryFilters(): any[] {
    const out: any[] = [];

    for (const cf of this._crossFilters()) {
      out.push({
        columnName: cf.columnName,
        filterType: 'category',
        operator: 'EQUALS',
        values: [cf.value],
        nullOption: 'ALL_VALUES',
      });
    }

    // Each drill level records the parent column it descended from and
    // the value clicked there. That value scopes the parent column, so
    // every level (including the first) contributes one EQUALS predicate.
    for (const level of this._drillPath()) {
      if (level.value === null || level.value === undefined) continue;
      out.push({
        columnName: level.parentColumn,
        filterType: 'category',
        operator: 'EQUALS',
        values: [level.value],
        nullOption: 'ALL_VALUES',
      });
    }

    return out;
  }

  /** Wipe all interaction state (analysis switch / explicit reset). */
  reset(): void {
    this._crossFilters.set([]);
    this._drillPath.set([]);
  }
}
