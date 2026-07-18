/**
 * VisualSelection + align/distribute helpers (Wave 7, feature 2).
 *
 * Extends the editor's single-visual focus to a MULTI-selection while
 * keeping `focusedVisualId` as the primary (last-clicked) visual that the
 * config panel still targets. The alignment / distribution routines are
 * pure functions over the visuals' GRID coordinates (gridCol / gridRow /
 * colSpan / rowSpan) — the canvas is a 24-column bin-pack grid, so we align
 * on grid cells rather than free pixels. The component re-derives pixel
 * sizes from the grid coords afterward (computeVisualDimensions), so no
 * pixel math leaks in here.
 *
 * Generalised: operates on any set of visuals, no domain assumptions.
 *
 * Z-ORDER NOTE: this layout is a non-overlapping bin-pack grid (see
 * placeVisualsOnGrid) — visuals never stack, so bring-to-front / send-to-back
 * would be a visual no-op. Z-order is therefore intentionally NOT implemented
 * (documented in the Wave-7 report). If free-positioning is added later,
 * z-order can be layered on then.
 */

/** The minimal grid-geometry shape the align/distribute math needs. */
export interface GridGeom {
  gridCol: number;
  gridRow: number;
  colSpan: number;
  rowSpan: number;
}

export type AlignEdge =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom';

export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * A tiny selection model: an ordered set of visual ids. `primary` is the
 * last-added id (the one the config panel binds to). Kept framework-free so
 * it is trivially testable and cheap to snapshot.
 */
export class VisualSelection {
  private readonly ids = new Set<string>();
  private _primary: string | null = null;

  get size(): number {
    return this.ids.size;
  }

  get primary(): string | null {
    return this._primary;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  values(): string[] {
    return [...this.ids];
  }

  /** Replace the selection with a single id (plain click). */
  setSingle(id: string): void {
    this.ids.clear();
    this.ids.add(id);
    this._primary = id;
  }

  /** Toggle an id in/out of the selection (ctrl/shift-click). */
  toggle(id: string): void {
    if (this.ids.has(id)) {
      this.ids.delete(id);
      if (this._primary === id) {
        // Primary fell out — promote the most-recently-remaining id.
        const rest = [...this.ids];
        this._primary = rest.length ? rest[rest.length - 1] : null;
      }
    } else {
      this.ids.add(id);
      this._primary = id;
    }
  }

  /** Add an id without removing others; makes it primary. */
  add(id: string): void {
    this.ids.add(id);
    this._primary = id;
  }

  clear(): void {
    this.ids.clear();
    this._primary = null;
  }

  /** Drop any ids no longer present in `liveIds` (e.g. after a delete). */
  prune(liveIds: Set<string>): void {
    for (const id of [...this.ids]) {
      if (!liveIds.has(id)) this.ids.delete(id);
    }
    if (this._primary && !liveIds.has(this._primary)) {
      const rest = [...this.ids];
      this._primary = rest.length ? rest[rest.length - 1] : null;
    }
  }
}

/**
 * Align a group of grid geometries to a shared edge. Mutates each item's
 * grid coords in place (the caller re-packs / re-derives pixels after).
 * No-op for fewer than two items.
 */
export function alignGeoms(items: GridGeom[], edge: AlignEdge): boolean {
  if (!items || items.length < 2) return false;
  let changed = false;

  const setIf = (obj: any, key: string, val: number) => {
    const clamped = Math.max(0, Math.round(val));
    if (obj[key] !== clamped) {
      obj[key] = clamped;
      changed = true;
    }
  };

  switch (edge) {
    case 'left': {
      const min = Math.min(...items.map(i => i.gridCol));
      items.forEach(i => setIf(i, 'gridCol', min));
      break;
    }
    case 'right': {
      const maxRight = Math.max(...items.map(i => i.gridCol + i.colSpan));
      items.forEach(i => setIf(i, 'gridCol', maxRight - i.colSpan));
      break;
    }
    case 'center': {
      // Align horizontal centres to the group's average centre.
      const centre =
        items.reduce((s, i) => s + (i.gridCol + i.colSpan / 2), 0) /
        items.length;
      items.forEach(i => setIf(i, 'gridCol', centre - i.colSpan / 2));
      break;
    }
    case 'top': {
      const min = Math.min(...items.map(i => i.gridRow));
      items.forEach(i => setIf(i, 'gridRow', min));
      break;
    }
    case 'bottom': {
      const maxBottom = Math.max(...items.map(i => i.gridRow + i.rowSpan));
      items.forEach(i => setIf(i, 'gridRow', maxBottom - i.rowSpan));
      break;
    }
    case 'middle': {
      const centre =
        items.reduce((s, i) => s + (i.gridRow + i.rowSpan / 2), 0) /
        items.length;
      items.forEach(i => setIf(i, 'gridRow', centre - i.rowSpan / 2));
      break;
    }
  }
  return changed;
}

/**
 * Distribute a group evenly along an axis: equal gaps between successive
 * items, anchored by the first and last item's extents. Mutates grid coords
 * in place. No-op for fewer than three items (with two there's nothing to
 * distribute between).
 */
export function distributeGeoms(
  items: GridGeom[],
  axis: DistributeAxis,
): boolean {
  if (!items || items.length < 3) return false;
  let changed = false;

  if (axis === 'horizontal') {
    const sorted = [...items].sort((a, b) => a.gridCol - b.gridCol);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const spanTotal = sorted.reduce((s, i) => s + i.colSpan, 0);
    const extent =
      last.gridCol + last.colSpan - first.gridCol; // full occupied width
    const gaps = sorted.length - 1;
    const freeGap = Math.max(0, extent - spanTotal);
    const per = freeGap / gaps;
    let cursor = first.gridCol;
    sorted.forEach((i, idx) => {
      if (idx === 0) {
        cursor = i.gridCol + i.colSpan;
        return;
      }
      const target =
        idx === sorted.length - 1 ? last.gridCol : Math.round(cursor + per);
      if (i.gridCol !== target) {
        i.gridCol = Math.max(0, target);
        changed = true;
      }
      cursor = i.gridCol + i.colSpan;
    });
  } else {
    const sorted = [...items].sort((a, b) => a.gridRow - b.gridRow);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const spanTotal = sorted.reduce((s, i) => s + i.rowSpan, 0);
    const extent = last.gridRow + last.rowSpan - first.gridRow;
    const gaps = sorted.length - 1;
    const freeGap = Math.max(0, extent - spanTotal);
    const per = freeGap / gaps;
    let cursor = first.gridRow;
    sorted.forEach((i, idx) => {
      if (idx === 0) {
        cursor = i.gridRow + i.rowSpan;
        return;
      }
      const target =
        idx === sorted.length - 1 ? last.gridRow : Math.round(cursor + per);
      if (i.gridRow !== target) {
        i.gridRow = Math.max(0, target);
        changed = true;
      }
      cursor = i.gridRow + i.rowSpan;
    });
  }
  return changed;
}
