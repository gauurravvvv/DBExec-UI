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
  // PrimeNG Table handles pagination and filtering locally
  limit = 1000;

  filteredScreens: any[] = [];

  searchTerm: string = '';
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

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private screenService: ScreenService,
    private router: Router,
    private globalService: GlobalService,
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
        this.databases = response.data || [];
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
      limit: this.limit,
    };

    this.screenService.listScreen(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.screens = response.data;
        this.filteredScreens = [...this.screens];
      }
    });
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
