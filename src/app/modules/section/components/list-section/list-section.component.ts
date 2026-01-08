import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-list-section',
  templateUrl: './list-section.component.html',
  styleUrls: ['./list-section.component.scss'],
})
export class ListSectionComponent implements OnInit {
  users: any[] = [];
  filteredSections: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  sectionToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  tabs: any[] = [];
  sections: any[] = [];
  selectedOrg: any = {};
  selectedDatabase: any = {};
  selectedTab: any = {};
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
    private sectionService: SectionService,
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

  onTabChange(tabId: any) {
    this.selectedTab = tabId;
    this.currentPage = 1;
    this.loadSections();
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
          this.selectedTab = null;
          this.tabs = [];
          this.sections = [];
          this.filteredSections = [];
          this.totalItems = 0;
          this.totalPages = 0;
          this.pages = [];
        }
      }
    });
  }

  loadSections() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      tabId: this.selectedTab,
      pageNumber: 1,
      limit: 100,
    };

    this.sectionService.listSection(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sections = [...response.data];
        this.filteredSections = [...this.sections];
        this.totalItems = this.sections.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
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
        if (this.tabs.length > 0) {
          this.selectedTab = this.tabs[0].id;
          this.loadSections();
        } else {
          this.selectedTab = null;
          this.sections = [];
          this.filteredSections = [];
          this.totalItems = 0;
          this.totalPages = 0;
          this.pages = [];
        }
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
    let filtered = [...this.sections];
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(section =>
        section.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(
        section => section.status === this.selectedStatus
      );
    }

    this.filteredSections = filtered;
  }

  onAddNewSection() {
    this.router.navigate([SECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SECTION.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.sectionToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.sectionToDelete = null;
  }

  proceedDelete() {
    if (this.sectionToDelete) {
      this.sectionService
        .deleteSection(this.selectedOrg, this.sectionToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadSections();
            this.showDeleteConfirm = false;
            this.sectionToDelete = null;
          }
        });
    }
  }

  onEditTab(tab: any) {
    // Handle edit action
    this.router.navigate([SECTION.EDIT, this.selectedOrg, tab.id]);
  }
}
