import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild} from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ORGANISATION } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListOrganisationComponent implements OnInit {
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

  showDeleteConfirm = false;
  orgIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.listParams.pageNumber = 1;
      this.loadOrganisations(this.lastTableLazyLoadEvent);
    });
  }

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

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

  loadOrganisations(event: any) {
    const prev = this.lastTableLazyLoadEvent;
    if (
      prev &&
      (prev.first !== event.first ||
        prev.rows !== event.rows ||
        prev.sortField !== event.sortField ||
        prev.sortOrder !== event.sortOrder)
    ) {
      this.selectedOrgs = [];
    }
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;

    const params: any = {
      page,
      limit,
    };

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
    this.router.navigate([ORGANISATION.EDIT + '/' + org.id]);
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
      this.organisationService
        .bulkDeleteOrganisation(ids, reason)
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

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadOrganisations(this.lastTableLazyLoadEvent);
    }
  }

  onDelete(orgId: string) {
    this.organisationService
      .deleteOrganisation(orgId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.selectedOrgs = this.selectedOrgs.filter(o => o.id !== orgId);
          this.refreshList();
        }
        this.cdr.markForCheck();
      });
  }
}
