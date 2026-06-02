import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { IParams } from 'src/app/core/models/global.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { OrganisationService } from '../../services/organisation.service';

type OrgSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListOrganisationComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.organisationService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  @ViewChild('dt') dt!: Table;
  Math = Math;

  // Params to fetch all for client-side handling
  listParams: IParams = {
    limit: 10,
    pageNumber: 1,
  };

  private searchSubject = new Subject<void>();
  lastTableLazyLoadEvent: any;

  orgs = this.organisationService.orgs;
  total = this.organisationService.total;
  loading = this.organisationService.loading;

  selectedOrgs: any[] = [];

  // Multi-column sort helper — click order is precedence. Default (empty chain)
  // lets BE apply its own default (createdOn DESC). See list-sort.helper.ts.
  sortHelper = new ListSortHelper<OrgSortField>();

  showDeleteConfirm = false;
  orgIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    // Setup debounce for filter changes
    this.searchSubject
      .pipe(debounceTime(500))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.listParams.pageNumber = 1;
        this.loadOrganisations(this.lastTableLazyLoadEvent);
      });
  }

  today = new Date();

  statusOptions: { label: string; value: number }[] = [];

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

  onFilterChange() {
    this.selectedOrgs = [];
    this.searchSubject.next();
  }

  get selectedCount(): number {
    return this.selectedOrgs?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  // Click a sortable header — delegates to the helper, then re-loads page 1
  // because re-ordering shifts which rows live on which page.
  toggleSort(field: OrgSortField) {
    this.sortHelper.toggle(field);
    this.selectedOrgs = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
      this.loadOrganisations(this.lastTableLazyLoadEvent);
    }
  }

  loadOrganisations(event: any) {
    const prev = this.lastTableLazyLoadEvent;
    if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
      // Page or page-size change wipes the cross-page selection — selections aren't
      // preserved across server-paginated boundaries. Sort changes clear selection
      // separately in toggleSort().
      this.selectedOrgs = [];
    }
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;

    const params: any = {
      page,
      limit,
    };

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    const filter: any = {};

    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
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
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.organisationService.load(params);
  }

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.edit(org.id)]);
  }

  confirmDelete(orgId: string) {
    this.orgIdToDelete = orgId;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.orgIdToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedOrgs.map(o => o.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      // Use the signal-based `bulkDelete` so the service stamps each
      // selected id into `_deleting` — the template can light up a
      // per-row spinner via `orgService.isDeleting(id)`.
      this.organisationService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedOrgs = [];
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.orgIdToDelete) {
      this.onDelete(this.orgIdToDelete);
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadOrganisations(this.lastTableLazyLoadEvent);
    }
  }

  onDelete(orgId: string) {
    // Signal-based `delete` flips `_deleting[orgId]` while in flight so
    // the row's delete button spins. The rest of the table stays
    // clickable — only that row is "busy".
    this.organisationService
      .delete(orgId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.selectedOrgs = this.selectedOrgs.filter(o => o.id !== orgId);
          this.refreshList();
        }
        this.cdr.markForCheck();
      });
  }

  // Template uses this to check if a specific row's delete button
  // should show its spinner. Reading the signal in the getter makes it
  // change-detect cleanly.
  isDeleting = (id: string): boolean => this.organisationService.isDeleting(id);

  // True while any selected row is being deleted — drives the bulk
  // Delete button's spinner.
  get isBulkDeleting(): boolean {
    return this.selectedOrgs.some(o =>
      this.organisationService.isDeleting(o.id),
    );
  }
}
