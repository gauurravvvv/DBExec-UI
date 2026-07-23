import type { Visual } from 'src/app/modules/analyses/models/visual.model';

/**
 * DashboardCrossFilter — the dashboard-side, configurable cross-filter
 * handler (Dashboard & Analysis v2, Track E2).
 *
 * The analyses editor's `AnalysisInteractionService` cross-filters ALL
 * sibling visuals unconditionally. On a published dashboard the author
 * decides, per source visual, WHICH visuals a click filters:
 *
 *   config.interaction.crossFilter = {
 *     enabled: boolean,
 *     targets: 'same-tab' | 'dashboard' | { visualIds: string[] },
 *   }
 *
 * This is a plain, framework-free helper (no Angular DI) so both the
 * authed `view-dashboard` and the standalone public `embed-dashboard`
 * viewer can own one instance without pulling in the analyses module's
 * provider. State is intentionally ephemeral (per open dashboard); it is
 * not persisted.
 *
 * A single active cross-filter at a time (last click wins). Clicking a
 * point on a cross-filter-enabled visual sets the active filter; the
 * caller re-runs ONLY the resolved target visuals with the derived
 * `filters[]` contribution merged into their run payload. A "clear"
 * affordance drops it and the caller re-runs the affected visuals with
 * the base filter set.
 */

export type CrossFilterTargets =
  'same-tab' | 'dashboard' | { visualIds: string[] };

/** The active cross-filter emitted by a source visual click. */
export interface DashboardCrossFilterState {
  /** Source visual that originated the click. */
  sourceVisualId: string;
  /** Source visual's owning tab (for 'same-tab' target resolution). */
  sourceTabId: string | null;
  /** Dataset column the clicked category maps to. */
  columnName: string;
  /** The clicked category value. */
  value: string | number;
  /** Resolved target set declared on the source visual's config. */
  targets: CrossFilterTargets;
}

export class DashboardCrossFilter {
  private active: DashboardCrossFilterState | null = null;

  /** True when a cross-filter is currently constraining target visuals. */
  isActive(): boolean {
    return this.active !== null;
  }

  /** The currently active cross-filter (or null). */
  current(): DashboardCrossFilterState | null {
    return this.active;
  }

  /**
   * Read the cross-filter config off a visual. Returns null when the
   * visual didn't opt in. `targets` defaults to 'dashboard' when enabled
   * but unspecified (matches the analyses editor's "filter everything").
   */
  static readConfig(
    visual: Visual,
  ): { enabled: boolean; targets: CrossFilterTargets } | null {
    const raw = visual?.config?.interaction?.crossFilter;
    if (!raw || raw.enabled !== true) return null;
    let targets: CrossFilterTargets = 'dashboard';
    if (raw.targets === 'same-tab' || raw.targets === 'dashboard') {
      targets = raw.targets;
    } else if (
      raw.targets &&
      typeof raw.targets === 'object' &&
      Array.isArray(raw.targets.visualIds)
    ) {
      targets = { visualIds: raw.targets.visualIds.slice() };
    }
    return { enabled: true, targets };
  }

  /** Whether a source visual has cross-filtering enabled. */
  static isEnabled(visual: Visual): boolean {
    return DashboardCrossFilter.readConfig(visual) !== null;
  }

  /**
   * Set (replace) the active cross-filter from a source visual click.
   * Returns false when the visual isn't cross-filter-enabled or the
   * value is empty (nothing applied).
   */
  apply(
    visual: Visual,
    columnName: string | null | undefined,
    value: string | number | null | undefined,
  ): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (!columnName) return false;
    const cfg = DashboardCrossFilter.readConfig(visual);
    if (!cfg) return false;
    this.active = {
      sourceVisualId: visual.id,
      sourceTabId: visual.tabId ?? null,
      columnName,
      value,
      targets: cfg.targets,
    };
    return true;
  }

  /** Drop the active cross-filter. */
  clear(): void {
    this.active = null;
  }

  /**
   * Resolve whether a given visual is a TARGET of the active cross-filter.
   * The source visual is never a target of its own click.
   *   - 'dashboard' → every other visual on the dashboard.
   *   - 'same-tab'  → every other visual sharing the source's tabId
   *                   (both null tabIds count as the same implicit tab).
   *   - {visualIds} → only the explicitly listed ids.
   */
  isTarget(visual: Visual): boolean {
    if (!this.active) return false;
    if (visual.id === this.active.sourceVisualId) return false;
    const t = this.active.targets;
    if (t === 'dashboard') return true;
    if (t === 'same-tab') {
      return (visual.tabId ?? null) === (this.active.sourceTabId ?? null);
    }
    return t.visualIds.includes(visual.id);
  }

  /**
   * The run-query `filters[]` contribution for a target visual. A single
   * category EQUALS predicate on the clicked column — the shape
   * filterEngine.service consumes. Empty for non-targets / no active
   * filter, so callers can unconditionally merge the result.
   */
  filtersFor(visual: Visual): any[] {
    if (!this.isTarget(visual)) return [];
    return [
      {
        columnName: this.active!.columnName,
        filterType: 'category',
        operator: 'EQUALS',
        values: [this.active!.value],
        nullOption: 'ALL_VALUES',
      },
    ];
  }
}
