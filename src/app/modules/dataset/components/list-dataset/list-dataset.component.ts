import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ANALYSES, DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from '../../services/dataset.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';

@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
})
export class ListDatasetComponent implements OnInit {
  datasets: any[] = [];
  filteredDatasets: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  datasetToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatabase: any = {};

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

  addDatasetItems: MenuItem[] = [
    {
      label: 'via Prompts',
      icon: 'pi pi-comments',
      command: () => this.onAddViaPrompts(),
    },
  ];

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private databaseService: DatabaseService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
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
          this.selectedOrg = this.organisations[0];
          this.loadDatabases();
        }
      }
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.currentPage = 1;
    this.loadDatabases();
  }

  onDBChange(event: any) {
    this.selectedDatabase = event.value;
    this.currentPage = 1;
    this.loadDatasets();
  }

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = [...response.data];
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0];
          this.loadDatasets();
        }
      }
    });
  }

  loadDatasets() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.datasetService.listDatasets(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = [...response.data.datasets];
        this.filteredDatasets = [...this.datasets];
        this.totalItems = this.datasets.length;
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
    this.loadDatasets();
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
    let filtered = [...this.datasets];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(dataset =>
        dataset.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(
        dataset => dataset.status === this.selectedStatus
      );
    }

    this.filteredDatasets = filtered;
  }

  onAddNewAdmin() {
    this.router.navigate([DATASET.ADD]);
  }

  onAddViaPrompts() {
    console.log('Add Dataset via Prompts clicked');
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.EDIT, this.selectedOrg.id, id]);
  }

  useAsAnalysis(id: string) {
    this.router.navigate([ANALYSES.ADD, this.selectedOrg.id, id]);
  }

  confirmDelete(id: string) {
    this.datasetToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
  }

  proceedDelete() {
    if (this.datasetToDelete) {
      this.datasetService
        .deleteDataset(this.selectedOrg.id, this.datasetToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadDatasets();
            this.showDeleteConfirm = false;
            this.datasetToDelete = null;
          }
        });
    }
  }
}
