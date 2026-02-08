import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ROLES } from 'src/app/constants/user.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-org-admin',
  templateUrl: './list-org-admin.component.html',
  styleUrls: ['./list-org-admin.component.scss'],
})
export class ListOrgAdminComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  admins: any[] = [];
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredAdmins: any[] = [];

  showDeleteConfirm = false;
  adminToDelete: string | null = null;

  organisations: any[] = [];
  selectedOrg: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Filter values for column filtering
  filterValues: any = {
    username: '',
    firstName: '',
    lastName: '',
    email: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.username ||
      !!this.filterValues.firstName ||
      !!this.filterValues.lastName ||
      !!this.filterValues.email
    );
  }

  constructor(
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadAdmins();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadAdmins();
    }
  }

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
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
          // Trigger load after org is selected
          this.loadAdmins();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadAdmins();
  }

  onFilterChange() {
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      username: '',
      firstName: '',
      lastName: '',
      email: '',
    };
    // Immediately reload without filters
    this.loadAdmins();
  }

  loadAdmins(event?: any) {
    if (!this.selectedOrg) return;

    // Store the event for future reloads
    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      page: page,
      limit: limit,
    };

    // Build filter object
    const filter: any = {};
    if (this.filterValues.username) {
      filter.username = this.filterValues.username;
    }
    if (this.filterValues.firstName) {
      filter.firstName = this.filterValues.firstName;
    }
    if (this.filterValues.lastName) {
      filter.lastName = this.filterValues.lastName;
    }
    if (this.filterValues.email) {
      filter.email = this.filterValues.email;
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.orgAdminService.listOrganisationAdmin(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.admins = response.data.orgAdmins || [];
        this.filteredAdmins = [...this.admins];
        this.totalRecords = response.data.totalItems || this.admins.length;
      }
    });
  }

  onAddNewAdmin() {
    this.router.navigate([ORGANISATION_ADMIN.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([ORGANISATION_ADMIN.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.adminToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminToDelete = null;
  }

  proceedDelete() {
    if (this.adminToDelete) {
      this.orgAdminService
        .deleteAdminOrganisation(this.selectedOrg, this.adminToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadAdmins(this.lastTableLazyLoadEvent);
            }
            this.showDeleteConfirm = false;
            this.adminToDelete = null;
          }
        });
    }
  }
}
