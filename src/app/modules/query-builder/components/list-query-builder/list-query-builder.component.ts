import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { QueryBuilderService } from '../../services/query-builder.service';

@Component({
  selector: 'app-list-query-builder',
  templateUrl: './list-query-builder.component.html',
  styleUrls: ['./list-query-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListQueryBuilderComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  // Pagination limit for query builders
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredQueryBuilders: any[] = [];

  selectedQueryBuilders: any[] = [];
  searchTerm: string = '';
  showDeleteConfirm = false;
  queryBuilderToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  queryBuilders: any[] = [];
  selectedDatasource: any = null;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private destroyRef = inject(DestroyRef);

  get selectedCount(): number {
    return this.selectedQueryBuilders?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadQueryBuilders();
      });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['datasourceId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          this.loadDatasources();
        }
      });
  }

  handleDeepLinking(params: any) {
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
    const name = params['name'];

    if (name) {
      this.filterValues.name = name;
    }

    if (datasourceId) {
      this.loadDatasources(datasourceId);
    } else {
      this.loadDatasources();
    }
  }

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.loadQueryBuilders();
  }

  loadDatasources(preSelectedDbId?: string): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: 10,
      };

      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const items = response?.data?.datasources ?? [];
            this.preloadedDatasources = items;
            this.preloadedDatasourcesTotal =
              response?.data?.count ?? items.length;
            this.datasources = [...items];
            if (this.datasources.length > 0) {
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
              this.loadQueryBuilders();
            } else {
              this.selectedDatasource = null;
              this.queryBuilders = [];
              this.filteredQueryBuilders = [];
              this.totalRecords = 0;
            }
          } else {
            this.datasources = [];
            this.selectedDatasource = null;
            this.queryBuilders = [];
            this.filteredQueryBuilders = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.datasources = [];
          this.selectedDatasource = null;
          this.queryBuilders = [];
          this.filteredQueryBuilders = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadQueryBuilders(event?: any) {
    if (!this.selectedDatasource) return;

    // Clear selection when page/sort changes
    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (
        prev &&
        (prev.first !== event.first ||
          prev.rows !== event.rows ||
          prev.sortField !== event.sortField ||
          prev.sortOrder !== event.sortOrder)
      ) {
        this.selectedQueryBuilders = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      datasourceId: this.selectedDatasource,
      page: page,
      limit: limit,
    };

    // Build filter object
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.createdDateRange?.[0]) {
      filter.createdDateFrom =
        this.filterValues.createdDateRange[0].toISOString();
    }
    if (this.filterValues.createdDateRange?.[1]) {
      const dateTo = new Date(this.filterValues.createdDateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.createdDateTo = dateTo.toISOString();
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.queryBuilderService
      .listQueryBuilder(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilders = response.data?.queryBuilders || [];
          this.filteredQueryBuilders = [...this.queryBuilders];
          this.totalRecords = response.data?.count || this.queryBuilders.length;
        } else {
          this.queryBuilders = [];
          this.filteredQueryBuilders = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.queryBuilders = [];
        this.filteredQueryBuilders = [];
        this.totalRecords = 0;
      });
  }

  onFilterChange() {
    this.selectedQueryBuilders = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    this.selectedQueryBuilders = [];
    this.loadQueryBuilders();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  onAddNewQueryBuilder() {
    this.router.navigate([QUERY_BUILDER.ADD]);
  }

  // Not used but kept for reference if direct edit without object is needed
  onEdit(id: string) {
    this.router.navigate([QUERY_BUILDER.edit(id)]);
  }

  confirmDelete(id: string) {
    this.queryBuilderToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.queryBuilderToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.queryBuilderToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedQueryBuilders.map(q => q.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.queryBuilderService
        .bulkDeleteQueryBuilder(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedQueryBuilders = [];
            this.refreshList();
          }
        })
        .catch(() => {})
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.queryBuilderToDelete) {
      this.queryBuilderService
        .deleteQueryBuilder(this.queryBuilderToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedQueryBuilders = this.selectedQueryBuilders.filter(
              q => q.id !== this.queryBuilderToDelete,
            );
            this.refreshList();
          }
        })
        .catch(() => {})
        .finally(() => this.closeDeletePopup());
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.queryBuilderToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadQueryBuilders(this.lastTableLazyLoadEvent);
    } else {
      this.loadQueryBuilders();
    }
  }

  onEditQueryBuilder(queryBuilder: any) {
    this.router.navigate([QUERY_BUILDER.edit(queryBuilder.id)]);
  }

  onConfig(id: string) {
    this.router.navigate([
      QUERY_BUILDER.configure(this.selectedDatasource, id),
    ]);
  }

  onExecute(id: string) {
    this.router.navigate([QUERY_BUILDER.run(this.selectedDatasource, id)]);
  }
}
