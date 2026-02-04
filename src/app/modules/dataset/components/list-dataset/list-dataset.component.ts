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
  limit = 1000;
  totalItems = 0;
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
    private databaseService: DatabaseService,
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
        this.organisations = response.data.orgs || [];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatabases();
        } else {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.datasets = [];
          this.totalItems = 0;
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
    this.loadDatasets();
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
          this.loadDatasets();
        } else {
          this.selectedDatabase = null;
          this.datasets = [];
          this.totalItems = 0;
        }
      }
    });
  }

  loadDatasets() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      pageNumber: 1,
      limit: this.limit,
    };

    this.datasetService.listDatasets(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = response.data.datasets || [];
        this.totalItems = this.datasets.length;
      }
    });
  }

  // Removed manual filtering and pagination methods as PrimeNG table handles this

  onAddNewAdmin() {
    this.router.navigate([DATASET.ADD]);
  }

  onAddViaPrompts() {
    console.log('Add Dataset via Prompts clicked');
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.EDIT, this.selectedOrg, id]);
  }

  useAsAnalysis(id: string) {
    this.router.navigate([ANALYSES.ADD, this.selectedOrg, id]);
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
        .deleteDataset(this.selectedOrg, this.datasetToDelete)
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
