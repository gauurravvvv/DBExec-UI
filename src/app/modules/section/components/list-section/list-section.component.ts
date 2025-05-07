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
    this.loadDatabases();
  }

  onDBChange(event: any) {
    this.selectedDatabase = event.value;
    this.currentPage = 1;
    this.loadTabs();
  }

  onTabChange(event: any) {
    this.selectedTab = event.value;
    this.currentPage = 1;
    this.loadSections();
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
          this.loadTabs();
        }
      }
    });
  }

  loadSections() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      tabId: this.selectedTab.id,
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
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: 1,
      limit: 100,
    };

    this.tabService.listTab(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = [...response.data];
        if (this.tabs.length > 0) {
          this.selectedTab = this.tabs[0];
          this.loadSections();
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
    this.router.navigate([SECTION.EDIT, this.selectedOrg.id, id]);
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
        .deleteSection(this.selectedOrg.id, this.sectionToDelete)
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
    this.router.navigate([SECTION.EDIT, this.selectedOrg.id, tab.id]);
  }
}
