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
  // PrimeNG Table handles pagination and filtering locally
  limit = 1000;

  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatabase: any = null;
  showDeleteConfirm = false;
  deleteConfiguration: boolean = false;

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
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
          this.selectedOrg = this.organisations[0].id;
          this.loaddbs();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loaddbs();
  }

  loaddbs() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: this.limit,
    };

    this.databaseService.listAllDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.dbs = response.data || [];
        this.filteredDBs = [...this.dbs];
      }
    });
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
          this.deleteConfiguration,
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
