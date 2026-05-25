import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { CONNECTION } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { ConnectionService } from '../../services/connection.service';

type ConnectionSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-connection',
  templateUrl: './list-connection.component.html',
  styleUrls: ['./list-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListConnectionComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  @ViewChild('dt') dt!: Table;

  // Pagination limit for connections
  limit = 10;
  lastTableLazyLoadEvent: any;

  users: any[] = [];

  searchTerm: string = '';
  selectedConnections: any[] = [];
  sortHelper = new ListSortHelper<ConnectionSortField>();
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';
  tabToDelete: string | null = null;
  Math = Math;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  today = new Date();

  statusOptions: any[] = [];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    dbUsername: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();

  // Signal refs from service
  connections = this.connectionService.connections;
  totalRecords = this.connectionService.total;
  loading = this.connectionService.loading;

  get selectedCount(): number {
    return this.selectedConnections?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.dbUsername ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private datasourceService: DatasourceService,
    private connectionService: ConnectionService,
    private router: Router,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadConnections();
      });

    this.loadDatasources();
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
    this.loadConnections();
  }

  onFilterChange() {
    this.selectedConnections = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      dbUsername: '',
      status: null,
      createdDateRange: null,
    };
    // Immediately reload without filters
    this.loadConnections();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatasources() {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService.listDatasource(params).then(
      response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.datasources = [...items];
          if (this.datasources.length > 0) {
            this.selectedDatasource = this.datasources[0].id;
            this.loadConnections();
          } else {
            this.selectedDatasource = null;
          }
        } else {
          this.selectedDatasource = null;
          this.datasources = [];
        }
        this.cdr.markForCheck();
      },
      () => {
        this.selectedDatasource = null;
        this.datasources = [];
        this.cdr.markForCheck();
      },
    );
  }

  toggleSort(field: ConnectionSortField) {
    this.sortHelper.toggle(field);
    this.selectedConnections = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
    }
    this.loadConnections(this.lastTableLazyLoadEvent);
  }

  async loadConnections(event?: any) {
    if (!this.selectedDatasource) return;

    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
        this.selectedConnections = [];
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

    // Build filter object like list-system-admin
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }
    if (this.filterValues.dbUsername) {
      filter.dbUsername = this.filterValues.dbUsername;
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

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    await this.connectionService.load(params);
    this.cdr.markForCheck();
  }

  onAddNewConnection() {
    this.router.navigate([CONNECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([CONNECTION.edit(id)]);
  }

  confirmDelete(id: string) {
    this.tabToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.tabToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.tabToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  async proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedConnections.map((c: any) => c.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      try {
        const res: any = await this.connectionService.bulkDelete(
          ids,
          reason,
        );
        if (this.globalService.handleSuccessService(res)) {
          this.selectedConnections = [];
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
        this.cdr.markForCheck();
      }
      return;
    }

    if (this.tabToDelete) {
      try {
        const response: any = await this.connectionService.delete(
          this.tabToDelete,
          reason,
        );
        if (this.globalService.handleSuccessService(response)) {
          this.selectedConnections = this.selectedConnections.filter(
            (c: any) => c.id !== this.tabToDelete,
          );
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
        this.cdr.markForCheck();
      }
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.tabToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadConnections(this.lastTableLazyLoadEvent);
    }
  }
}
