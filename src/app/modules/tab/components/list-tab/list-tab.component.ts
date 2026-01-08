import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-list-tab',
  templateUrl: './list-tab.component.html',
  styleUrls: ['./list-tab.component.scss'],
})
export class ListTabComponent implements OnInit {
  users: any[] = [];
  filteredTabs: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  tabToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  tabs: any[] = [];
  selectedOrg: any = {};
  selectedDatabase: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  statusFilterItems: MenuItem[] = [
    {
      label: 'All',
      command: () => this.filterByStatus(null),
    },
    {
      label: 'Active',
      command: () => this.filterByStatus(1),
    },
    {
      label: 'Inactive',
      command: () => this.filterByStatus(0),
    },
  ];

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private tabService: TabService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatabases();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatabases();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatabases();
  }

  onDBChange(databaseId: any) {
    this.selectedDatabase = databaseId;
    this.currentPage = 1;
    this.loadTabs();
  }

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = [...response.data];
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0].id;
          this.loadTabs();
        } else {
          this.selectedDatabase = null;
          this.tabs = [];
          this.filteredTabs = [];
          this.totalItems = 0;
          this.totalPages = 0;
          this.pages = [];
        }
      }
    });
  }

  loadTabs() {
    if (!this.selectedDatabase) return;
    const params = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      pageNumber: 1,
      limit: 100,
    };

    this.tabService.listTab(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = [...response.data];
        this.filteredTabs = [...this.tabs];
        this.totalItems = this.tabs.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      }
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadTabs();
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.tabs];
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(user => user.status === this.selectedStatus);
    }

    this.filteredTabs = filtered;
  }

  onAddNewTab() {
    this.router.navigate([TAB.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([TAB.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.tabToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.tabToDelete = null;
  }

  proceedDelete() {
    if (this.tabToDelete) {
      this.tabService
        .deleteTab(this.selectedOrg, this.tabToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadTabs();
            this.showDeleteConfirm = false;
            this.tabToDelete = null;
          }
        });
    }
  }

  onEditTab(tab: any) {
    // Handle edit action
    this.router.navigate([TAB.EDIT, this.selectedOrg, tab.id]);
  }
}
