/**
 * Bottom-sheet layout for the query result pane: height, collapse, drag, keyboard
 * resize, persistence, and the pane ResizeObserver that re-flows column widths.
 *
 * Both add-dataset and edit-dataset carried this, and — unusually for those two
 * screens — carried it *identically*: same storage keys, same 240px floor, same
 * 120px editor reservation, same clamp arithmetic. The only differences were
 * comment density and whether the constants were read off `AddDatasetComponent`
 * or `EditDatasetComponent`. So this is a straight consolidation with no
 * per-screen options; nothing here changes what either screen does.
 *
 * **Provide it on the component, not in root.** Two screens must not share a
 * height or a drag in progress:
 *
 *     @Component({ providers: [ResultSheetLayoutService] })
 *
 * The service reaches back into the component through `ResultSheetHost` rather
 * than taking an `ElementRef` or a `ChangeDetectorRef`, so it stays testable
 * without a TestBed and cannot accidentally grow a dependency on either screen.
 */
import { Injectable, OnDestroy } from '@angular/core';

/** What the sheet needs from whichever screen is hosting it. */
export interface ResultSheetHost {
  /**
   * The pane the sheet lives inside (`.editor-results-area`).
   *
   * Height is clamped against this rather than the viewport, because the sheet is
   * a child of the pane — clamping to the viewport would let it overflow.
   * Returns null before the view is mounted, which every caller handles.
   */
  sheetPaneElement(): HTMLElement | null;
  /** The component's `cdr.markForCheck()` — these screens are OnPush. */
  requestRender(): void;
  /** The pane got materially wider or narrower; re-measure column widths. */
  onPaneWidthChanged(): void;
}

@Injectable()
export class ResultSheetLayoutService implements OnDestroy {
  private static readonly HEIGHT_STORAGE_KEY = 'dbexec.queryResult.sheetHeightPx';
  private static readonly COLLAPSED_STORAGE_KEY =
    'dbexec.queryResult.sheetCollapsed';

  /** Floor: one row + paginator + header still has to fit. */
  private static readonly MIN_HEIGHT = 240;

  /**
   * Reserve at least this many pixels of editor visible above the sheet, so a
   * maximised sheet doesn't hide the SQL the user is iterating on.
   */
  private static readonly MAX_HEIGHT_PADDING = 120;

  /** Height of the collapsed header strip. */
  private static readonly COLLAPSED_HEIGHT = 44;

  /** Ignore sub-pixel layout jitter; only re-measure on a real width change. */
  private static readonly WIDTH_CHANGE_THRESHOLD = 50;

  /** Debounce so a live drag doesn't recompute widths 60 times a second. */
  private static readonly RESIZE_DEBOUNCE_MS = 80;

  /**
   * Sheet height in pixels. The default lands at ~45% of viewport on first use
   * but never below MIN_HEIGHT nor above pane height − MAX_HEIGHT_PADDING. The
   * drag handle clamps to the same range. Persisted once the user adjusts it.
   */
  heightPx = 420;

  /**
   * When true the sheet collapses to its header strip — the user can still see
   * row count, Export and Show. Re-running the query auto-expands. Persisted.
   */
  isCollapsed = false;

  /** Active drag. While truthy, mousemove updates height live and mouseup persists. */
  private dragState: {
    startY: number;
    startHeight: number;
    onMove: (ev: MouseEvent) => void;
    onUp: () => void;
  } | null = null;

  private observer: ResizeObserver | null = null;
  private resizeTimer: any = null;
  private lastObservedPaneWidth = 0;
  private host: ResultSheetHost | null = null;

  /** Wire the service to its host component. Call once, from ngOnInit. */
  attach(host: ResultSheetHost): void {
    this.host = host;
  }

  // ── Height ─────────────────────────────────────────────────────────

  /**
   * Clamp a candidate height to what the pane can actually give.
   *
   * Falls back to the viewport when the pane isn't measurable yet (initial
   * render, before the host element exists).
   */
  clamp(px: number): number {
    const pane = this.host?.sheetPaneElement() ?? null;
    const containerHeight =
      pane?.getBoundingClientRect().height ?? window.innerHeight;
    const max = Math.max(
      ResultSheetLayoutService.MIN_HEIGHT,
      containerHeight - ResultSheetLayoutService.MAX_HEIGHT_PADDING,
    );
    return Math.min(
      max,
      Math.max(ResultSheetLayoutService.MIN_HEIGHT, px),
    );
  }

  /**
   * Effective height for the host's `--sheet-height` CSS variable.
   *
   * Zero when there is nothing to show, so the editor pane reclaims the space;
   * the stub height when collapsed; otherwise the persisted height. The two
   * visibility inputs come from the component because they belong to the result
   * *data*, not to this layout.
   */
  effectiveHeightPx(isVisible: boolean, hasResult: boolean): number {
    if (!isVisible || !hasResult) return 0;
    return this.isCollapsed
      ? ResultSheetLayoutService.COLLAPSED_HEIGHT
      : this.heightPx;
  }

  // ── Persistence ────────────────────────────────────────────────────

  /**
   * Read the persisted height and collapsed state.
   *
   * With no stored height, pick 45% of viewport (clamped) so a first-time sheet
   * looks intentional rather than tiny or enormous. Every localStorage access is
   * guarded — it can throw in private-browsing modes, and a sheet that fails to
   * open is a worse outcome than a forgotten preference.
   */
  loadPersisted(): void {
    try {
      const raw = localStorage.getItem(
        ResultSheetLayoutService.HEIGHT_STORAGE_KEY,
      );
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          this.heightPx = this.clamp(parsed);
        }
      } else {
        this.heightPx = this.clamp(Math.round(window.innerHeight * 0.45));
      }
      const collapsedRaw = localStorage.getItem(
        ResultSheetLayoutService.COLLAPSED_STORAGE_KEY,
      );
      this.isCollapsed = collapsedRaw === 'true';
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  persistHeight(px: number): void {
    try {
      localStorage.setItem(
        ResultSheetLayoutService.HEIGHT_STORAGE_KEY,
        String(Math.round(px)),
      );
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  persistCollapsed(collapsed: boolean): void {
    try {
      localStorage.setItem(
        ResultSheetLayoutService.COLLAPSED_STORAGE_KEY,
        collapsed ? 'true' : 'false',
      );
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  // ── Collapse / expand ──────────────────────────────────────────────

  /**
   * Toggle expanded/collapsed, persisting the choice.
   *
   * Deliberately keeps the result data alive: the modal-style × used to unmount
   * the whole result set, and the bottom-sheet pattern lets users iterate on SQL
   * without watching the result panel flash in and out.
   */
  toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    this.persistCollapsed(this.isCollapsed);
  }

  /**
   * Force the sheet expanded, persisting the change.
   *
   * Called when a new result arrives. Persisting is intentional: a user who hit
   * Run is asking to see the result, and honouring an older "collapsed"
   * preference over that explicit action would be surprising. They can collapse
   * again afterwards.
   */
  expand(): void {
    if (this.isCollapsed) {
      this.isCollapsed = false;
      this.persistCollapsed(false);
    }
  }

  // ── Drag + keyboard resize ─────────────────────────────────────────

  /**
   * mousedown on the drag handle.
   *
   * Captures the starting Y and height so mousemove computes relative to the
   * drag rather than the absolute cursor position. Listeners go on the document,
   * because dragging past a 6px-tall target's bounds happens constantly and the
   * drag has to survive it.
   */
  onDragStart(event: MouseEvent): void {
    event.preventDefault();
    if (this.isCollapsed) return;
    const startY = event.clientY;
    const startHeight = this.heightPx;

    const onMove = (ev: MouseEvent) => {
      // Dragging the handle UP grows the sheet; DOWN shrinks it.
      const delta = startY - ev.clientY;
      this.heightPx = this.clamp(startHeight + delta);
      this.host?.requestRender();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.persistHeight(this.heightPx);
      this.dragState = null;
      document.body.classList.remove('ds-sheet-dragging');
    };

    this.dragState = { startY, startHeight, onMove, onUp };
    document.body.classList.add('ds-sheet-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /** Keyboard a11y for the drag handle: arrows nudge, Shift+arrows jump. */
  onHandleKeydown(event: KeyboardEvent): void {
    if (this.isCollapsed) return;
    const step = event.shiftKey ? 80 : 20;
    let next = this.heightPx;
    if (event.key === 'ArrowUp') {
      next = this.heightPx + step;
    } else if (event.key === 'ArrowDown') {
      next = this.heightPx - step;
    } else {
      return;
    }
    event.preventDefault();
    this.heightPx = this.clamp(next);
    this.persistHeight(this.heightPx);
  }

  // ── Pane resize observation ────────────────────────────────────────

  /**
   * Watch the pane so result column widths re-flow when it resizes — sidebar
   * toggle, window resize, sheet drag.
   *
   * Debounced, and skipped unless the width moved by at least the threshold, so
   * a live drag doesn't thrash the measurement.
   */
  installResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const pane = this.host?.sheetPaneElement() ?? null;
    if (!pane) return;

    this.lastObservedPaneWidth = pane.getBoundingClientRect().width;
    this.observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (
        Math.abs(width - this.lastObservedPaneWidth) <
        ResultSheetLayoutService.WIDTH_CHANGE_THRESHOLD
      ) {
        return;
      }
      this.lastObservedPaneWidth = width;
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.host?.onPaneWidthChanged();
        this.resizeTimer = null;
      }, ResultSheetLayoutService.RESIZE_DEBOUNCE_MS);
    });
    this.observer.observe(pane);
  }

  /**
   * Drop the observer, the debounce timer and any in-flight drag listeners.
   *
   * Angular calls this for a component-provided service when the component is
   * destroyed. A leaked document-level mousemove here would keep firing against
   * a dead component, which is invisible until the screen has been opened a
   * dozen times.
   */
  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (this.dragState) {
      document.removeEventListener('mousemove', this.dragState.onMove);
      document.removeEventListener('mouseup', this.dragState.onUp);
      document.body.classList.remove('ds-sheet-dragging');
      this.dragState = null;
    }
    this.host = null;
  }
}
