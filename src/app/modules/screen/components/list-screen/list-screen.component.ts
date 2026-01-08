import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { SCREEN, TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ScreenService } from '../../services/screen.service';

@Component({
  selector: 'app-list-screen',
  templateUrl: './list-screen.component.html',
  styleUrls: ['./list-screen.component.scss'],
})
export class ListScreenComponent implements OnInit {
  users: any[] = [];
  filteredScreens: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  screenToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  screens: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
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
    private screenService: ScreenService,
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
        } else {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.filteredScreens = [];
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatabases();
  }

  onDBChange(dbId: any) {
    this.selectedDatabase = dbId;
    this.currentPage = 1;
    this.loadScreens();
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
        this.databases = [...response.data] || [];
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0].id;
          this.loadScreens();
        } else {
          this.selectedDatabase = null;
          this.filteredScreens = [];
        }
      }
    });
  }

  loadScreens() {
    if (!this.selectedDatabase) return;
    const params = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      pageNumber: 1,
      limit: 100,
    };

    this.screenService.listScreen(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.screens = [...response.data] || [];
        this.filteredScreens = [...this.screens];
        this.totalItems = this.screens.length;
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
    this.loadScreens();
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
    let filtered = [...this.screens];
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(screen =>
        screen.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(
        screen => screen.status === this.selectedStatus
      );
    }

    this.filteredScreens = filtered;
  }

  onAddNewScreen() {
    this.router.navigate([SCREEN.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SCREEN.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.screenToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.screenToDelete = null;
  }

  proceedDelete() {
    if (this.screenToDelete) {
      this.screenService
        .deleteScreen(this.selectedOrg, this.screenToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadScreens();
            this.showDeleteConfirm = false;
            this.screenToDelete = null;
          }
        });
    }
  }

  onEditScreen(screen: any) {
    // Handle edit action
    this.router.navigate([SCREEN.EDIT, this.selectedOrg, screen.id]);
  }

  onConfig(id: string) {
    this.router.navigate([
      SCREEN.CONFIG,
      this.selectedOrg,
      this.selectedDatabase,
      id,
    ]);
  }

  onExecute(id: string) {
    this.router.navigate([
      '/app/screen/execute',
      this.selectedOrg,
      this.selectedDatabase,
      id,
    ]);
  }
}
