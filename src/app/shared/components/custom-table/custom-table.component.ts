import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
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

import { UsGridCellDirective } from '../us-data-grid/us-grid-cell.directive';
import { UsServerListAdapter } from '../us-data-grid/us-server-list-adapter';
import { UsPaginatorComponent } from '../us-paginator/us-paginator.component';
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
 * sort, and the shared server paginator below. No always-on floating-filter
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
    UsPaginatorComponent,
  ],
  templateUrl: './custom-table.component.html',
  styleUrls: ['./custom-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomTableComponent
  implements AfterContentInit, OnChanges, OnDestroy
{
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);

  @Input() columns: CustomTableColumn[] = [];
  @Input() serverAdapter?: UsServerListAdapter<Record<string, unknown>>;
  @Input() config: CustomTableConfig = {};

  /** Host owns the actual refresh action (re-fetch). */
  @Output() refresh = new EventEmitter<void>();

  /** Cell templates keyed by colId (usGridCell). */
  @ContentChildren(UsGridCellDirective)
  private cellDirectives!: QueryList<UsGridCellDirective>;
  private cellTemplates = new Map<string, TemplateRef<unknown>>();

  cfg = CUSTOM_TABLE_DEFAULTS as Required<CustomTableConfig>;
  globalSearch = '';
  showFilters = false;
  density: 'compact' | 'comfortable' = 'comfortable';
  /** Column visibility (colId → hidden). */
  hidden = new Set<string>();
  columnMenuItems: MenuItem[] = [];
  exportMenuItems: MenuItem[] = [];
  columnFilters: Record<string, unknown> = {};

  /** Accumulated rows across pages (scroll mode). In paginate mode we read
   *  the adapter's single page directly. */
  private accumulated: Record<string, unknown>[] = [];
  private loadedSub?: Subscription;

  private searchDebounce?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      const prevMode = this.cfg?.mode;
      this.cfg = {
        ...CUSTOM_TABLE_DEFAULTS,
        ...this.config,
      } as Required<CustomTableConfig>;
      this.density = this.cfg.density;
      this.restorePrefs();
      // Keep the adapter's page size in sync with the table's fetch size so
      // scroll pages / paginator pages match what the BE returns.
      if (this.serverAdapter && this.serverAdapter.limit() !== this.cfg.pageSize) {
        this.serverAdapter.setLimit(this.cfg.pageSize);
      }
      if (prevMode !== this.cfg.mode) this.resetAccumulated();
    }
    if (changes['serverAdapter']) this.bindAdapter();
    if (changes['columns']) this.buildColumnMenu();
    this.buildExportMenu();
  }

  /** Subscribe to the adapter's load stream so scroll mode can accumulate
   *  pages (append), resetting whenever a fresh page-1 load arrives (which the
   *  adapter triggers on any sort/filter/limit change). */
  private bindAdapter(): void {
    this.loadedSub?.unsubscribe();
    if (!this.serverAdapter) return;
    this.loadedSub = this.serverAdapter.loaded$.subscribe(res => {
      if (this.cfg.mode !== 'scroll') return;
      const rows = (res?.rows ?? []) as Record<string, unknown>[];
      if (this.serverAdapter!.page() <= 1) this.accumulated = [...rows];
      else this.accumulated = [...this.accumulated, ...rows];
      this.loadingMore = false;
      this.cdr.markForCheck();
    });
  }

  private resetAccumulated(): void {
    this.accumulated = [];
    this.loadingMore = false;
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

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.loadedSub?.unsubscribe();
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

  /** Rows to render — accumulated across pages in scroll mode, the current
   *  page in paginate mode. */
  get rows(): Record<string, unknown>[] {
    if (this.cfg.mode === 'scroll') return this.accumulated;
    return this.serverAdapter?.rows() ?? [];
  }
  get total(): number {
    return this.serverAdapter?.total() ?? 0;
  }
  get loading(): boolean {
    return this.serverAdapter?.loading() ?? false;
  }
  /** In scroll mode, are there more server rows beyond what's loaded? */
  get hasMore(): boolean {
    return this.cfg.mode === 'scroll' && this.accumulated.length < this.total;
  }
  get isScroll(): boolean {
    return this.cfg.mode === 'scroll';
  }
  get page(): number {
    return this.serverAdapter?.page() ?? 1;
  }
  get limit(): number {
    return this.serverAdapter?.limit() ?? this.cfg.pageSize;
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
    this.pushFilter();
  }

  /** Merge the global search + per-column filters into the adapter filter. */
  private pushFilter(): void {
    if (!this.serverAdapter) return;
    const f: Record<string, unknown> = {};
    const g = this.globalSearch.trim();
    if (g) f['search'] = g;
    for (const [k, v] of Object.entries(this.columnFilters)) {
      if (v !== null && v !== undefined && String(v).trim() !== '') f[k] = v;
    }
    this.serverAdapter.setFilter(f);
  }

  onPageChange(page: number): void {
    this.serverAdapter?.setPage(page);
  }
  onLimitChange(limit: number): void {
    this.serverAdapter?.setLimit(limit);
  }

  /** Fetch the next page (scroll mode). The loaded$ subscription appends it. */
  loadMore(): void {
    if (!this.serverAdapter || this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    this.serverAdapter.setPage(this.serverAdapter.page() + 1);
  }

  /** Signature of the sort currently applied to the server, so scroll-driven
   *  onLazyLoad events (which repeat the active sortField) don't re-trigger a
   *  sort + reset accumulation. Null = no sort. */
  private appliedSort: string | null = null;

  /**
   * p-table (lazy) fires onLazyLoad both when sorting AND — with virtual
   * scroll on — as the visible {first,last} window moves. We disambiguate:
   * if the (sortField,sortOrder) differs from what's applied, it's a real
   * sort (reset to page 1); otherwise it's a scroll → prefetch the next page
   * when the window nears the loaded tail.
   */
  onLazyLoad(e: {
    first?: number;
    last?: number;
    sortField?: string | string[] | null;
    sortOrder?: number | null;
  }): void {
    if (!this.serverAdapter) return;
    // Normalise p-table's sortField (string | string[] | null) to one field.
    const field = Array.isArray(e.sortField) ? e.sortField[0] : e.sortField;
    const order = e.sortOrder ?? undefined;
    const sig = field ? `${field}:${order ?? 1}` : null;
    if (sig !== this.appliedSort) {
      this.appliedSort = sig;
      this.onSort({ field: field ?? undefined, order });
      return;
    }
    if (this.cfg.mode !== 'scroll') return;
    const last = e.last ?? 0;
    // Prefetch when the window reaches the loaded tail.
    if (last >= this.accumulated.length - 1) this.loadMore();
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

  setDensity(d: 'compact' | 'comfortable'): void {
    this.density = d;
    this.persistPrefs();
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
      { label: 'Excel', icon: 'pi pi-file-excel', command: () => this.export('xls') },
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
    const mime = ext === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel';
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

  // ── density + column prefs persistence (optional, per gridKey) ────────────

  private prefsKey(): string | null {
    return this.cfg.gridKey ? `custom-table:${this.cfg.gridKey}` : null;
  }
  private persistPrefs(): void {
    const key = this.prefsKey();
    if (!key) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ density: this.density, hidden: [...this.hidden] }),
      );
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
      const p = JSON.parse(raw) as { density?: string; hidden?: string[] };
      if (p.density === 'compact' || p.density === 'comfortable')
        this.density = p.density;
      if (Array.isArray(p.hidden)) this.hidden = new Set(p.hidden);
    } catch {
      /* ignore */
    }
  }

  /** trackBy for rows. */
  trackRow = (_: number, row: Record<string, unknown>): unknown =>
    row[this.cfg.rowIdField] ?? row;
}
