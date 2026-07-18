import { Injectable, signal } from '@angular/core';
import type {
  AppliedCrossFilter,
  CrossFilterEvent,
  CrossFilterTargets,
  DrillLevel,
  ScopedCrossFilterState,
} from '../models/interaction.model';
import type { Visual } from '../models/visual.model';

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
  /**
   * Active SCOPED cross-filter (Wave 6). At most one — last click wins.
   * When set, only the resolved TARGET visuals re-run (isTargetOfCrossFilter),
   * matching the dashboard's per-visual behaviour, rather than the legacy
   * global bus that re-filtered every visual. null = no scoped filter active.
   */
  private _scopedCrossFilter = signal<ScopedCrossFilterState | null>(null);

  readonly crossFilters = this._crossFilters.asReadonly();
  readonly drillPath = this._drillPath.asReadonly();
  readonly scopedCrossFilter = this._scopedCrossFilter.asReadonly();

  /** True when any interaction is currently constraining the analysis. */
  hasActiveInteractions(): boolean {
    return (
      this._crossFilters().length > 0 ||
      this._drillPath().length > 0 ||
      this._scopedCrossFilter() !== null
    );
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

  // ── Scoped cross-filter (Wave 6, §A) ───────────────────────────────
  //
  // The scoped path is what the analyses editor uses now. It mirrors the
  // dashboard viewer's DashboardCrossFilter: the author declares, per source
  // visual, WHICH visuals a click filters (config.interaction.crossFilter.
  // targets — the SAME authored shape the dashboard reads). Clicking a mark
  // sets one active scoped filter; only the resolved TARGET visuals re-run.
  // Generalised: no assumption about what the clicked column/value means.

  /**
   * Read the cross-filter config off a visual. Returns null when the visual
   * did not opt in. `targets` defaults to 'same-tab' when enabled but
   * unspecified (the editor's sensible default — filter siblings on the same
   * tab). Reads BOTH the nested config.interaction.crossFilter shape (written
   * by the config sidebar) and the flat visual.crossFilterEnabled mirror, so a
   * visual toggled on before targets were authored still cross-filters.
   */
  static readCrossFilterConfig(
    visual: Visual | null | undefined,
  ): { enabled: boolean; targets: CrossFilterTargets } | null {
    if (!visual) return null;
    const raw = visual?.config?.interaction?.crossFilter;
    const enabled = raw?.enabled === true || visual.crossFilterEnabled === true;
    if (!enabled) return null;
    let targets: CrossFilterTargets = 'same-tab';
    const t = raw?.targets;
    if (t === 'same-tab' || t === 'dashboard') {
      targets = t;
    } else if (t && typeof t === 'object' && Array.isArray(t.visualIds)) {
      targets = { visualIds: t.visualIds.slice() };
    }
    return { enabled: true, targets };
  }

  /** Whether a source visual has cross-filtering enabled. */
  static isCrossFilterEnabled(visual: Visual | null | undefined): boolean {
    return AnalysisInteractionService.readCrossFilterConfig(visual) !== null;
  }

  /**
   * Apply (or replace) the active SCOPED cross-filter from a source visual
   * click. Returns false — nothing applied — when the visual is not
   * cross-filter-enabled, the column is missing, or the value is empty. A
   * click on the SAME source visual + column with the SAME value toggles the
   * filter OFF (so clicking the highlighted bar again clears it).
   */
  applyScopedCrossFilter(
    visual: Visual,
    columnName: string | null | undefined,
    value: string | number | null | undefined,
  ): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (!columnName) return false;
    const cfg = AnalysisInteractionService.readCrossFilterConfig(visual);
    if (!cfg) return false;

    const active = this._scopedCrossFilter();
    if (
      active &&
      active.sourceVisualId === visual.id &&
      active.columnName === columnName &&
      active.value === value
    ) {
      // Same mark clicked again → toggle off.
      this._scopedCrossFilter.set(null);
      return false;
    }

    this._scopedCrossFilter.set({
      sourceVisualId: visual.id,
      sourceTabId: visual.tabId ?? null,
      columnName,
      value,
      targets: cfg.targets,
    });
    return true;
  }

  /** Drop the active scoped cross-filter. */
  clearScopedCrossFilter(): void {
    this._scopedCrossFilter.set(null);
  }

  /**
   * Resolve whether `visual` is a TARGET of the active scoped cross-filter.
   * The source visual is never a target of its own click.
   *   - 'dashboard' → every other visual on the analysis.
   *   - 'same-tab'  → every other visual sharing the source's tab. Both a
   *                   null tabId and `firstTabId` count as the first/implicit
   *                   tab, so a same-tab filter still reaches sibling visuals
   *                   authored before multi-tab.
   *   - {visualIds} → only the explicitly listed ids.
   * `firstTabId` lets the caller pass the analysis's first tab so null tabIds
   * resolve consistently with the editor's matchesActiveTab().
   */
  isTargetOfCrossFilter(
    visual: Visual,
    firstTabId: string | null = null,
  ): boolean {
    const active = this._scopedCrossFilter();
    if (!active) return false;
    if (visual.id === active.sourceVisualId) return false;
    const t = active.targets;
    if (t === 'dashboard') return true;
    if (t === 'same-tab') {
      const vTab = visual.tabId ?? firstTabId;
      const sTab = active.sourceTabId ?? firstTabId;
      return vTab === sTab;
    }
    return t.visualIds.includes(visual.id);
  }

  /**
   * The run-query `filters[]` contribution the scoped cross-filter adds for a
   * TARGET visual — a single category EQUALS predicate on the clicked column.
   * Empty for non-targets / no active filter, so callers can unconditionally
   * merge the result. The value rides as data in the filter payload; the BE
   * binds it as a parameter and composes it after resolveRlsFilters (no
   * bypass, no string concatenation).
   */
  scopedFiltersFor(visual: Visual, firstTabId: string | null = null): any[] {
    if (!this.isTargetOfCrossFilter(visual, firstTabId)) return [];
    const active = this._scopedCrossFilter()!;
    return [
      {
        columnName: active.columnName,
        filterType: 'category',
        operator: 'EQUALS',
        values: [active.value],
        nullOption: 'ALL_VALUES',
      },
    ];
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
    this._scopedCrossFilter.set(null);
  }

  // ── Drill-to-detail (Wave 6, §C) ────────────────────────────────────

  /**
   * Build the run-query `filters[]` scoping a drill-to-detail fetch for a
   * mark the user actioned on `visual`. The raw-row query should reflect
   * exactly what the mark represents on screen, so we combine:
   *   - the active drill path (parent-dimension EQUALS predicates), which is
   *     already what the source visual is scoped to, plus
   *   - the clicked mark itself: `column = value` (generalised over any
   *     column/value — no assumption about meaning).
   * The active scoped cross-filter is intentionally NOT folded in here: it
   * targets OTHER visuals, not the source. Callers run this with NO
   * aggregation block so the BE returns the underlying rows, composed after
   * resolveRlsFilters via bound params.
   */
  drillToDetailFilters(
    columnName: string | null | undefined,
    value: string | number | null | undefined,
  ): any[] {
    const out: any[] = [];
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
    if (
      columnName &&
      value !== null &&
      value !== undefined &&
      value !== ''
    ) {
      out.push({
        columnName,
        filterType: 'category',
        operator: 'EQUALS',
        values: [value],
        nullOption: 'ALL_VALUES',
      });
    }
    return out;
  }
}
