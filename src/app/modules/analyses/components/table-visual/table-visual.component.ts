import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  ConditionalRule,
  resolveConditionalStyle,
} from 'src/app/shared/helpers/conditional-formatting.helper';
import {
  buildPivot,
  PivotColumn,
  PivotResult,
  PivotRow,
  stubValue,
} from 'src/app/shared/helpers/pivot.helper';

/**
 * Auto-detected column descriptor for the table visual. Derived from
 * the first data row; field is the property key on the row object,
 * header is a humanised version of that key for display.
 */
interface TableColumn {
  field: string;
  header: string;
  /** Number columns get right-aligned + tabular numerals. */
  numeric: boolean;
}

/**
 * Table visualization component.
 *
 * Renders an array of row objects as a tabular visual inside a chart
 * card. Used by chart-renderer when the visual's chart type is 'table'.
 * Reuses the .modern-table styling from the listings module so the
 * table reads as part of the same design family — same hairline
 * header, hover row tint, primary-tinted sort indicator, thin
 * scrollbar, etc.
 *
 * v1 capabilities:
 *   - Auto-derive columns from the first data row's keys
 *   - Click-to-sort (single column)
 *   - Virtual scroll for large datasets (kicks in past ~100 rows)
 *   - Density toggle (compact vs comfortable) bound to config
 *   - Striped rows toggle bound to config
 *   - Row-number column toggle bound to config
 *
 * v2 additions (config-gated, additive):
 *   - Pivot / crosstab render mode when config.pivot.enabled — flat rows
 *     are cross-tabulated (rows × columns × measure + totals) via the
 *     shared pivot helper. Flat mode is unchanged when pivot is absent.
 *   - Conditional cell formatting via config.conditionalFormatting[] —
 *     per-cell text / background colour, sharing the same rule evaluator
 *     as the chart path.
 *
 * Out of scope:
 *   - Multi-column sort, column reorder, column resize
 *   - Column-header filter inputs (the analysis filter sidebar
 *     already filters the dataset upstream)
 *   - Row/column subtotals in pivot (grand totals only), CSV export,
 *     frozen columns — separate spec each.
 */
@Component({
  selector: 'app-table-visual',
  templateUrl: './table-visual.component.html',
  styleUrls: ['./table-visual.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableVisualComponent implements OnChanges {
  @Input() data: any[] = [];
  @Input() chartConfig: any = {};
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  /**
   * Server-side pivot total rows (Feature 5). Each row is a plain row
   * object (same key shape as a data row) tagged with `__rowType`:
   * 'subtotal' | 'grand'. Rendered after the flat data rows, styled
   * distinctly (bold + tinted). Empty / absent = no totals shown.
   */
  @Input() totalRows: any[] = [];

  @Output() chartSelect = new EventEmitter<any>();

  columns: TableColumn[] = [];

  /**
   * Pivot render state. Populated in ngOnChanges when config.pivot.enabled
   * and the config is usable; `pivot.ok === false` means we fall back to the
   * flat table. Kept as a separate render path so the flat mode is untouched.
   */
  pivot: PivotResult = { columns: [], rows: [], ok: false };

  /**
   * Virtual scroll kicks in past this row count. Below it, a plain
   * scrollable table is cheaper and gives a snappier first paint.
   */
  private static readonly VIRTUAL_THRESHOLD = 100;

  constructor(private cdr: ChangeDetectorRef) {}

  /** All derivable columns from the data, before visibility filtering. */
  private allColumns: TableColumn[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.allColumns = this.deriveColumns(this.data);
    }
    // Recompute visible columns when either the data shape changes or
    // the user toggles a column visibility in the Properties sidebar.
    if (changes['data'] || changes['chartConfig']) {
      this.columns = this.filterVisibleColumns(this.allColumns);
      // Pivot is a separate render path — recompute whenever data or config
      // changes. buildPivot returns ok:false when the pivot config is absent
      // or unusable, in which case the template renders the flat table.
      this.pivot = buildPivot(this.data, this.chartConfig?.pivot);
      this.cdr.markForCheck();
    }
  }

  /** True when the pivot render path should be used instead of flat mode. */
  get isPivot(): boolean {
    return this.chartConfig?.pivot?.enabled === true && this.pivot.ok;
  }

  /**
   * Drop any column the user has hidden via the Properties sidebar.
   * config.tableHiddenColumns is a string array of field names; any
   * field whose key is in that list is excluded from rendering.
   * Defaults to showing everything when the config is missing.
   */
  private filterVisibleColumns(all: TableColumn[]): TableColumn[] {
    const hidden = this.chartConfig?.tableHiddenColumns;
    if (!Array.isArray(hidden) || hidden.length === 0) return all;
    const hiddenSet = new Set<string>(hidden);
    return all.filter(c => !hiddenSet.has(c.field));
  }

  get useVirtualScroll(): boolean {
    return (this.data?.length ?? 0) > TableVisualComponent.VIRTUAL_THRESHOLD;
  }

  get rowHeight(): number {
    // Compact density = 32px row, comfortable = 44px. Matches the
    // listings module row sizing.
    return this.chartConfig?.tableCompact ? 32 : 44;
  }

  get showRowNumbers(): boolean {
    return this.chartConfig?.tableShowRowNumbers === true;
  }

  get striped(): boolean {
    return this.chartConfig?.tableStriped === true;
  }

  get compact(): boolean {
    return this.chartConfig?.tableCompact === true;
  }

  /**
   * Best-effort cell formatting:
   *  - null / undefined  -> em-dash
   *  - finite number     -> locale-formatted with up to 2 decimals
   *                         (preserves integers as integers)
   *  - ISO-ish date str  -> short date when parseable
   *  - everything else   -> String(value)
   */
  formatCell(value: any, col: TableColumn): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Integer fast-path so '127' does not render as '127.00'
      if (Number.isInteger(value)) return value.toLocaleString();
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        });
      }
    }
    return String(value);
  }

  /**
   * Conditional cell styling — returns an ngStyle object (color /
   * background-color) for a cell, or {} when no rule matches. Shares the
   * exact same rule evaluator as the chart path so the two surfaces agree on
   * when a rule fires. `row` provides whole-row context for cross-field rules.
   *
   * Kept separate from formatCell (which returns display text) so both flat
   * and pivot modes can call it independently of formatting.
   */
  cellStyle(value: any, field: string, row?: any): { [k: string]: string } {
    const rules: ConditionalRule[] = this.conditionalRules;
    if (rules.length === 0) return {};
    // A rule with no targetField tests this cell's value; a rule with a
    // targetField tests that field on the row (falling back to the value when
    // the row is absent).
    const match = resolveConditionalStyle(
      rules,
      value,
      row ?? { [field]: value },
      ['cell', 'text', 'background'],
    );
    if (!match) return {};
    const style: { [k: string]: string } = {};
    const surface = match.appliesTo;
    if (surface === 'text') {
      if (match.color) style['color'] = match.color;
    } else {
      // 'cell' | 'background' → paint background; optional explicit text colour.
      if (match.color) style['background-color'] = match.color;
      if (match.textColor) style['color'] = match.textColor;
    }
    return style;
  }

  /** Normalised conditional-formatting rule list off the config blob. */
  private get conditionalRules(): ConditionalRule[] {
    const r = this.chartConfig?.conditionalFormatting;
    return Array.isArray(r) ? r : [];
  }

  // ── Pivot render helpers (template-facing) ──

  /** Format a pivot cell value for display (numbers get grouped/rounded). */
  formatPivotCell(row: PivotRow, col: PivotColumn): string {
    if (col.kind === 'stub') {
      const v = stubValue(row, col);
      return v === null || v === undefined || v === '' ? '—' : String(v);
    }
    const v = row.cells[col.key];
    if (v === null || v === undefined) return '—';
    if (!Number.isFinite(v)) return String(v);
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
  }

  /** Conditional styling for a pivot measure/total cell. */
  pivotCellStyle(row: PivotRow, col: PivotColumn): { [k: string]: string } {
    if (col.kind === 'stub') return {};
    const v = row.cells[col.key];
    return this.cellStyle(v, col.key);
  }

  trackByPivotCol(_: number, col: PivotColumn): string {
    return col.key;
  }

  onRowClick(row: any): void {
    this.chartSelect.emit({ row });
  }

  // ── Server-side total rows (Feature 5) ──

  /** True when the BE returned total/subtotal rows to render. */
  get hasTotalRows(): boolean {
    return Array.isArray(this.totalRows) && this.totalRows.length > 0;
  }

  /** Grand-total rows get a heavier treatment than subtotals. */
  isGrandTotalRow(row: any): boolean {
    return row?.__rowType === 'grand';
  }

  /**
   * Cell text for a total row. The BE echoes the same column keys as the
   * data rows, so we reuse formatCell; the internal `__rowType` tag is
   * never a rendered column (columns come from the data sample).
   */
  formatTotalCell(row: any, col: TableColumn): string {
    return this.formatCell(row?.[col.field], col);
  }

  trackByIndex(i: number): number {
    return i;
  }

  /**
   * Pull column descriptors from the first row. Numeric inference
   * uses the first non-null sample for each key. Falls back to an
   * empty list if data is missing.
   */
  private deriveColumns(rows: any[]): TableColumn[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const sample = rows[0];
    if (!sample || typeof sample !== 'object') return [];
    return Object.keys(sample).map(key => ({
      field: key,
      header: this.humanise(key),
      numeric: this.inferNumeric(rows, key),
    }));
  }

  private inferNumeric(rows: any[], key: string): boolean {
    // Look at up to the first 5 non-null samples — enough to classify
    // without iterating the whole dataset.
    let seen = 0;
    for (const row of rows) {
      const v = row?.[key];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      if (++seen >= 5) break;
    }
    return seen > 0;
  }

  private humanise(key: string): string {
    // 'firstName' -> 'First Name'
    // 'created_on' -> 'Created On'
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }
}
