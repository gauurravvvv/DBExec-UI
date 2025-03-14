import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { DATABASE, DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from '../../services/dataset.service';

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
  selectedOrg: any = {};
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
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatasets();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadDatasets();
        }
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.currentPage = 1;
    this.loadDatasets();
  }

  loadDatasets() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.datasetService.listDatasets(params).subscribe({
      next: (response: any) => {
        this.datasets = response.data;
        this.filteredDatasets = [...this.datasets];
        this.totalItems = this.datasets.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      },
      error: error => {
        this.datasets = [];
        this.filteredDatasets = [];
        this.totalItems = 0;
        this.totalPages = 0;
        this.pages = [];
        console.error('Error loading datasets:', error);
      },
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

  onEdit(id: string) {
    this.router.navigate([DATABASE.EDIT, this.selectedOrg.id, id]);
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
        .subscribe({
          next: () => {
            this.loadDatasets();
            this.showDeleteConfirm = false;
            this.datasetToDelete = null;
          },
          error: error => {
            console.error('Error deleting dataset:', error);
            this.showDeleteConfirm = false;
            this.datasetToDelete = null;
          },
        });
    }
  }
}
