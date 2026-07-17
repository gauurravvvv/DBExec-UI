import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import {
  SavedQueriesService,
  SavedQuery,
} from '../../services/saved-queries.service';

/**
 * ListSavedQueriesComponent — the NEW Query Executor home. Replaces the
 * launcher landing: the user's private saved queries, listed in the same
 * shell as the connections list (h2 above a flat card, server-driven
 * custom-table, filter row, row actions, delete confirm popup).
 *
 * "New Query" opens a datasource → connection popup (NewQueryDialog) that
 * launches a blank executor tab. Clicking a saved query (or its Open
 * action) opens the executor tab preloaded with that query's SQL.
 */
@Component({
  selector: 'app-list-saved-queries',
  templateUrl: './list-saved-queries.component.html',
  styleUrls: ['./list-saved-queries.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSavedQueriesComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  queries: SavedQuery[] = [];

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE saved-queries list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'saved-queries-list',
    height: 'flex',
    rowIdField: 'id',
  };
  adapter: UsServerListAdapter<any> | null = null;

  // New-Query popup
  showNewQuery = false;

  // Delete confirm
  showDeleteConfirm = false;
  toDelete: SavedQuery | null = null;
  deleting = false;
  deleteJustification = '';

  constructor(
    private service: SavedQueriesService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cols = this.buildColumns();
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'QUERY_RUNNER.SAVED_QUERIES_SEARCH_PLACEHOLDER',
      ),
    };
    this.buildAdapter();
    this.adapter?.reload();
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '220px', frozen: true, filter: 'text' },
      { colId: 'description', field: 'description', header: t('COMMON.DESCRIPTION'), width: '260px', sortable: false },
      { colId: 'datasource', field: 'datasourceName', header: t('COMMON.DATASOURCE'), width: '170px' },
      { colId: 'connection', field: 'connectionName', header: t('QUERY_RUNNER.STEP_CONNECTION'), width: '170px', sortable: false },
      { colId: 'rowLimit', field: 'rowLimit', header: t('QUERY_RUNNER.ROW_LIMIT'), width: '110px', sortable: false },
      { colId: 'lastRun', field: 'lastRunAt', header: t('QUERY_RUNNER.LAST_RUN'), width: '150px' },
      { colId: 'updated', field: 'updatedOn', header: t('QUERY_RUNNER.UPDATED'), width: '150px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '110px', sortable: false },
    ];
  }

  /**
   * Server-side adapter. Each `load` sends page/limit/sort/filter to
   * `listSavedQueries(...)` which pages + filters + sorts server-side and
   * returns `{ count, queries }`. Default sort is newest-first (createdOn
   * DESC). `sortFieldMap` whitelists table colIds → BE sort keys.
   */
  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: p =>
        this.service
          .listSavedQueries({
            page: p.page,
            limit: p.limit,
            sort: p.sort,
            filter: p.filter,
          })
          .then(res => {
            const rows = res?.status ? (res.data?.queries ?? []) : [];
            this.queries = rows; // keep for any template refs
            return { rows, total: res?.data?.count ?? res?.data?.total ?? rows.length };
          }),
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      sortFieldMap: {
        name: 'name',
        datasource: 'datasourceName',
        updated: 'updatedOn',
        createdOn: 'createdOn',
      },
      // Newest-first by default (createdOn DESC). The grid has no
      // `createdOn` column, so this initial sort is purely the BE default.
      initial: {
        page: 1,
        limit: 50,
        sortModel: [{ colId: 'createdOn', sort: 'desc' }],
      },
    });
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  // ── New-Query popup ─────────────────────────────────────────────────

  openNewQuery(): void {
    this.showNewQuery = true;
    this.cdr.markForCheck();
  }

  closeNewQuery(): void {
    this.showNewQuery = false;
    this.cdr.markForCheck();
  }

  // ── row actions ─────────────────────────────────────────────────────

  /**
   * Name click → the read-only View page.
   */
  onView(q: SavedQuery): void {
    this.router.navigate([QUERY_RUNNER.savedQueryView(q.id)]);
  }

  /**
   * Edit (✏) → open the query in the standalone SQL editor / executor tab
   * (SQL + rowLimit preloaded). This is where a saved query is actually
   * edited — the executor, not a metadata form.
   */
  onEdit(q: SavedQuery): void {
    const url = QUERY_RUNNER.EXEC_SAVED(q.connectionId, q.id);
    window.open(url, '_blank');
  }

  confirmDelete(q: SavedQuery): void {
    this.toDelete = q;
    this.deleteJustification = '';
    this.showDeleteConfirm = true;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDelete = null;
    this.deleteJustification = '';
    this.cdr.markForCheck();
  }

  proceedDelete(): void {
    if (!this.toDelete || !this.deleteJustification.trim()) return;
    this.deleting = true;
    this.cdr.markForCheck();
    const id = this.toDelete.id;
    this.service
      .deleteSavedQuery(id, this.deleteJustification.trim())
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.adapter?.reload();
          this.cancelDelete();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }
}
