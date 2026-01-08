import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ANALYSES } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { AnalysesService } from '../../service/analyses.service';

@Component({
  selector: 'app-list-analyses',
  templateUrl: './list-analyses.component.html',
  styleUrls: ['./list-analyses.component.scss'],
})
export class ListAnalysesComponent implements OnInit {
  analyses: any[] = [];
  filteredAnalyses: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  analysisToDelete: string | null = null;
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

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private databaseService: DatabaseService
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
    this.currentPage = 1;
    this.loadDatabases();
  }

  onDBChange(databaseId: any) {
    this.selectedDatabase = databaseId;
    this.currentPage = 1;
    this.loadAnalyses();
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
          this.loadAnalyses();
        } else {
          this.selectedDatabase = null;
          this.analyses = [];
          this.filteredAnalyses = [];
          this.totalItems = 0;
          this.totalPages = 0;
          this.pages = [];
        }
      }
    });
  }

  loadAnalyses() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.analysesService.listAnalyses(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.analyses = [...(response.data.analyses || [])];
        this.filteredAnalyses = [...this.analyses];
        this.totalItems = this.analyses.length;
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
    this.loadAnalyses();
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
    let filtered = [...this.analyses];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(analysis =>
        analysis.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(
        analysis => analysis.status === this.selectedStatus
      );
    }

    this.filteredAnalyses = filtered;
  }

  onView(id: string) {
    this.router.navigate([ANALYSES.VIEW, this.selectedOrg, id]);
  }

  onEdit(id: string) {
    this.router.navigate([ANALYSES.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.analysisToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.analysisToDelete = null;
  }

  proceedDelete() {
    if (this.analysisToDelete) {
      this.analysesService
        .deleteAnalyses(this.selectedOrg, this.analysisToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadAnalyses();
            this.showDeleteConfirm = false;
            this.analysisToDelete = null;
          }
        });
    }
  }
}
