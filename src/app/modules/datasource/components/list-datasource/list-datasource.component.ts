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
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { DatasourceService } from '../../services/datasource.service';

type DatasourceSortField = 'name' | 'type' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-datasource',
  templateUrl: './list-datasource.component.html',
  styleUrls: ['./list-datasource.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDatasourceComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  @ViewChild('dt') dt!: Table;

  // Bound directly to service signals — no local copies
  datasources = this.datasourceService.datasources;
  total = this.datasourceService.total;
  loading = this.datasourceService.loading;

  listParams: any = {
    limit: 10,
    page: 1,
  };

  private searchSubject = new Subject<void>();
  lastTableLazyLoadEvent: any;

  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatasource: any = null;
  selectedDatasources: any[] = [];
  sortHelper = new ListSortHelper<DatasourceSortField>();
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';

  constructor(
    private datasourceService: DatasourceService,
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

    // Setup debounce for filter changes
    this.searchSubject
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.lastTableLazyLoadEvent) {
          this.loadDatasources(this.lastTableLazyLoadEvent);
        }
      });
  }

  today = new Date();

  statusOptions: any[] = [];

  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    this.onFilterChange();
  }

  get selectedCount(): number {
    return this.selectedDatasources?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  onFilterChange() {
    this.selectedDatasources = [];
    this.searchSubject.next();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  toggleSort(field: DatasourceSortField) {
    this.sortHelper.toggle(field);
    this.selectedDatasources = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
      this.loadDatasources(this.lastTableLazyLoadEvent);
    }
  }

  loadDatasources(event: any) {
    if (!event) return;
    const prev = this.lastTableLazyLoadEvent;
    if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
      this.selectedDatasources = [];
    }
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;

    this.listParams.page = page;
    this.listParams.limit = limit;

    this.listDatasourceAPI();
  }

  listDatasourceAPI() {
    const params: any = {
      page: this.listParams.page,
      limit: this.listParams.limit,
    };

    let filter: any = {};
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.description)
      filter.description = this.filterValues.description;
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

    this.datasourceService.load(params);
  }

  onAddNewDatasource() {
    this.router.navigate([DATASOURCE.ADD]);
  }

  onEdit(db: any) {
    this.router.navigate([DATASOURCE.edit(db.id)]);
  }

  confirmDelete(datasource: any): void {
    this.selectedDatasource = datasource;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.selectedDatasource = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  async proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDatasources.map((d: any) => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      try {
        const res: any = await this.datasourceService.bulkDelete(
          ids,
          reason,
        );
        if (this.globalService.handleSuccessService(res)) {
          this.selectedDatasources = [];
          this.cdr.markForCheck();
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
      }
      return;
    }

    if (this.selectedDatasource) {
      try {
        const response: any = await this.datasourceService.delete(
          this.selectedDatasource.id,
          reason,
        );
        if (this.globalService.handleSuccessService(response)) {
          this.selectedDatasources = this.selectedDatasources.filter(
            (d: any) => d.id !== this.selectedDatasource.id,
          );
          this.cdr.markForCheck();
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
      }
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
    this.cdr.markForCheck();
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadDatasources(this.lastTableLazyLoadEvent);
    }
  }
}
