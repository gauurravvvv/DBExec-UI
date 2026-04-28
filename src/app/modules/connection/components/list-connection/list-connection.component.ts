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
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { ConnectionService } from '../../services/connection.service';

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
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';
  tabToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  datasources: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
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
    private organisationService: OrganisationService,
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

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatasources();
    }
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatasources();
        } else {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
        }
      }
      this.cdr.markForCheck();
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatasources();
  }

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
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(
      response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasources = [...(response.data.datasources || [])];
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

  async loadConnections(event?: any) {
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
        this.selectedConnections = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      datasourceId: this.selectedDatasource,
      page: page,
      limit: limit,
    };

    // Build filter object like list-super-admin
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

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    await this.connectionService.load(params);
    this.cdr.markForCheck();
  }

  onAddNewConnection() {
    this.router.navigate([CONNECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([CONNECTION.EDIT, this.selectedOrg, id]);
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
          this.selectedOrg,
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
          this.selectedOrg,
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

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadConnections(this.lastTableLazyLoadEvent);
    }
  }
}
