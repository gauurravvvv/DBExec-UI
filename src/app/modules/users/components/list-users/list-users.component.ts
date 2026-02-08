import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from '../../services/user.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-users',
  templateUrl: './list-users.component.html',
  styleUrls: ['./list-users.component.scss'],
})
export class ListUsersComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  users: any[] = [];
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredUsers: any[] = [];

  showDeleteConfirm = false;
  userToDelete: string | null = null;

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
    private userService: UserService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadUsers();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
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
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          // Trigger load after org is selected
          this.loadUsers();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadUsers();
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
    this.loadUsers();
  }

  loadUsers(event?: any) {
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

    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = response.data.users || [];
        this.filteredUsers = [...this.users];
        this.totalRecords = response.data.totalItems || this.users.length;
      }
    });
  }

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([USER.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.userToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  proceedDelete() {
    if (this.userToDelete) {
      this.userService
        .deleteUser(this.userToDelete, this.selectedOrg)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadUsers(this.lastTableLazyLoadEvent);
            }
            this.showDeleteConfirm = false;
            this.userToDelete = null;
          }
        });
    }
  }
}
