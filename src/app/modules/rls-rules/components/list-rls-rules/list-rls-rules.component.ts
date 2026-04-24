import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { RLS_RULE } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-rls-rules',
  templateUrl: './list-rls-rules.component.html',
  styleUrls: ['./list-rls-rules.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRlsRulesComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  limit = 10;
  lastTableLazyLoadEvent: any;

  // Signal refs — template binds directly to these
  rules   = this.rlsRulesService.rules;
  total   = this.rlsRulesService.total;
  loading = this.rlsRulesService.loading;
  saving  = this.rlsRulesService.saving;

  datasources: any[] = [];
  selectedDatasource: any = null;
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

  filterValues: any = {
    name: '',
    datasetName: '',
    status: null,
  };

  activeRuleForAssignment: any = null;
  showAssignmentsPanel = false;

  private filter$ = new Subject<void>();

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.datasetName ||
      this.filterValues.status !== null
    );
  }

  constructor(
    private rlsRulesService: RlsRulesService,
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadRules();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatasources();
    }
  }

  loadOrganisations(): Promise<void> {
    return new Promise(resolve => {
      const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
      this.organisationService.listOrganisation(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = response.data.orgs || [];
          if (this.organisations.length > 0) {
            this.selectedOrg = this.organisations[0].id;
            this.loadDatasources();
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
          }
        }
        this.cdr.markForCheck();
        resolve();
      });
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.selectedDatasource = null;
    this.loadDatasources();
  }

  loadDatasources(): Promise<void> {
    return new Promise(resolve => {
      if (!this.selectedOrg) {
        resolve();
        return;
      }
      const params = {
        orgId: this.selectedOrg,
        pageNumber: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };
      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.datasources = response.data.datasources || [];
            if (this.datasources.length > 0) {
              this.selectedDatasource = this.datasources[0].id;
              this.loadRules();
            } else {
              this.selectedDatasource = null;
            }
          } else {
            this.datasources = [];
            this.selectedDatasource = null;
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.datasources = [];
          this.selectedDatasource = null;
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  onDatasourceChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    if (this.selectedDatasource) {
      this.loadRules();
    }
  }

  onFilterChange() {
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      datasetName: '',
      status: null,
    };
    this.loadRules();
  }

  loadRules(event?: any) {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = { page, limit };

    const filter: any = {};
    if (this.filterValues.datasetName) filter.datasetName = this.filterValues.datasetName;
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.status !== null && this.filterValues.status !== undefined) {
      filter.status = this.filterValues.status;
    }
    if (Object.keys(filter).length > 0) params.filter = JSON.stringify(filter);

    this.rlsRulesService
      .load(this.selectedOrg, this.selectedDatasource, params)
      .then(() => {
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onManageAssignments(rule: any) {
    this.activeRuleForAssignment = rule;
    this.showAssignmentsPanel = true;
  }

  onAssignmentsPanelClose() {
    this.showAssignmentsPanel = false;
    this.activeRuleForAssignment = null;
  }

  onAddNewRule() {
    this.router.navigate([RLS_RULE.ADD]);
  }

  onEdit(rule: any) {
    this.router.navigate([RLS_RULE.EDIT, this.selectedOrg, rule.id]);
  }

  trackByIndex(index: number): number {
    return index;
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
        .delete(this.selectedOrg, this.ruleToDelete, this.deleteJustification.trim())
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadRules(this.lastTableLazyLoadEvent);
            } else {
              this.loadRules();
            }
            this.showDeleteConfirm = false;
            this.ruleToDelete = null;
            this.deleteJustification = '';
            this.cdr.markForCheck();
          }
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }
}
