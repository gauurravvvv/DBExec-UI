import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { DATABASE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from '../../services/database.service';

@Component({
  selector: 'app-list-database',
  templateUrl: './list-database.component.html',
  styleUrls: ['./list-database.component.scss'],
})
export class ListDatabaseComponent implements OnInit {
  dbs: any[] = [];
  filteredDBs: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  dbToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatabase: any = null;
  deleteConfiguration: boolean = false;

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
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loaddbs();
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
          this.selectedOrg = this.organisations[0];
          this.loaddbs();
        }
      }
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.currentPage = 1;
    this.loaddbs();
  }

  loaddbs() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.dbs = response.data;
        this.filteredDBs = [...this.dbs];
        this.totalItems = this.dbs.length;
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
    this.loaddbs();
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
    let filtered = [...this.dbs];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(db => db.name.toLowerCase().includes(search));
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(env => env.status === this.selectedStatus);
    }

    this.filteredDBs = filtered;
  }

  onAddNewDatabase() {
    this.router.navigate([DATABASE.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([DATABASE.EDIT + '/' + id]);
  }

  confirmDelete(database: any): void {
    this.selectedDatabase = database;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatabase = null;
    this.deleteConfiguration = false;
  }

  proceedDelete() {
    if (this.selectedDatabase) {
      this.databaseService
        .deleteDatabase(
          this.selectedDatabase.organisationId,
          this.selectedDatabase.id,
          this.selectedDatabase.isMasterDB ? '1' : '0',
          this.deleteConfiguration
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loaddbs();
            this.showDeleteConfirm = false;
            this.selectedDatabase = null;
          }
        });
    }
  }
}
