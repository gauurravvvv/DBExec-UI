/**
 * Interaction state for the query result grid: expanded JSON cells, measured
 * column widths, the column-profiling strip, the cell right-click menu, and
 * clipboard copy.
 *
 * These are the things a user does *to* a result rather than to the query, and
 * both add-dataset and edit-dataset carried an identical (or comment-only
 * divergent) copy of every one of them. The arithmetic itself already lived in
 * `helpers/dataset-result-tools.helper.ts` and `helpers/cell-formatter.helper.ts`;
 * what was duplicated was the state and the wiring, which is what this owns.
 *
 * **Provide it on the component, not in root.** Expanded cells and a measured
 * column layout belong to one grid:
 *
 *     @Component({ providers: [ResultGridToolsService] })
 *
 * The grid's *data* stays on the component — this service reads it through
 * `ResultGridHost` whenever it needs it, rather than holding a second reference
 * that could go stale after a re-run.
 */
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { GlobalService } from 'src/app/core/services/global.service';
import {
  formatCellValue,
  measureColumnWidths,
} from '../helpers/cell-formatter.helper';
import {
  ColumnProfile,
  nullPctSeverity,
  profileColumns,
} from '../helpers/dataset-result-tools.helper';
import { QueryResult } from '../models/dataset-schema.model';

/** What the grid tools need from whichever screen is hosting them. */
export interface ResultGridHost {
  /** The result currently on screen, or null. Read fresh on every use. */
  currentResult(): QueryResult | null;
  /** The component's `cdr.markForCheck()` — these screens are OnPush. */
  requestRender(): void;
  /**
   * Close any other open menu.
   *
   * The datasource tree has its own context menu, and opening the cell menu
   * while that one is up would leave two menus on screen.
   */
  closeOtherMenus(): void;
}

@Injectable()
export class ResultGridToolsService {
  constructor(
    private readonly translate: TranslateService,
    private readonly globalService: GlobalService,
  ) {}

  private host: ResultGridHost | null = null;

  /**
   * Keys (`rowIndex-column`) of JSON cells the user has expanded.
   *
   * Re-assigned rather than mutated on every change — an in-place `Set.add` does
   * not trip OnPush, so the grid would not re-render.
   */
  expandedJsonCells = new Set<string>();

  /** Measured natural width per column, keyed by column name. */
  columnWidths: Record<string, number> = {};

  /** Per-column null %, distinct count and numeric aggregates. */
  columnProfiles: ColumnProfile[] = [];

  /** Whether the profiling strip is showing. */
  showColumnProfile = false;

  // ── Cell context menu ──────────────────────────────────────────────

  showCellContextMenu = false;
  cellContextMenuTop = 0;
  cellContextMenuLeft = 0;
  private cellContextTarget: { rowIndex: number; col: string } | null = null;

  /** Wire the service to its host component. Call once, from ngOnInit. */
  attach(host: ResultGridHost): void {
    this.host = host;
  }

  // ── JSON cell expansion ────────────────────────────────────────────

  jsonCellKey(rowIndex: number, col: string): string {
    return `${rowIndex}-${col}`;
  }

  toggleJsonCell(rowIndex: number, col: string): void {
    const key = this.jsonCellKey(rowIndex, col);
    if (this.expandedJsonCells.has(key)) {
      this.expandedJsonCells.delete(key);
    } else {
      this.expandedJsonCells.add(key);
    }
    // Re-assign so OnPush equality checks fire; mutating in place does not.
    // Cheap — Set construction over a handful of keys is negligible.
    this.expandedJsonCells = new Set(this.expandedJsonCells);
  }

  /**
   * Drop expanded-cell keys.
   *
   * The keys reference row indices in the *previous* result, so a new result
   * must start with none expanded or the wrong cells appear open.
   */
  resetExpandedCells(): void {
    if (this.expandedJsonCells.size > 0) {
      this.expandedJsonCells = new Set();
    }
  }

  // ── Column widths and profiling ────────────────────────────────────

  /** True when the BE supplied any column type information. */
  hasAnyColumnType(): boolean {
    const types = this.host?.currentResult()?.columnTypes;
    return !!types && Object.keys(types).length > 0;
  }

  /**
   * Re-measure column widths against the current data.
   *
   * Columns sit at their natural measured widths. If the total is narrower than
   * the container the trailing strip stays empty, matching DBeaver and DataGrip.
   * There is deliberately no last-column inflation: that produced a
   * several-hundred-pixel "location" column beside narrow ones, which read as
   * broken rather than as filled space.
   */
  recalculateColumnWidths(): void {
    const result = this.host?.currentResult();
    if (!result || !result.columns?.length) return;
    this.columnWidths = measureColumnWidths(
      result.columns,
      result.rows,
      result.columnTypes,
    );
    this.host?.requestRender();
  }

  toggleColumnProfile(): void {
    this.showColumnProfile = !this.showColumnProfile;
    if (this.showColumnProfile) this.recomputeColumnProfiles();
    this.host?.requestRender();
  }

  recomputeColumnProfiles(): void {
    const result = this.host?.currentResult();
    if (!result?.columns?.length) {
      this.columnProfiles = [];
      return;
    }
    this.columnProfiles = profileColumns(result.columns, result.rows);
  }

  /** Bucket a null-% into a traffic-light severity for the bar colour. */
  nullSeverity(pct: number): 'good' | 'warn' | 'bad' {
    return nullPctSeverity(pct);
  }

  // ── Cell context menu ──────────────────────────────────────────────

  /**
   * Open the cell menu at the cursor.
   *
   * Standard fare in every database GUI — DBeaver, DataGrip, pgAdmin, TablePlus —
   * and users reach for it within seconds of trying to get a value out of a grid.
   */
  onCellContextMenu(event: MouseEvent, rowIndex: number, col: string): void {
    if (!this.host?.currentResult()) return;
    event.preventDefault();
    event.stopPropagation();
    this.host.closeOtherMenus();
    this.cellContextTarget = { rowIndex, col };
    this.cellContextMenuLeft = event.clientX;
    this.cellContextMenuTop = event.clientY;
    this.showCellContextMenu = true;
  }

  closeCellContextMenu(): void {
    this.showCellContextMenu = false;
    this.cellContextTarget = null;
  }

  /**
   * Copy the right-clicked cell.
   *
   * Copies through `formatCellValue` so what lands on the clipboard is what the
   * user sees: the BIGINT preserved as a string, the ISO date, the pretty-printed
   * JSON body — not the raw driver value.
   */
  async copyCellValue(): Promise<void> {
    const result = this.host?.currentResult();
    if (!this.cellContextTarget || !result) return;
    const { rowIndex, col } = this.cellContextTarget;
    const raw = result.rows?.[rowIndex]?.[col];
    const cell = formatCellValue(raw, result.columnTypes?.[col]);
    const text =
      cell.kind === 'null'
        ? this.translate.instant('DATASET.CELL_NULL')
        : cell.display;
    await this.writeToClipboard(text);
    this.closeCellContextMenu();
  }

  /** Copy every row's value for the right-clicked column, newline-joined. */
  async copyColumnValues(): Promise<void> {
    const result = this.host?.currentResult();
    if (!this.cellContextTarget || !result) return;
    const { col } = this.cellContextTarget;
    const lines = (result.rows || []).map(row => {
      const cell = formatCellValue(row?.[col], result.columnTypes?.[col]);
      return cell.kind === 'null' ? '' : cell.display;
    });
    await this.writeToClipboard(lines.join('\n'));
    this.closeCellContextMenu();
  }

  /**
   * Write text to the clipboard, with a fallback for non-secure contexts.
   *
   * The toast is `showInfo`, not a success banner: copy is a frequent action and a
   * green banner every time would be obnoxious. A failure *is* surfaced, though —
   * clipboard writes throw on permission denial, and silently doing nothing looks
   * identical to the copy having worked.
   */
  async writeToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Hidden textarea + execCommand('copy') — the pre-async-clipboard path,
        // still needed on plain-http origins.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.globalService.showInfo(this.translate.instant('DATASET.COPIED'));
    } catch (_) {
      this.globalService.showWarn(
        this.translate.instant('DATASET.COPY_FAILED'),
      );
    }
  }
}
