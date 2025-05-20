import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { SCREEN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { ScreenService } from '../../services/screen.service';

@Component({
  selector: 'app-list-screen',
  templateUrl: './list-screen.component.html',
  styleUrls: ['./list-screen.component.scss'],
})
export class ListScreenComponent implements OnInit {
  users: any[] = [];
  filteredScreens: any[] = [];
  selectedCustomers: any[] = [];
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
  selectedScreen: any = {};
  selectedDatabase: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === 'SUPER_ADMIN';
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  tabs: any[] = [];
  selectedTab: any = null;
  actionItems: MenuItem[] = [];
  loading: boolean = false;

  // Dummy data for demonstration
  dummyCustomers = [
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '1',
      name: 'James Wilson',
      country: { name: 'United States', code: 'us' },
      agent: {
        name: 'Amy Elsner',
        avatar: 'assets/layout/images/avatar-f-1.png',
      },
      date: '2024-01-15',
      balance: 45890.5,
      status: 'qualified',
      activity: 75,
    },
    {
      id: '2',
      name: 'Anna Smith',
      country: { name: 'Germany', code: 'de' },
      agent: {
        name: 'John Smith',
        avatar: 'assets/layout/images/avatar-m-1.png',
      },
      date: '2024-02-20',
      balance: 28350.0,
      status: 'unqualified',
      activity: 45,
    },
    {
      id: '3',
      name: 'Robert Johnson',
      country: { name: 'United Kingdom', code: 'gb' },
      agent: {
        name: 'Sarah Davis',
        avatar: 'assets/layout/images/avatar-f-2.png',
      },
      date: '2024-03-01',
      balance: 72100.25,
      status: 'proposal',
      activity: 90,
    },
    {
      id: '4',
      name: 'Maria Garcia',
      country: { name: 'Spain', code: 'es' },
      agent: {
        name: 'David Miller',
        avatar: 'assets/layout/images/avatar-m-2.png',
      },
      date: '2024-02-15',
      balance: 35200.75,
      status: 'renewal',
      activity: 60,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
    {
      id: '5',
      name: 'Thomas Anderson',
      country: { name: 'Canada', code: 'ca' },
      agent: {
        name: 'Lisa Wong',
        avatar: 'assets/layout/images/avatar-f-3.png',
      },
      date: '2024-03-10',
      balance: 56700.9,
      status: 'new',
      activity: 30,
    },
  ];

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
    private globalService: GlobalService,
    private tabService: TabService
  ) {}

  ngOnInit() {
    this.initializeActionItems();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedScreen = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
      this.loadScreens();
    }
  }

  initializeActionItems() {
    this.actionItems = [
      {
        label: 'View',
        icon: 'pi pi-eye',
        command: () => {
          if (this.selectedCustomers.length === 1) {
            this.router.navigate([SCREEN.VIEW, this.selectedCustomers[0].id]);
          }
        },
      },
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => {
          if (this.selectedCustomers.length === 1) {
            this.onEditScreen(this.selectedCustomers[0]);
          }
        },
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => {
          if (this.selectedCustomers.length === 1) {
            this.confirmDelete(this.selectedCustomers[0].id);
          }
        },
      },
    ];
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
          this.selectedScreen = this.organisations[0];
          this.loadDatabases();
        }
      }
    });
  }

  onOrgChange(event: any) {
    this.selectedScreen = event.value;
    this.loadDatabases();
  }

  onDBChange(event: any) {
    this.selectedDatabase = event.value;
    this.loadTabs();
  }

  loadDatabases() {
    if (!this.selectedScreen) return;
    const params = {
      orgId: this.selectedScreen.id,
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

  loadTabs() {
    if (!this.selectedDatabase) return;
    const params = {
      orgId: this.selectedScreen.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: 1,
      limit: 100,
    };

    this.tabService.listTab(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = [...response.data];
        if (this.tabs.length > 0) {
          this.selectedTab = this.tabs[0];
          this.loadScreens();
        }
      }
    });
  }

  loadScreens() {
    this.loading = true;

    // Simulate API delay with dummy data
    setTimeout(() => {
      this.screens = [...this.dummyCustomers];
      this.filteredScreens = [...this.dummyCustomers];
      this.totalItems = this.dummyCustomers.length;
      this.totalPages = Math.ceil(this.totalItems / this.pageSize);
      this.generatePageNumbers();
      this.applyFilters();
      this.loading = false;
    }, 1000);

    /* Comment out the actual API call for now
    if (!this.selectedTab) {
      this.loading = false;
      return;
    }
    
    const params = {
      orgId: this.selectedScreen.id,
      databaseId: this.selectedDatabase.id,
      tabId: this.selectedTab.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.screenService.listScreen(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.screens = [...response.data];
          this.filteredScreens = [...this.screens];
          this.totalItems = this.screens.length;
          this.totalPages = Math.ceil(this.totalItems / this.pageSize);
          this.generatePageNumbers();
          this.applyFilters();
        }
      })
      .finally(() => {
        this.loading = false;
      });
    */
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
      filtered = filtered.filter(
        screen =>
          screen.name.toLowerCase().includes(search) ||
          screen.description.toLowerCase().includes(search)
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
    this.router.navigate([SCREEN.EDIT, this.selectedScreen.id, id]);
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
        .deleteScreen(this.selectedScreen.id, this.screenToDelete)
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
    this.router.navigate([SCREEN.EDIT, this.selectedScreen.id, screen.id]);
  }

  onTabChange(event: any) {
    this.selectedTab = event.value;
    this.loadScreens();
  }
}
