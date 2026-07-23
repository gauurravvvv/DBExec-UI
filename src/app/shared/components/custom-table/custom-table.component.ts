import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

import { SharedModule } from '../../shared.module';
import { UsGridCellDirective } from '../us-data-grid/us-grid-cell.directive';
import { UsServerListAdapter } from '../us-data-grid/us-server-list-adapter';
import { CustomTableEmptyDirective } from './custom-table-empty.directive';
import {
  CustomTableColumn,
  CustomTableConfig,
  CUSTOM_TABLE_DEFAULTS,
} from './custom-table.types';

/**
 * app-custom-table — the app's UNIFIED, SIMPLE data table.
 *
 * A thin, opinionated PrimeNG p-table wrapper that deliberately shows a CLEAN
 * default surface: a single toolbar row (global search + a compact cluster of
 * ONLY the enabled secondary actions), a sticky-header table with single-column
 * sort, and a quiet row-count footer below. The table is ALWAYS
 * infinite-scroll (lazy-loading the next 50-row batch as the body nears the
 * bottom) — there is no page-number paginator. No always-on floating-filter
 * row, no chip rows, no Views — the noise the old AG-Grid wrapper carried.
 *
 * Mirrors the `us-data-grid` call-site API so migration is minimal:
 *   <app-custom-table [columns]="cols" [serverAdapter]="adapter" [config]="cfg"
 *                     (refresh)="reload()">
 *     <ng-template usGridCell="name" let-row> … </ng-template>
 *   </app-custom-table>
 *
 * - Reuses the shared `UsGridCellDirective` (usGridCell) verbatim — every
 *   consumer's cell templates carry over unchanged; a column with no template
 *   renders row[field].
 * - Reuses `UsServerListAdapter` unchanged — p-table's lazy sort + this
 *   component's toolbar/paginator all drive the SAME adapter
 *   ({page,limit,sort,filter} → {rows,total}).
 */
@Component({
  selector: 'app-custom-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    TableModule,
    ButtonModule,
    TooltipModule,
    MenuModule,
    // Shared form controls (app-custom-input / -dropdown) for the search box
    // and per-column filters, so the table's inputs match the app everywhere.
    SharedModule,
    CustomTableEmptyDirective,
  ],
  templateUrl: './custom-table.component.html',
  styleUrls: ['./custom-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomTableComponent
  implements AfterContentInit, AfterViewInit, OnChanges, OnDestroy
{
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private zone = inject(NgZone);

  /** The p-table's scroll body, wired for plain infinite scroll. */
  private scrollBody?: HTMLElement;
  private scrollHandler?: (e: Event) => void;

  @Input() columns: CustomTableColumn[] = [];
  @Input() serverAdapter?: UsServerListAdapter<Record<string, unknown>>;
  @Input() config: CustomTableConfig = {};

  /**
   * Host-owned base filter slice merged into every server request (e.g. a
   * segmented Type control, a datasource scope). The table's own global search
   * + per-column filters are merged ON TOP, so there's a SINGLE writer of the
   * adapter filter (no clobbering). Set a new object to apply.
   */
  @Input() baseFilter: Record<string, unknown> = {};

  /** Host owns the actual refresh action (re-fetch). */
  @Output() refresh = new EventEmitter<void>();

  /**
   * Emits the currently-selected ROW OBJECTS (not just ids) whenever the
   * selection changes — the consumer gets full rows so it has per-row context
   * (e.g. assetType/id for a migration export). Only fires when
   * `config.selectable` is true. Emits `[]` on clear.
   */
  @Output() selectionChange = new EventEmitter<Record<string, unknown>[]>();

  /** Cell templates keyed by colId (usGridCell). */
  @ContentChildren(UsGridCellDirective)
  private cellDirectives!: QueryList<UsGridCellDirective>;
  private cellTemplates = new Map<string, TemplateRef<unknown>>();

  /** Set true by hosts that project a [tableEmpty] body, to suppress the
   *  built-in default empty message (otherwise the two stack). Auto-detection
   *  via @ContentChild(ren) is unreliable here: the projected element lives
   *  inside the p-table's `emptymessage` template (a lazily-instantiated
   *  embedded view), which content queries don't track. An explicit input is
   *  deterministic. */
  @Input() hasProjectedEmpty = false;

  cfg = CUSTOM_TABLE_DEFAULTS as Required<CustomTableConfig>;
  globalSearch = '';
  showFilters = false;
  /** Column visibility (colId → hidden). */
  hidden = new Set<string>();
  columnMenuItems: MenuItem[] = [];
  exportMenuItems: MenuItem[] = [];
  columnFilters: Record<string, unknown> = {};

  /**
   * Row selection (opt-in via `config.selectable`). Keyed by the row's
   * `rowIdField` so it PERSISTS across infinite-scroll appends and page-1
   * re-sorts/filters (a picked row stays picked by id). Holds the row OBJECT
   * so the consumer gets full context on emit.
   */
  private selected = new Map<unknown, Record<string, unknown>>();

  /** Accumulated rows across scroll pages (append as each batch arrives). */
  private accumulated: Record<string, unknown>[] = [];
  private loadedSub?: Subscription;

  private searchDebounce?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.cfg = {
        ...CUSTOM_TABLE_DEFAULTS,
        ...this.config,
      } as Required<CustomTableConfig>;
      this.restorePrefs();
      // Keep the adapter's page size in sync with the table's fetch size so
      // each scroll batch matches what the BE returns.
      if (
        this.serverAdapter &&
        this.serverAdapter.limit() !== this.cfg.pageSize
      ) {
        this.serverAdapter.setLimit(this.cfg.pageSize);
      }
    }
    if (changes['serverAdapter']) this.bindAdapter();
    if (changes['columns']) this.buildColumnMenu();
    // Host changed the base filter (e.g. Type chip) → re-run with it merged.
    // Skip the very first change (adapter's own initial load covers it).
    if (changes['baseFilter'] && !changes['baseFilter'].firstChange) {
      this.pushFilter();
    }
    this.buildExportMenu();
  }

  /** Subscribe to the adapter's load stream so scroll mode can accumulate
   *  pages (append), resetting whenever a fresh page-1 load arrives (which the
   *  adapter triggers on any sort/filter/limit change). */
  private bindAdapter(): void {
    this.loadedSub?.unsubscribe();
    if (!this.serverAdapter) return;
    this.loadedSub = this.serverAdapter.loaded$.subscribe(res => {
      const rows = (res?.rows ?? []) as Record<string, unknown>[];
      if (this.serverAdapter!.page() <= 1) this.accumulated = [...rows];
      else this.accumulated = [...this.accumulated, ...rows];
      this.loadingMore = false;
      this.cdr.markForCheck();
    });
    // Trigger the FIRST fetch. The adapter's constructor only seeds state — it
    // does NOT self-load (the old us-data-grid fired the initial load itself).
    // Fetch now unless a load is already in flight / rows are present, so every
    // list populates on open without the host having to call reload().
    if (!this.serverAdapter.loading() && this.serverAdapter.total() === 0) {
      this.serverAdapter.reload();
    }
  }

  ngAfterContentInit(): void {
    const index = () => {
      this.cellTemplates.clear();
      this.cellDirectives?.forEach(d =>
        this.cellTemplates.set(d.usGridCell, d.template),
      );
      this.cdr.markForCheck();
    };
    index();
    this.cellDirectives.changes.subscribe(index);
  }

  /** Attach the infinite-scroll listener to the p-table's scroll body. Runs
   *  outside Angular's zone (scroll fires constantly); loadMore() re-enters
   *  the zone only when it actually fetches. */
  ngAfterViewInit(): void {
    // PrimeNG creates the scroll container asynchronously; grab it next tick.
    setTimeout(() => this.attachScroll(), 0);
  }

  private attachScroll(): void {
    const el = this.host.nativeElement.querySelector(
      '.ct-p-table .p-datatable-wrapper',
    ) as HTMLElement | null;
    if (!el) return;
    this.scrollBody = el;
    this.scrollHandler = () => {
      const nearBottom =
        el.scrollTop + el.clientHeight >=
        el.scrollHeight - this.cfg.rowHeight * 3;
      if (nearBottom) this.zone.run(() => this.loadMore());
    };
    this.zone.runOutsideAngular(() =>
      el.addEventListener('scroll', this.scrollHandler!, { passive: true }),
    );
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.loadedSub?.unsubscribe();
    if (this.scrollBody && this.scrollHandler)
      this.scrollBody.removeEventListener('scroll', this.scrollHandler);
  }

  /** True while a scroll-triggered "next page" fetch is in flight. */
  loadingMore = false;

  /** Columns the table actually renders (respecting show/hide). */
  get visibleColumns(): CustomTableColumn[] {
    return this.columns.filter(c => !this.hidden.has(c.colId));
  }

  /** Whether the toolbar has any right-side action beyond search. */
  get hasSecondaryActions(): boolean {
    // Refresh is always present, so the right cluster always renders.
    return true;
  }

  templateFor(colId: string): TemplateRef<unknown> | null {
    return this.cellTemplates.get(colId) ?? null;
  }

  /** Rows to render — accumulated across scroll batches. */
  get rows(): Record<string, unknown>[] {
    return this.accumulated;
  }
  get total(): number {
    return this.serverAdapter?.total() ?? 0;
  }
  get loading(): boolean {
    return this.serverAdapter?.loading() ?? false;
  }
  /** Are there more server rows beyond what's loaded so far? */
  get hasMore(): boolean {
    return this.accumulated.length < this.total;
  }

  /** Show the column header (and filter row) when there's data, while a fetch
   *  is in flight, OR whenever a filter/search is active or the filter row is
   *  open. The last cases are critical: if a filter narrows to zero rows we
   *  must KEEP the header + filter inputs visible so the user can edit or
   *  clear what they typed — otherwise they'd be stranded on "No records"
   *  with no way back. Only a truly pristine empty table hides the header. */
  get showHeader(): boolean {
    return (
      this.rows.length > 0 ||
      this.loading ||
      this.showFilters ||
      this.hasActiveFilter
    );
  }

  /** Any column filter or global search currently has a value. */
  get hasActiveFilter(): boolean {
    if (this.globalSearch.trim()) return true;
    return Object.values(this.columnFilters).some(
      v => v !== null && v !== undefined && String(v).trim() !== '',
    );
  }

  /** p-table scrollHeight — 'flex' makes the table fill its (bounded) flex
   *  parent, adapting to any screen size; otherwise a fixed CSS length. */
  get scrollHeight(): string {
    return this.cfg.height === 'flex' ? 'flex' : this.cfg.height;
  }

  colStyle(c: CustomTableColumn): Record<string, string> {
    const s: Record<string, string> = {};
    if (c.width) {
      s['width'] = c.width;
      s['min-width'] = c.width;
    }
    return s;
  }

  align(c: CustomTableColumn): 'left' | 'right' | 'center' {
    return c.align ?? (c.numeric ? 'right' : 'left');
  }

  // ── server wiring ───────────────────────────────────────────────────────

  /** p-table single-column sort → adapter. `sortField` is the column's
   *  `field`/`colId`; translate it back to the adapter's colId. No field ⇒
   *  the initial (unsorted) lazy event — leave the adapter's sort untouched. */
  onSort(e: { field?: string; order?: number }): void {
    if (!this.serverAdapter || !e.field) return;
    const col = this.columns.find(c => (c.field ?? c.colId) === e.field);
    const colId = col?.colId ?? e.field;
    this.serverAdapter.setSort(
      e.order === 0 ? [] : [{ colId, sort: e.order === -1 ? 'desc' : 'asc' }],
    );
  }

  onGlobalSearch(value: string): void {
    this.globalSearch = value;
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.pushFilter(), 300);
  }

  onColumnFilter(colId: string, value: unknown): void {
    this.columnFilters[colId] = value;
    // Debounce like the global search so typing doesn't fire a call per key.
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.pushFilter(), 300);
  }

  /** Merge host baseFilter + global search + per-column filters into ONE
   *  adapter filter (single writer — no clobbering between the host's controls
   *  and the table's own). */
  private pushFilter(): void {
    if (!this.serverAdapter) return;
    const f: Record<string, unknown> = { ...(this.baseFilter ?? {}) };
    const g = this.globalSearch.trim();
    if (g) f[this.cfg.globalSearchKey] = g;
    for (const [k, v] of Object.entries(this.columnFilters)) {
      if (v !== null && v !== undefined && String(v).trim() !== '') f[k] = v;
    }
    this.serverAdapter.setFilter(f);
  }

  /** Fetch the next page (scroll batch). The loaded$ subscription appends it. */
  loadMore(): void {
    if (!this.serverAdapter || this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    this.serverAdapter.setPage(this.serverAdapter.page() + 1);
  }

  /** Signature of the sort currently applied to the server, so a repeated
   *  onLazyLoad for the same sort doesn't reset accumulation. Null = no sort. */
  private appliedSort: string | null = null;

  /**
   * p-table (lazy) fires onLazyLoad on sort. We're NOT virtualised (plain
   * infinite scroll — see onScroll), so this only handles sort changes: when
   * the (sortField,sortOrder) differs from what's applied, re-sort (resets to
   * page 1). Same sort → ignore.
   */
  onLazyLoad(e: {
    sortField?: string | string[] | null;
    sortOrder?: number | null;
  }): void {
    if (!this.serverAdapter) return;
    const field = Array.isArray(e.sortField) ? e.sortField[0] : e.sortField;
    const order = e.sortOrder ?? undefined;
    const sig = field ? `${field}:${order ?? 1}` : null;
    if (sig === this.appliedSort) return;
    this.appliedSort = sig;
    this.onSort({ field: field ?? undefined, order });
  }

  // ── toolbar secondary actions ─────────────────────────────────────────────

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.columnFilters = {};
      this.pushFilter();
    }
  }

  get hasColumnFilters(): boolean {
    return this.columns.some(c => c.filter);
  }

  toggleColumn(colId: string): void {
    if (this.hidden.has(colId)) this.hidden.delete(colId);
    else this.hidden.add(colId);
    this.persistPrefs();
    this.buildColumnMenu();
  }

  private buildColumnMenu(): void {
    this.columnMenuItems = this.columns
      .filter(c => c.colId !== 'actions')
      .map(c => ({
        label: c.header,
        icon: this.hidden.has(c.colId) ? 'pi pi-eye-slash' : 'pi pi-eye',
        command: () => this.toggleColumn(c.colId),
      }));
  }

  private buildExportMenu(): void {
    this.exportMenuItems = [
      { label: 'CSV', icon: 'pi pi-file', command: () => this.export('csv') },
      {
        label: 'Excel',
        icon: 'pi pi-file-excel',
        command: () => this.export('xls'),
      },
    ];
  }

  /** Export the CURRENT page's rows (server-paged — we export what's loaded).
   *  Cell templates aren't serialisable, so we fall back to row[field]. */
  private export(ext: 'csv' | 'xls'): void {
    const cols = this.visibleColumns.filter(c => c.colId !== 'actions');
    const header = cols.map(c => c.header);
    const body = this.rows.map(r =>
      cols.map(c => {
        const v = r[c.field ?? c.colId];
        return v == null ? '' : String(v);
      }),
    );
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [header, ...body]
      .map(line => line.map(esc).join(','))
      .join('\n');
    const mime =
      ext === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel';
    const url = URL.createObjectURL(new Blob([csv], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(this.cfg.title || 'export').replace(/[^A-Za-z0-9_-]+/g, '_')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  doRefresh(): void {
    this.refresh.emit();
  }

  // ── column-visibility prefs persistence (optional, per gridKey) ───────────

  private prefsKey(): string | null {
    return this.cfg.gridKey ? `custom-table:${this.cfg.gridKey}` : null;
  }
  private persistPrefs(): void {
    const key = this.prefsKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ hidden: [...this.hidden] }));
    } catch {
      /* storage disabled */
    }
  }
  private restorePrefs(): void {
    const key = this.prefsKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const p = JSON.parse(raw) as { hidden?: string[] };
      if (Array.isArray(p.hidden)) this.hidden = new Set(p.hidden);
    } catch {
      /* ignore */
    }
  }

  /** trackBy for rows. */
  trackRow = (_: number, row: Record<string, unknown>): unknown =>
    row[this.cfg.rowIdField] ?? row;

  // ── row selection (opt-in via config.selectable) ──────────────────────────

  /** The row's identity value (used as the selection map key). */
  private rowId(row: Record<string, unknown>): unknown {
    return row[this.cfg.rowIdField] ?? row;
  }

  /** True when the given row is currently selected. */
  isSelected(row: Record<string, unknown>): boolean {
    return this.selected.has(this.rowId(row));
  }

  /** Toggle one row's selection (per-row checkbox). */
  toggleRow(row: Record<string, unknown>, checked: boolean): void {
    const id = this.rowId(row);
    if (checked) this.selected.set(id, row);
    else this.selected.delete(id);
    this.emitSelection();
  }

  /**
   * True when EVERY currently-loaded row is selected (drives the header
   * checkbox). False for an empty table. "All" here means the loaded rows
   * only — the table never holds the full server set (infinite scroll).
   */
  get allLoadedSelected(): boolean {
    return this.rows.length > 0 && this.rows.every(r => this.isSelected(r));
  }

  /** True when some — but not all — loaded rows are selected. */
  get someLoadedSelected(): boolean {
    return this.selected.size > 0 && !this.allLoadedSelected;
  }

  /**
   * Header "select all" — selects (or clears) ONLY the currently-loaded rows.
   * Rows loaded by a later scroll batch are not auto-selected; the user
   * re-toggles as more load. Honest by design (see the header tooltip).
   */
  toggleAllLoaded(checked: boolean): void {
    if (checked) {
      for (const r of this.rows) this.selected.set(this.rowId(r), r);
    } else {
      // Clear only the loaded rows (any off-screen picks stay — but in
      // practice all picks come from loaded rows, so this clears everything
      // the user can currently see).
      for (const r of this.rows) this.selected.delete(this.rowId(r));
    }
    this.emitSelection();
  }

  /** The selected row objects (stable array snapshot for the consumer). */
  get selectedRows(): Record<string, unknown>[] {
    return [...this.selected.values()];
  }

  /** Number of selected rows (for the toolbar count). */
  get selectedCount(): number {
    return this.selected.size;
  }

  /** Clear the whole selection — called by the host after a bulk action. */
  clearSelection(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.emitSelection();
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selectedRows);
    this.cdr.markForCheck();
  }
}
