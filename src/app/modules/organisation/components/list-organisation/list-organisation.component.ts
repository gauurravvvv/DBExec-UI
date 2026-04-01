import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ORGANISATION } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
})
export class ListOrganisationComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  Math = Math;

  // Params to fetch all for client-side handling
  listParams: IParams = {
    limit: 10,
    pageNumber: 1,
  };

  private searchSubject = new Subject<void>();
  lastTableLazyLoadEvent: any;

  organisations: any[] = [];
  totalItems = 0;

  showDeleteConfirm = false;
  orgIdToDelete: string | null = null;
  deleteJustification = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500)).subscribe(() => {
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
    this.onFilterChange();
  }

  onFilterChange() {
    this.searchSubject.next();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadOrganisations(event: any) {
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
    if (this.filterValues.status !== null && this.filterValues.status !== undefined) {
      filter.status = this.filterValues.status;
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.organisationService.listOrganisation(params).then((res: any) => {
      if (this.globalService.handleSuccessService(res, false)) {
        this.organisations = [...res.data.orgs];
        this.totalItems = res.data.count; // Ensure backend returns totalCount for pagination
      }
    });
  }

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.EDIT + '/' + org.id]);
  }

  confirmDelete(orgId: string) {
    this.orgIdToDelete = orgId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.orgIdToDelete && this.deleteJustification.trim()) {
      this.onDelete(this.orgIdToDelete);
      this.showDeleteConfirm = false;
      this.orgIdToDelete = null;
      this.deleteJustification = '';
    }
  }

  onDelete(orgId: string) {
    this.organisationService
      .deleteOrganisation(orgId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          if (this.lastTableLazyLoadEvent) {
            this.loadOrganisations(this.lastTableLazyLoadEvent);
          }
          this.showDeleteConfirm = false;
          this.orgIdToDelete = null;
        }
      });
  }
}
