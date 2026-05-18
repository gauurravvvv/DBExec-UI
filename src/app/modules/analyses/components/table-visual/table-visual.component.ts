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
 * Out of scope (v1):
 *   - Multi-column sort, column reorder, column resize
 *   - Column-header filter inputs (the analysis filter sidebar
 *     already filters the dataset upstream)
 *   - Pivot/matrix mode, conditional formatting, CSV export,
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

  @Output() chartSelect = new EventEmitter<any>();

  columns: TableColumn[] = [];

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
      this.cdr.markForCheck();
    }
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

  onRowClick(row: any): void {
    this.chartSelect.emit({ row });
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
