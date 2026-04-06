import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { RLS_RULE } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-rls-rules',
  templateUrl: './list-rls-rules.component.html',
  styleUrls: ['./list-rls-rules.component.scss'],
})
export class ListRlsRulesComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  rules: any[] = [];
  filteredRules: any[] = [];
  datasets: any[] = [];
  selectedDatasetId: string = '';
  selectedOrg: any = null;

  showDeleteConfirm = false;
  ruleToDelete: string | null = null;
  deleteJustification = '';

  organisations: any[] = [];
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  scopeOptions = [
    { label: 'User', value: 'user' },
    { label: 'Group', value: 'group' },
  ];

  filterValues: any = {
    name: '',
    scope: null,
    columnName: '',
    status: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      this.filterValues.scope !== null ||
      !!this.filterValues.columnName ||
      this.filterValues.status !== null
    );
  }

  constructor(
    private rlsRulesService: RlsRulesService,
    private datasetService: DatasetService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.applyFilters();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatasets();
    }
  }

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatasets();
        } else {
          this.selectedOrg = null;
          this.datasets = [];
          this.rules = [];
          this.filteredRules = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.selectedDatasetId = '';
    this.rules = [];
    this.filteredRules = [];
    this.totalRecords = 0;
    this.loadDatasets();
  }

  loadDatasets() {
    if (!this.selectedOrg) return;

    const params = {
      orgId: this.selectedOrg,
      page: 1,
      limit: 1000,
    };

    this.datasetService.listDatasets(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = response.data.datasets || [];
      } else {
        this.datasets = [];
      }
    });
  }

  onDatasetChange(datasetId: string) {
    this.selectedDatasetId = datasetId;
    if (this.selectedDatasetId) {
      this.loadRules();
    } else {
      this.rules = [];
      this.filteredRules = [];
      this.totalRecords = 0;
    }
  }

  onFilterChange() {
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      scope: null,
      columnName: '',
      status: null,
    };
    this.applyFilters();
  }

  applyFilters(): void {
    this.filteredRules = this.rules.filter(rule => {
      if (
        this.filterValues.name &&
        !rule.name.toLowerCase().includes(this.filterValues.name.toLowerCase())
      )
        return false;
      if (
        this.filterValues.scope !== null &&
        rule.scope !== this.filterValues.scope
      )
        return false;
      if (
        this.filterValues.columnName &&
        !rule.columnName
          .toLowerCase()
          .includes(this.filterValues.columnName.toLowerCase())
      )
        return false;
      if (
        this.filterValues.status !== null &&
        rule.status !== this.filterValues.status
      )
        return false;
      return true;
    });
    this.totalRecords = this.filteredRules.length;
  }

  loadRules() {
    if (!this.selectedOrg || !this.selectedDatasetId) return;

    this.rlsRulesService
      .listRules(this.selectedOrg, this.selectedDatasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.rules = response.data.rules || [];
          this.applyFilters();
        } else {
          this.rules = [];
          this.filteredRules = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.rules = [];
        this.filteredRules = [];
        this.totalRecords = 0;
      });
  }

  onAddNewRule() {
    this.router.navigate([RLS_RULE.ADD]);
  }

  onEdit(rule: any) {
    this.router.navigate([RLS_RULE.EDIT, this.selectedOrg, rule.id]);
  }

  confirmDelete(id: string) {
    this.ruleToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.ruleToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.ruleToDelete && this.deleteJustification.trim()) {
      this.rlsRulesService
        .deleteRule(
          this.selectedOrg,
          this.ruleToDelete,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadRules();
            this.showDeleteConfirm = false;
            this.ruleToDelete = null;
            this.deleteJustification = '';
          }
        });
    }
  }
}
