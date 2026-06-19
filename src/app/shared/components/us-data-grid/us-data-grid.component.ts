import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  Output,
  QueryList,
  TemplateRef,
  inject,
  AfterContentInit,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AgGridAngular } from 'ag-grid-angular';
import type {
  ColDef,
  ColumnState,
  FilterChangedEvent,
  FirstDataRenderedEvent,
  GridApi,
  GridOptions,
  GridReadyEvent,
  RowClickedEvent,
  SelectionChangedEvent,
  SortChangedEvent,
} from 'ag-grid-community';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeLightWarm,
} from 'ag-grid-community';

import { ButtonDirective } from 'primeng/button';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { CheckboxModule } from 'primeng/checkbox';
import { Tooltip } from 'primeng/tooltip';
import { Chip } from 'primeng/chip';

import { UsSelectFieldComponent } from 'src/app/shared/form-fields/us-select-field/us-select-field.component';

import {
  UsAddFilterColumn,
  UsDataGridConfig,
  UsFilterChip,
  US_DATA_GRID_DEFAULTS,
} from './us-data-grid.types';
import { UsGridCellDirective } from './us-grid-cell.directive';
import { UsCellTemplateRendererComponent } from './us-cell-template-renderer';

/* Register the client-side row model module once per app bundle.
 * AG Grid v32 ships modules separately; without registration the
 * grid renders empty. ClientSideRowModelModule covers everything
 * the Community wrapper needs for in-memory filtering / sorting /
 * pagination. */
ModuleRegistry.registerModules([ClientSideRowModelModule]);

/**
 * UsDataGrid — shared listing table for every Business Configuration
 * module. Wraps AG Grid Community and layers a PrimeNG toolbar on
 * top so the column-visibility chooser + "Add Filter" UX feel like
 * the rest of the app rather than the bare AG Grid sidebar.
 *
 * Theming is handled via CSS variables in the SCSS so the table
 * reads as the existing PrimeNG listings (blue header band, frozen
 * first column with shadow, hover row tint).
 *
 * Configurable via:
 *   - `[columns]`    — AG Grid ColDef[]; consumers get full power.
 *   - `[rows]`       — row data.
 *   - `[config]`     — UltraSignal-side knobs (title, freeze, pagination, …).
 *   - `<ng-template usGridCell="myCol">` — per-column custom cell template.
 *
 * Outputs: `rowClick`, `addClick`, `selectionChange`, `filterChange`.
 */
@Component({
  selector: 'us-data-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* AG Grid sets its own classes inside the host DOM; ViewEncapsulation
   * is None so our CSS-variable overrides apply without endless ::ng-deep. */
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    AgGridAngular,
    ButtonDirective,
    OverlayPanelModule,
    CheckboxModule,
    Tooltip,
    Chip,
    UsSelectFieldComponent,
  ],
  templateUrl: './us-data-grid.component.html',
  styleUrls: ['./us-data-grid.component.scss'],
})
export class UsDataGridComponent<TData = unknown>
  implements OnChanges, AfterContentInit
{
  private readonly cdr = inject(ChangeDetectorRef);

  /* ── public API ─────────────────────────────────────── */

  @Input() columns: ColDef<TData>[] = [];
  @Input() rows: TData[] = [];
  @Input() config: UsDataGridConfig = {};

  /** Free-text search across every column. Two-way bound from the
   *  toolbar's quick-search input. */
  quickFilter = '';

  @Output() rowClick = new EventEmitter<TData>();
  @Output() addClick = new EventEmitter<void>();
  @Output() selectionChange = new EventEmitter<TData[]>();
  @Output() filterChange = new EventEmitter<Record<string, unknown>>();
  /** Emitted when the user clicks the toolbar Refresh button. The
   *  host owns the actual reload — this is just the signal. While
   *  the host is refreshing, set `[loading]="true"` to surface the
   *  spinner. */
  @Output() refresh = new EventEmitter<void>();
  /** True while the host is refreshing data — spinner + disabled
   *  refresh button. */
  @Input() loading = false;

  /** Custom cell template slot: `<ng-template usGridCell="myCol">`.
   *  Resolved at AfterContentInit into a colId → TemplateRef map and
   *  passed into `cellRenderer` via the cell-template wrapper. */
  @ContentChildren(UsGridCellDirective)
  cellTemplates!: QueryList<UsGridCellDirective>;
  templateMap = new Map<string, TemplateRef<unknown>>();

  /* ── internal state ─────────────────────────────────── */

  private gridApi?: GridApi<TData>;
  resolvedConfig = { ...US_DATA_GRID_DEFAULTS } as Required<
    typeof US_DATA_GRID_DEFAULTS
  > & {
    title?: string;
    addLabel?: string;
    gridKey?: string;
    quickFilters?: import('./us-data-grid.types').UsQuickFilterPreset[];
  };

  /** Active filters surfaced as removable chips above the grid. */
  filterChips: UsFilterChip[] = [];

  /** Column-chooser overlay state — flat list of every column with a
   *  visible flag the toggles bind to. Rebuilt whenever columns change
   *  or when the user reorders / hides via the AG Grid header menu. */
  columnList: {
    colId: string;
    headerLabel: string;
    visible: boolean;
    pinned: 'left' | 'right' | null;
  }[] = [];

  /* Add-Filter overlay state — derived from `columns` and exposed to
   * the template so the host doesn't have to construct these. */
  addFilterColumns: UsAddFilterColumn[] = [];
  addFilterSelectedColumn: UsAddFilterColumn | null = null;
  addFilterOperator = 'contains';
  addFilterValue = '';

  /** AG Grid options computed from `config` + `columns`. */
  gridOptions: GridOptions<TData> = {};

  /** Theme applied via the `[theme]` input on `<ag-grid-angular>`.
   *  Quartz with a warmer light scheme reads closest to the PrimeNG
   *  Aura defaults; further alignment is done via CSS variables in
   *  the SCSS. */
  readonly theme = themeQuartz.withPart(colorSchemeLightWarm);

  /* ── lifecycle ──────────────────────────────────────── */

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) this.resolveConfig();
    if (changes['columns'] || changes['config']) this.buildGridOptions();
  }

  ngAfterContentInit(): void {
    this.cellTemplates.changes.subscribe(() => this.rebuildTemplateMap());
    this.rebuildTemplateMap();
  }

  private rebuildTemplateMap(): void {
    this.templateMap = new Map(
      this.cellTemplates.toArray().map(d => [d.usGridCell, d.template]),
    );
    /* Templates landed after the initial buildGridOptions; rebuild
     * so the cellRenderer wiring picks them up. */
    if (this.columns?.length) this.buildGridOptions();
    this.cdr.markForCheck();
  }

  private resolveConfig(): void {
    this.resolvedConfig = {
      ...US_DATA_GRID_DEFAULTS,
      ...this.config,
      title: this.config.title,
      addLabel: this.config.addLabel,
      gridKey: this.config.gridKey,
      quickFilters: this.config.quickFilters,
    };
    /* SavedViews implicitly opts out when the consumer didn't set
     * a key — otherwise the toolbar would show a button that
     * persists nowhere. */
    if (!this.resolvedConfig.gridKey) {
      this.resolvedConfig.enableSavedViews = false;
    }
  }

  /**
   * Build the AG Grid options blob from the resolved config.
   *
   *   - `defaultColDef` carries the per-column behaviours the resolved
   *     config wants (resize / sort / floating filter).
   *   - The first column gets `pinned: 'left'` when `freezeFirstColumn`
   *     is on — mirrors the existing pFrozenColumn convention.
   *   - Row selection wires a `checkboxSelection` on the first column.
   */
  private buildGridOptions(): void {
    const cfg = this.resolvedConfig;

    const decoratedColumns: ColDef<TData>[] = (this.columns ?? []).map(
      (c, i) => {
        const colId = c.colId ?? c.field ?? `col-${i}`;
        const tpl = this.templateMap.get(String(colId));
        const next: ColDef<TData> = {
          ...c,
          /* Re-key undefined colIds so the column-chooser + custom
           * cell map can address every column deterministically. */
          colId,
          resizable: c.resizable ?? cfg.enableColumnResize,
          sortable: c.sortable ?? true,
          /* Floating filters default on; consumers can opt-out per
           * column by passing floatingFilter: false on the ColDef. */
          floatingFilter:
            c.floatingFilter ?? (cfg.showFloatingFilters && c.filter !== false),
          /* Sensible default filters when the caller didn't pin one. */
          filter:
            c.filter ?? (cfg.showFloatingFilters ? 'agTextColumnFilter' : false),
        };
        /* If the caller passed an <ng-template usGridCell="…">,
         * route AG Grid's cellRenderer through the bridge component
         * so the column renders inside the Angular template. */
        if (tpl && !c.cellRenderer) {
          next.cellRenderer = UsCellTemplateRendererComponent;
          next.cellRendererParams = {
            ...(c.cellRendererParams ?? {}),
            template: tpl,
          };
        }
        /* Default tooltip getter: show the formatted/raw value on
         * hover when the cell text is truncated. Skip the bridge-
         * rendered template columns (they render their own DOM and
         * a string tooltip would be wrong). */
        if (!c.tooltipValueGetter && !c.tooltipField && !tpl) {
          next.tooltipValueGetter = p => {
            const v = p.valueFormatted ?? p.value;
            return v === null || v === undefined ? '' : String(v);
          };
        }
        if (i === 0 && cfg.freezeFirstColumn) {
          next.pinned = c.pinned ?? 'left';
        }
        if (i === 0 && cfg.enableRowSelection) {
          next.checkboxSelection = true;
          next.headerCheckboxSelection = cfg.rowSelectionMode === 'multiple';
        }
        return next;
      },
    );

    this.gridOptions = {
      columnDefs: decoratedColumns,
      rowData: this.rows,
      animateRows: true,
      pagination: cfg.enablePagination,
      paginationPageSize: cfg.pageSize,
      paginationPageSizeSelector: cfg.pageSizeOptions,
      rowSelection: cfg.enableRowSelection ? cfg.rowSelectionMode : undefined,
      suppressMovableColumns: !cfg.enableColumnReorder,
      suppressRowClickSelection: false,
      /* Keep the column header's hamburger menu icon visible at all
       * times (not just on hover) so Pin Left / Pin Right / Hide
       * are discoverable. v32 default is hover-only, which users
       * miss. */
      suppressMenuHide: true,
      columnMenu: 'legacy',
      domLayout: 'normal',
      getRowId: cfg.rowIdField
        ? p => String((p.data as Record<string, unknown>)[cfg.rowIdField])
        : undefined,
      ...this.config.extraGridOptions,
    };

    this.addFilterColumns = decoratedColumns
      .filter(c => c.filter && c.filter !== false)
      .map(c => ({
        colId: String(c.colId),
        headerLabel: String(c.headerName ?? c.colId),
        filter:
          (typeof c.filter === 'string'
            ? c.filter
            : 'agTextColumnFilter') as UsAddFilterColumn['filter'],
      }));

    this.columnList = decoratedColumns.map(c => ({
      colId: String(c.colId),
      headerLabel: String(c.headerName ?? c.colId),
      visible: c.hide !== true,
      pinned:
        c.pinned === 'left' || c.pinned === true
          ? 'left'
          : c.pinned === 'right'
            ? 'right'
            : null,
    }));

    this.cdr.markForCheck();
  }

  /* ── AG Grid event handlers ──────────────────────────── */

  onGridReady(event: GridReadyEvent<TData>): void {
    this.gridApi = event.api;
    /* If the consumer set `gridKey`, restore the last-active saved
     * view from localStorage so the user returns to the same layout. */
    if (this.resolvedConfig.gridKey && this.resolvedConfig.enableSavedViews) {
      this.refreshSavedViewCatalogue();
      const lastUsed = this.storageRead(this.lastUsedKey());
      if (lastUsed) {
        const view = this.savedViews.find(v => v.name === lastUsed);
        if (view) this.applyView(view);
      }
    }
  }

  onFirstDataRendered(_event: FirstDataRenderedEvent<TData>): void {
    /* No auto-sizing on first render — per-column `width` /
     * `minWidth` win. Users can hit the toolbar's Auto-fit button
     * for content-based sizing. */
    this.refreshRowCounter();
  }

  onRowClicked(event: RowClickedEvent<TData>): void {
    if (event.data) this.rowClick.emit(event.data);
  }

  /** Selected row count — drives the bulk-action sticky bar. */
  selectedCount = 0;
  selectedRows: TData[] = [];

  onSelectionChanged(_event: SelectionChangedEvent<TData>): void {
    const selected = this.gridApi?.getSelectedRows() ?? [];
    this.selectedRows = selected;
    this.selectedCount = selected.length;
    this.selectionChange.emit(selected);
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.gridApi?.deselectAll();
  }

  onSortChanged(_event: SortChangedEvent): void {
    /* No-op for now — clients listen via gridOptions if they need it. */
  }

  onFilterChanged(_event: FilterChangedEvent<TData>): void {
    this.refreshFilterChips();
    this.refreshRowCounter();
    this.filterChange.emit(this.gridApi?.getFilterModel() ?? {});
  }

  /* ── toolbar handlers ──────────────────────────────── */

  onQuickFilterChange(value: string): void {
    this.quickFilter = value;
    this.gridApi?.setGridOption('quickFilterText', value);
  }

  onAddClick(): void {
    this.addClick.emit();
  }

  /** Toggle a column's visibility from the chooser overlay. */
  toggleColumnVisibility(colId: string, visible: boolean): void {
    this.gridApi?.setColumnsVisible([colId], visible);
    const row = this.columnList.find(c => c.colId === colId);
    if (row) row.visible = visible;
  }

  /** Reset every column to visible — used by the chooser's "Show all". */
  showAllColumns(): void {
    const ids = this.columnList.map(c => c.colId);
    this.gridApi?.setColumnsVisible(ids, true);
    this.columnList = this.columnList.map(c => ({ ...c, visible: true }));
  }

  /**
   * Freeze a column to the left/right or unfreeze. The pinned set is
   * a property of column state, so AG Grid restores it on saved-view
   * apply automatically.
   *
   *   pinned = 'left'  → column sticks to the left edge
   *   pinned = 'right' → column sticks to the right edge
   *   pinned = null    → unpinned, scrolls with the rest
   */
  pinColumn(colId: string, pinned: 'left' | 'right' | null): void {
    this.gridApi?.applyColumnState({
      state: [{ colId, pinned }],
    });
    const row = this.columnList.find(c => c.colId === colId);
    if (row) row.pinned = pinned;
    this.cdr.markForCheck();
  }

  /* ── add-filter overlay ──────────────────────────────── */

  /** Operator catalog per filter type. Mirrors the operators AG Grid's
   *  built-in column filters expose so applying via setFilterModel
   *  matches what the user would see in the floating filter row. */
  operatorsFor(filter: UsAddFilterColumn['filter'] | undefined): {
    label: string;
    value: string;
  }[] {
    switch (filter) {
      case 'agNumberColumnFilter':
        return [
          { label: 'Equals', value: 'equals' },
          { label: 'Not Equals', value: 'notEqual' },
          { label: 'Greater Than', value: 'greaterThan' },
          { label: 'Less Than', value: 'lessThan' },
          { label: 'In Range', value: 'inRange' },
        ];
      case 'agDateColumnFilter':
        return [
          { label: 'Equals', value: 'equals' },
          { label: 'Not Equals', value: 'notEqual' },
          { label: 'Before', value: 'lessThan' },
          { label: 'After', value: 'greaterThan' },
          { label: 'In Range', value: 'inRange' },
        ];
      case 'agTextColumnFilter':
      default:
        return [
          { label: 'Contains', value: 'contains' },
          { label: 'Not Contains', value: 'notContains' },
          { label: 'Equals', value: 'equals' },
          { label: 'Not Equals', value: 'notEqual' },
          { label: 'Starts With', value: 'startsWith' },
          { label: 'Ends With', value: 'endsWith' },
        ];
    }
  }

  applyAddFilter(panel: OverlayPanel): void {
    if (!this.addFilterSelectedColumn) return;
    const filterModel = this.gridApi?.getFilterModel() ?? {};
    const filterType =
      this.addFilterSelectedColumn.filter === 'agNumberColumnFilter'
        ? 'number'
        : this.addFilterSelectedColumn.filter === 'agDateColumnFilter'
          ? 'date'
          : 'text';
    filterModel[this.addFilterSelectedColumn.colId] = {
      filterType,
      type: this.addFilterOperator,
      filter: this.addFilterValue,
    };
    this.gridApi?.setFilterModel(filterModel);
    this.addFilterValue = '';
    panel.hide();
  }

  removeFilterChip(chip: UsFilterChip): void {
    const filterModel = this.gridApi?.getFilterModel() ?? {};
    delete filterModel[chip.colId];
    this.gridApi?.setFilterModel(filterModel);
  }

  clearAllFilters(): void {
    this.gridApi?.setFilterModel(null);
    this.gridApi?.setGridOption('quickFilterText', '');
    this.quickFilter = '';
  }

  /** Rebuild the visible chip row from AG Grid's current filter
   *  model. Called every time `onFilterChanged` fires so the chip
   *  list stays in sync with whatever the user did inside AG Grid's
   *  own filter UI. */
  private refreshFilterChips(): void {
    const model = this.gridApi?.getFilterModel() ?? {};
    const chips: UsFilterChip[] = [];
    for (const [colId, raw] of Object.entries(model)) {
      const col = this.addFilterColumns.find(c => c.colId === colId);
      const headerLabel = col?.headerLabel ?? colId;
      const v = raw as { type?: string; filter?: unknown };
      chips.push({
        colId,
        headerLabel,
        operator: v.type ?? 'matches',
        value: String(v.filter ?? ''),
      });
    }
    this.filterChips = chips;
  }

  /** Snapshot the current visible/order/sort/pin/width state so a
   *  consumer can persist it (e.g. to localStorage) and restore via
   *  applyColumnState. */
  getColumnState(): ColumnState[] {
    return this.gridApi?.getColumnState() ?? [];
  }

  applyColumnState(state: ColumnState[]): void {
    this.gridApi?.applyColumnState({ state, applyOrder: true });
  }

  /* ── density toggle ────────────────────────────────── */

  density: 'comfortable' | 'compact' = 'comfortable';

  toggleDensity(): void {
    this.density = this.density === 'comfortable' ? 'compact' : 'comfortable';
    /* AG Grid honours `rowHeight` + `headerHeight` set via grid
     * options; tweak via the API so existing rows reflow. */
    const rowH = this.density === 'compact' ? 28 : 40;
    const headerH = this.density === 'compact' ? 32 : 44;
    this.gridApi?.setGridOption('rowHeight', rowH);
    this.gridApi?.setGridOption('headerHeight', headerH);
    this.gridApi?.resetRowHeights();
  }

  /* ── auto-fit / CSV / row counter ───────────────────── */

  autoFitColumns(): void {
    const allCols = this.gridApi?.getColumns();
    if (!allCols) return;
    const ids = allCols
      .map(c => c.getColId())
      .filter(id => !!id);
    /* `skipHeader: false` means AG Grid considers the header text
     *  alongside cell values, so very short headers don't end up
     *  with overflowing data. */
    this.gridApi?.autoSizeColumns(ids, false);
  }

  exportCsv(): void {
    const filename = this.exportFileName('csv');
    this.gridApi?.exportDataAsCsv({ fileName: filename });
  }

  /**
   * Export visible rows as a real .xlsx file. AG Grid Community
   * doesn't ship xlsx export (Enterprise does), so we lean on the
   * `xlsx` (SheetJS) package the app already bundles. The export
   * honours current sort / filter / column order / visibility — we
   * pull rows in display order via the API.
   */
  async exportXlsx(): Promise<void> {
    if (!this.gridApi) return;
    const xlsx = await import('xlsx');
    const visibleCols = this.gridApi
      .getAllDisplayedColumns()
      .filter(c => c.getColId() !== 'actions');
    const headers = visibleCols.map(c =>
      String(c.getColDef().headerName ?? c.getColId()),
    );
    const rows: (string | number | null)[][] = [];
    this.gridApi.forEachNodeAfterFilterAndSort(node => {
      if (!node.data) return;
      const row = visibleCols.map(col => {
        const colDef = col.getColDef();
        const valueGetter = colDef.valueGetter;
        let raw: unknown;
        if (typeof valueGetter === 'function') {
          raw = valueGetter({
            data: node.data,
            node,
            colDef,
            column: col,
            api: this.gridApi!,
            context: undefined,
            getValue: () => undefined,
          } as never);
        } else if (colDef.field) {
          raw = (node.data as Record<string, unknown>)[colDef.field];
        } else {
          raw = undefined;
        }
        const formatter = colDef.valueFormatter;
        if (typeof formatter === 'function') {
          const formatted = formatter({
            value: raw,
            data: node.data,
            node,
            colDef,
            column: col,
            api: this.gridApi!,
            context: undefined,
          } as never);
          return formatted ?? '';
        }
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'number' || typeof raw === 'string') return raw;
        return String(raw);
      });
      rows.push(row);
    });
    const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    /* Auto-width per column — eyeballed against the longest cell. */
    worksheet['!cols'] = headers.map((h, i) => ({
      wch: Math.min(
        60,
        Math.max(
          h.length + 2,
          ...rows.map(r => String(r[i] ?? '').length + 2).slice(0, 200),
        ),
      ),
    }));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');
    xlsx.writeFile(workbook, this.exportFileName('xlsx'));
  }

  /** Toolbar Refresh handler — emits to the host, which owns the
   *  actual data reload. */
  onRefreshClick(): void {
    if (this.loading) return;
    this.refresh.emit();
  }

  /** Quick-filter preset state — id of the active chip (null when
   *  the user has edited the filter beyond a preset's snapshot). */
  activeQuickFilterId: string | null = null;

  applyQuickFilter(preset: import('./us-data-grid.types').UsQuickFilterPreset): void {
    if (!this.gridApi) return;
    if (this.activeQuickFilterId === preset.id) {
      /* Click again to clear. */
      this.gridApi.setFilterModel(null);
      this.gridApi.setGridOption('quickFilterText', '');
      this.quickFilter = '';
      this.activeQuickFilterId = null;
    } else {
      this.gridApi.setFilterModel(preset.filterModel);
      this.quickFilter = preset.quickFilter ?? '';
      this.gridApi.setGridOption('quickFilterText', this.quickFilter);
      this.activeQuickFilterId = preset.id;
    }
    this.refreshFilterChips();
    this.refreshRowCounter();
    this.cdr.markForCheck();
  }

  /** True when the grid has any filter applied. Drives the empty
   *  state copy. */
  get hasActiveFilters(): boolean {
    return this.filterChips.length > 0 || !!this.quickFilter;
  }

  /** Filename for CSV / XLSX exports, namespaced by grid title +
   *  today's date. */
  private exportFileName(ext: 'csv' | 'xlsx'): string {
    const base =
      (this.resolvedConfig.title || 'export')
        .toLowerCase()
        .replace(/\s+/g, '-') +
      '-' +
      new Date().toISOString().slice(0, 10);
    return `${base}.${ext}`;
  }

  /** Currently-visible row count for the toolbar counter. */
  visibleRowCount = 0;
  totalRowCount = 0;

  private refreshRowCounter(): void {
    if (!this.gridApi) return;
    this.totalRowCount = this.rows?.length ?? 0;
    this.visibleRowCount = this.gridApi.getDisplayedRowCount();
    this.cdr.markForCheck();
  }

  /* ── saved views ────────────────────────────────────── */

  savedViews: SavedGridView[] = [];
  activeViewName: string | null = null;
  newViewName = '';

  /** Whether the Views toolbar button should render. Disabled when
   *  the consumer didn't set `gridKey`. */
  get canShowViews(): boolean {
    return !!this.resolvedConfig.gridKey && this.resolvedConfig.enableSavedViews;
  }

  saveCurrentView(): void {
    if (!this.gridApi || !this.resolvedConfig.gridKey) return;
    const name = (this.newViewName || '').trim();
    if (!name) return;
    const view: SavedGridView = {
      name,
      columnState: this.gridApi.getColumnState(),
      filterModel: this.gridApi.getFilterModel() ?? {},
      quickFilter: this.quickFilter,
      density: this.density,
    };
    /* De-dupe by name — re-save overwrites. */
    const next = this.savedViews.filter(v => v.name !== name);
    next.push(view);
    this.savedViews = next;
    this.persistViews();
    this.storageWrite(this.lastUsedKey(), name);
    this.activeViewName = name;
    this.newViewName = '';
    this.cdr.markForCheck();
  }

  applyView(view: SavedGridView): void {
    if (!this.gridApi) return;
    this.gridApi.applyColumnState({ state: view.columnState, applyOrder: true });
    this.gridApi.setFilterModel(view.filterModel ?? null);
    this.quickFilter = view.quickFilter ?? '';
    this.gridApi.setGridOption('quickFilterText', this.quickFilter);
    if (view.density && view.density !== this.density) {
      this.toggleDensity();
    }
    this.activeViewName = view.name;
    if (this.resolvedConfig.gridKey) {
      this.storageWrite(this.lastUsedKey(), view.name);
    }
    /* Rebuild chip strip + visibility list from the restored state. */
    this.refreshFilterChips();
    this.columnList = this.columnList.map(c => ({
      ...c,
      visible:
        !view.columnState.find(s => s.colId === c.colId)?.hide,
    }));
    this.cdr.markForCheck();
  }

  deleteView(view: SavedGridView): void {
    this.savedViews = this.savedViews.filter(v => v.name !== view.name);
    this.persistViews();
    if (this.activeViewName === view.name) {
      this.activeViewName = null;
      this.storageWrite(this.lastUsedKey(), '');
    }
    this.cdr.markForCheck();
  }

  resetView(): void {
    if (!this.gridApi) return;
    this.gridApi.resetColumnState();
    this.gridApi.setFilterModel(null);
    this.gridApi.setGridOption('quickFilterText', '');
    this.quickFilter = '';
    this.activeViewName = null;
    if (this.resolvedConfig.gridKey) {
      this.storageWrite(this.lastUsedKey(), '');
    }
    this.refreshFilterChips();
    this.cdr.markForCheck();
  }

  /* localStorage keys keyed by gridKey. */
  private viewsKey(): string {
    return `us-data-grid:${this.resolvedConfig.gridKey}:views`;
  }
  private lastUsedKey(): string {
    return `us-data-grid:${this.resolvedConfig.gridKey}:last`;
  }

  private persistViews(): void {
    if (!this.resolvedConfig.gridKey) return;
    this.storageWrite(this.viewsKey(), JSON.stringify(this.savedViews));
  }

  private refreshSavedViewCatalogue(): void {
    if (!this.resolvedConfig.gridKey) {
      this.savedViews = [];
      return;
    }
    const raw = this.storageRead(this.viewsKey());
    if (!raw) {
      this.savedViews = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw) as SavedGridView[];
      this.savedViews = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.savedViews = [];
    }
  }

  /* localStorage shim — small typed helpers so the rest of the
   * component doesn't sprinkle try/catch on every read. */
  private storageRead(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  private storageWrite(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Storage quota / private mode → silently no-op. */
    }
  }

  /* ── *ngFor trackBy ──────────────────────────────── */
  trackByColId(_i: number, c: { colId: string }): string {
    return c.colId;
  }
  trackByViewName(_i: number, v: SavedGridView): string {
    return v.name;
  }
}

/**
 * One persisted snapshot of the grid's interactive state. Saved
 * under `us-data-grid:<gridKey>:views` in localStorage as a JSON
 * array; the active view name is stored separately so re-mounts
 * default to the user's last layout.
 */
export interface SavedGridView {
  name: string;
  columnState: ColumnState[];
  filterModel: Record<string, unknown>;
  quickFilter?: string;
  density?: 'comfortable' | 'compact';
}
