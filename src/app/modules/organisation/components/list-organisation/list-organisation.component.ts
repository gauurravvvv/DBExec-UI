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
  orgIdToDelete: number | null = null;

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

  filterValues: any = {
    name: '',
    description: '',
  };

  get isFilterActive(): boolean {
    return !!this.filterValues.name || !!this.filterValues.description;
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
    };
    this.onFilterChange('name');
    this.onFilterChange('description');
  }

  onFilterChange(field: string) {
    this.searchSubject.next();
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

  confirmDelete(orgId: number) {
    this.orgIdToDelete = orgId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
  }

  proceedDelete() {
    if (this.orgIdToDelete) {
      this.onDelete(this.orgIdToDelete);
      this.showDeleteConfirm = false;
      this.orgIdToDelete = null;
    }
  }

  onDelete(orgId: number) {
    this.organisationService
      .deleteOrganisation(orgId.toString())
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
