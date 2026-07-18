/**
 * AuthoringHistory — a bounded undo/redo stack over the analysis's
 * DRAFT-UNTIL-SAVE authoring state (Wave 7, feature 1).
 *
 * The editor holds the entire authoring model in memory until the user
 * clicks Save (tabs, visuals, per-visual config + encodings + layout,
 * widgets, active tab, pending tab deletes). This helper snapshots a
 * deep-ish clone of that SERIALIZABLE state on each mutating action and
 * lets the user step backward / forward through those snapshots.
 *
 * Design constraints honoured:
 *   - Snapshots are of the DRAFT object graph, never the DOM. Restoring
 *     re-hydrates the arrays and lets the component re-place / re-render.
 *   - TRANSIENT + DERIVED per-visual fields are EXCLUDED from the snapshot
 *     (Wave-6 __interactionRows / __drillColumn, plus chartData /
 *     pivotTotalRows / truncation which are recomputed on render). This
 *     keeps snapshots small and keeps an active cross-filter / drill from
 *     leaking into history.
 *   - A restore is itself a mutation of the draft, so the caller marks the
 *     draft dirty after applying a snapshot — undo/redo never "cleans" the
 *     draft.
 *   - Bounded (default 50) so a long editing session can't grow unbounded.
 *
 * Generalised: no assumption about chart types, columns, or values — it
 * clones whatever the draft carries.
 */

/** Per-visual keys that are transient / derived and must NOT be snapshotted. */
const TRANSIENT_VISUAL_KEYS = [
  '__interactionRows',
  '__drillColumn',
  'chartData',
  'pivotTotalRows',
  'truncation',
] as const;

/** The serializable slice of authoring state a snapshot captures. */
export interface AuthoringSnapshot {
  tabs: any[];
  visuals: any[];
  widgets: any[];
  activeTabId: string | null;
  pendingTabDeletes: { id: string; justification: string }[];
}

/**
 * Deep-clone a value, preferring the structured-clone algorithm and falling
 * back to JSON round-trip. Both drop functions / DOM refs, which the draft
 * never contains, so either is safe here.
 */
function deepClone<T>(value: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch {
    // structuredClone can throw on non-cloneable values; fall through.
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Clone a single visual, stripping transient/derived fields first. */
function cloneVisualForHistory(visual: any): any {
  const shallow: any = { ...visual };
  for (const key of TRANSIENT_VISUAL_KEYS) {
    delete shallow[key];
  }
  return deepClone(shallow);
}

export class AuthoringHistory {
  private past: AuthoringSnapshot[] = [];
  private future: AuthoringSnapshot[] = [];

  /**
   * Guard so restoring a snapshot (which mutates the very state we watch)
   * doesn't itself get recorded as a new history entry. The component
   * checks `isRestoring` before calling capture().
   */
  isRestoring = false;

  constructor(private readonly limit = 50) {}

  /** Build a snapshot from the current draft state. */
  static snapshot(
    tabs: any[],
    visuals: any[],
    widgets: any[],
    activeTabId: string | null,
    pendingTabDeletes: { id: string; justification: string }[],
  ): AuthoringSnapshot {
    return {
      tabs: deepClone(tabs ?? []),
      visuals: (visuals ?? []).map(cloneVisualForHistory),
      widgets: deepClone(widgets ?? []),
      activeTabId: activeTabId ?? null,
      pendingTabDeletes: deepClone(pendingTabDeletes ?? []),
    };
  }

  /**
   * Push a snapshot of the CURRENT state onto the undo stack. Call this
   * BEFORE applying a mutation so the pre-mutation state is recoverable.
   * Clears the redo stack (a new edit invalidates the redo branch) and
   * trims the oldest entry when over the limit. No-op while restoring.
   */
  capture(state: AuthoringSnapshot): void {
    if (this.isRestoring) return;
    this.past.push(state);
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    // Any fresh edit invalidates the forward (redo) history.
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Step back one state. `current` is the live state (captured onto the
   * redo stack so a subsequent redo restores it). Returns the snapshot to
   * apply, or null when there is nothing to undo.
   */
  undo(current: AuthoringSnapshot): AuthoringSnapshot | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }

  /**
   * Step forward one state. `current` is the live state (captured back onto
   * the undo stack). Returns the snapshot to apply, or null when there is
   * nothing to redo.
   */
  redo(current: AuthoringSnapshot): AuthoringSnapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  /** Drop all history (e.g. after a Save re-keys ids to server ids). */
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
