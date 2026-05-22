import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import {
  ANALYSES,
  DATASET,
  QUERY_BUILDER,
} from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { AnalysisFormData } from 'src/app/modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AnalysesService } from 'src/app/modules/analyses/services/analyses.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { QueryBuilderService } from 'src/app/modules/query-builder/services/query-builder.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { DatasetService } from '../../services/dataset.service';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

type DatasetSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDatasetComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  @ViewChild('qbSearchInput') qbSearchInput!: ElementRef;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  datasets: any[] = [];
  filteredDatasets: any[] = [];

  selectedDatasets: any[] = [];
  sortHelper = new ListSortHelper<DatasetSortField>();
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';
  datasetToDelete: string | null = null;
  showDuplicateDialog = false;
  datasetToDuplicate: any = null;
  activeDataset: any = null;
  showQueryBuilderPopup = false;
  queryBuilders: any[] = [];
  loadingQueryBuilders = false;
  qbSearchTerm = '';
  qbTotalRecords = 0;
  qbActiveIndex = -1;
  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  saving = this.datasetService.saving;

  today = new Date();

  statusOptions: any[] = [];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();

  // Debouncing for QB search
  private qbFilter$ = new Subject<void>();

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  get selectedCount(): number {
    return this.selectedDatasets?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  trackById(index: number, item: any): any {
    return item.id;
  }

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  addDatasetItems: MenuItem[] = [];

  // Create Analysis dialog
  showCreateAnalysisDialog = false;
  analysisDatasetId: string = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
    private analysesService: AnalysesService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.addDatasetItems = [
      {
        label: this.translate.instant('DATASET.VIA_QUERY_BUILDER'),
        icon: 'pi pi-comments',
        command: () => this.onAddViaPrompts(),
      },
    ];

    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadDatasets();
      });

    // Setup debounced QB search
    this.qbFilter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadQueryBuilders();
      });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['orgId'] || params['datasourceId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          if (this.showOrganisationDropdown) {
            this.loadOrganisations();
          } else {
            this.selectedOrg =
              this.globalService.getTokenDetails('organisationId');
            this.loadDatasources();
          }
        }
      });
  }

  handleDeepLinking(params: any) {
    const orgId = params['orgId'] ? params['orgId'] : null;
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
    const name = params['name'];

    if (name) {
      this.filterValues.name = name;
    }

    if (this.showOrganisationDropdown) {
      const orgPromise = orgId
        ? this.loadOrganisations(orgId)
        : this.loadOrganisations();

      orgPromise.then(() => {
        if (orgId) {
          if (datasourceId) {
            this.loadDatasources(datasourceId);
          } else {
            this.loadDatasources();
          }
        }
      });
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');

      if (datasourceId) {
        this.loadDatasources(datasourceId);
      } else {
        this.loadDatasources();
      }
    }
  }

  loadOrgsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadOrganisations(preSelectedOrgId?: string): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: 10,
      };

      this.organisationService
        .listOrganisation(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const orgs = response?.data?.orgs ?? [];
            this.preloadedOrgs = orgs;
            this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
            if (orgs.length > 0) {
              if (
                preSelectedOrgId &&
                orgs.find((o: any) => o.id === preSelectedOrgId)
              ) {
                this.selectedOrg = preSelectedOrgId;
              } else {
                this.selectedOrg = orgs[0].id;
              }

              if (!preSelectedOrgId) {
                this.loadDatasources();
              }
            } else {
              this.selectedOrg = null;
              this.datasources = [];
              this.selectedDatasource = null;
              this.datasets = [];
              this.filteredDatasets = [];
              this.totalRecords = 0;
            }
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          resolve();
        });
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;
    this.loadDatasources();
  }

  /**
   * Fetcher for the server-mode datasource dropdown. Org-scoped — no-ops
   * gracefully if no org is selected.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    if (!this.selectedOrg) return { items: [], total: 0 };
    const params: any = { orgId: this.selectedOrg, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.loadDatasets();
  }

  onFilterChange() {
    this.selectedDatasets = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    // Immediately reload without filters
    this.loadDatasets();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatasources(preSelectedDbId?: string): Promise<void> {
    return new Promise(resolve => {
      if (!this.selectedOrg) {
        resolve();
        return;
      }
      const params = {
        orgId: this.selectedOrg,
        page: DEFAULT_PAGE,
        limit: 10,
      };

      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const items = response?.data?.datasources ?? [];
            this.preloadedDatasources = items;
            this.preloadedDatasourcesTotal =
              response?.data?.count ?? items.length;
            this.datasources = items;
            if (this.datasources.length > 0) {
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
              this.loadDatasets();
            } else {
              this.selectedDatasource = null;
              this.datasets = [];
              this.filteredDatasets = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
            this.datasets = [];
            this.filteredDatasets = [];
            this.totalRecords = 0;
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  toggleSort(field: DatasetSortField) {
    this.sortHelper.toggle(field);
    this.selectedDatasets = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
    }
    this.loadDatasets(this.lastTableLazyLoadEvent);
  }

  loadDatasets(event?: any) {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
        this.selectedDatasets = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      datasourceId: this.selectedDatasource,
      page: page,
      limit: limit,
    };

    // Build filter object
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.createdDateRange?.[0]) {
      filter.createdDateFrom =
        this.filterValues.createdDateRange[0].toISOString();
    }
    if (this.filterValues.createdDateRange?.[1]) {
      const dateTo = new Date(this.filterValues.createdDateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.createdDateTo = dateTo.toISOString();
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    this.datasetService
      .listDatasets(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasets = response.data.datasets || [];
          this.filteredDatasets = [...this.datasets];
          this.totalRecords = response.data.totalItems || this.datasets.length;
        } else {
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.datasets = [];
        this.filteredDatasets = [];
        this.totalRecords = 0;
        this.cdr.markForCheck();
      });
  }

  /**
   * Open the datasource-picker popup. Previously routed straight to
   * /datasets/new; the popup is the new entry point so the add page
   * doesn't have to show org + datasource dropdowns. The popup itself
   * is a `cmd-overlay` block in the template — see the matching close
   * + continue handlers below.
   */
  onAddNewAdmin() {
    this.openDatasourcePicker();
  }

  // ── Datasource picker popup state ─────────────────────────────────
  // Three-step picker (for system admins; org-only users skip step 1):
  //   1. Org    — system-admin-only. Defaults to the list page's
  //               currently-active org. Changing resets steps 2+3.
  //   2. Datasource — datasources in the picked org. Changing
  //               resets step 3.
  //   3. Schema — optional. Schemas in the picked datasource. The
  //               choice scopes the editor's sidebar to that schema.
  // Continue requires datasource. Org auto-defaults from the page,
  // schema is optional.
  showDsPickerPopup = false;
  /** Org selected inside the popup. For non-system-admins this just
   *  mirrors `this.selectedOrg` (popup never lets them change it).
   *  For system admins it can differ from the list page's org until
   *  Continue navigates. */
  dsPickerOrgSelected: any = null;
  /** Preloaded orgs for the popup dropdown — primes it with the
   *  first page so the user sees options on open. */
  dsPickerOrgPreloaded: any[] | null = null;
  dsPickerOrgPreloadedTotal: number | null = null;
  dsPickerSelected: any = null;
  schemaPickerSelected: any = null;
  /** Mirror of preloaded datasources so the popup opens with content
   *  on first click; the dropdown's serverMode fetcher handles
   *  search + pagination from there. */
  dsPickerPreloaded: any[] | null = null;
  dsPickerPreloadedTotal: number | null = null;
  /** Schema list for the currently-picked datasource. Reloaded each
   *  time the user picks a different datasource. `null` = not yet
   *  loaded; `[]` = loaded but empty. */
  schemaPickerOptions: { name: string }[] | null = null;
  schemaPickerLoading = false;
  schemaPickerError: string | null = null;

  openDatasourcePicker(): void {
    this.dsPickerSelected = null;
    this.schemaPickerSelected = null;
    this.schemaPickerOptions = null;
    this.schemaPickerError = null;
    this.dsPickerPreloaded = null;
    this.dsPickerPreloadedTotal = null;
    // Seed the popup's org from the list page's current selection.
    // For non-system-admins this is the JWT-derived org (read-only
    // in the popup); for system admins it's a soft default they
    // can override via the org dropdown.
    const seededOrg = this.resolveListPageOrg();
    this.dsPickerOrgSelected = seededOrg;
    // Pre-seed the org dropdown's preloaded list with the resolved
    // org. The serverMode dropdown needs the selected value to be
    // PRESENT in its options list to render a label — otherwise it
    // shows blank until the user opens the panel. The async
    // primeDsPickerOrgs below will replace this with the full page
    // a moment later; this just covers the initial paint.
    this.dsPickerOrgPreloaded =
      seededOrg && seededOrg.name ? [seededOrg] : null;
    this.dsPickerOrgPreloadedTotal = this.dsPickerOrgPreloaded?.length ?? null;
    this.showDsPickerPopup = true;
    if (this.showOrganisationDropdown) {
      this.primeDsPickerOrgs();
    }
    // Prime the datasource dropdown with page 1 so users see options
    // immediately instead of waiting for the server-mode fetcher.
    this.primeDatasourcePicker();
  }

  /**
   * Convert the list-page's `selectedOrg` (which can be either a
   * raw id string for system admins or a JWT-derived id for org
   * users) into the object shape the popup's custom-dropdown
   * expects. Returns null when there's no current org context.
   */
  private resolveListPageOrg(): any {
    if (!this.selectedOrg) return null;
    if (typeof this.selectedOrg === 'object') return this.selectedOrg;
    // selectedOrg is a bare id; look it up in the org list we
    // already loaded for the list page (if system admin). For org
    // users, build a stub object so the popup dropdown displays
    // _something_ even though it never actually opens.
    const match = this.organisations?.find(
      (o: any) => String(o.id) === String(this.selectedOrg),
    );
    if (match) return match;
    // Id-only stub. The popup dropdown will still render blank in
    // its trigger because it can't find a matching option. Kick a
    // one-shot fetch to backfill the name so the next CD cycle has
    // a renderable label.
    const stub = { id: this.selectedOrg };
    this.backfillSeededOrgName(this.selectedOrg);
    return stub;
  }

  /**
   * One-shot fetch to resolve the seeded org's name when only its
   * id was available (e.g. JWT context for SYSTEM-ADMIN before
   * loadOrganisations() lands). Patches dsPickerOrgSelected in
   * place and also the preloaded-options list so the dropdown's
   * trigger and panel both render the name.
   */
  private backfillSeededOrgName(orgId: string): void {
    this.organisationService
      .listOrganisation({ page: 1, limit: 50 })
      .then((res: any) => {
        if (!this.globalService.handleSuccessService(res, false)) return;
        const match = (res?.data?.orgs ?? []).find(
          (o: any) => String(o.id) === String(orgId),
        );
        if (!match) return;
        // Only patch if the user hasn't already picked a different
        // org in the popup — that would clobber their choice.
        if (
          this.dsPickerOrgSelected &&
          String(this.dsPickerOrgSelected.id) === String(orgId)
        ) {
          this.dsPickerOrgSelected = match;
          if (this.dsPickerOrgPreloaded) {
            // Replace the id-only stub in the preloaded list, or
            // prepend if it isn't there.
            const idx = this.dsPickerOrgPreloaded.findIndex(
              (o: any) => String(o.id) === String(orgId),
            );
            if (idx >= 0) {
              const next = this.dsPickerOrgPreloaded.slice();
              next[idx] = match;
              this.dsPickerOrgPreloaded = next;
            }
          }
          this.cdr.markForCheck();
        }
      })
      .catch(() => {});
  }

  /** Page-1 prime for the popup org dropdown so it opens with
   *  content. Subsequent search/scroll goes through loadOrgsPage.
   *  Merges the page-1 list with whatever org we seeded (so the
   *  selected row stays visible if it wasn't on page 1). */
  private primeDsPickerOrgs(): void {
    this.organisationService
      .listOrganisation({ page: 1, limit: 10 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const orgs: any[] = res?.data?.orgs ?? [];
          const seeded = this.dsPickerOrgSelected;
          // If the page-1 results don't already include the seeded
          // org, prepend it so the dropdown can render its label.
          // Avoids a flicker where the trigger goes blank between
          // the synchronous seed and the page-1 arrival.
          if (
            seeded?.id &&
            seeded?.name &&
            !orgs.some(o => String(o.id) === String(seeded.id))
          ) {
            this.dsPickerOrgPreloaded = [seeded, ...orgs];
            this.dsPickerOrgPreloadedTotal =
              (res?.data?.count ?? orgs.length) + 1;
          } else {
            this.dsPickerOrgPreloaded = orgs;
            this.dsPickerOrgPreloadedTotal = res?.data?.count ?? orgs.length;
          }
        }
      })
      .catch(() => {
        this.dsPickerOrgPreloaded = [];
        this.dsPickerOrgPreloadedTotal = 0;
      });
  }

  /**
   * Fires when the popup's org dropdown changes (system admins
   * only — the dropdown isn't rendered for org-scoped users).
   * Cascades the reset: clear datasource + schema and re-prime
   * the datasource list against the new org.
   */
  onDsPickerOrgChange(): void {
    this.dsPickerSelected = null;
    this.dsPickerPreloaded = null;
    this.dsPickerPreloadedTotal = null;
    this.schemaPickerSelected = null;
    this.schemaPickerOptions = null;
    this.schemaPickerError = null;
    this.schemaPickerLoading = false;
    this.dsPickerSchemaToken++; // discard any in-flight schema fetch
    if (this.dsPickerOrgSelected?.id) {
      this.primeDatasourcePicker();
    }
    this.cdr.markForCheck();
  }

  closeDatasourcePicker(): void {
    this.showDsPickerPopup = false;
  }

  /**
   * Backdrop click handler. Closes the popup ONLY when the click
   * landed on the overlay element itself, not on a child of the
   * dialog. Replaces the previous pattern of `stopPropagation` on
   * the dialog body — that worked but ate PrimeNG's document-level
   * outside-click listener, leaving dropdown panels stuck open.
   * Comparing event.target against currentTarget keeps the
   * backdrop-close behaviour without interfering with anything
   * inside the dialog.
   */
  onDsPickerOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDatasourcePicker();
    }
  }

  /** Active org for the popup's datasource fetches. Falls back to
   *  the list page's org if the popup's local override is empty
   *  (e.g. mid-reset). */
  private get dsPickerActiveOrgId(): string | null {
    return this.dsPickerOrgSelected?.id || this.selectedOrg || null;
  }

  private primeDatasourcePicker(): void {
    const orgId = this.dsPickerActiveOrgId;
    if (!orgId) return;
    this.datasourceService
      .listDatasource({ orgId, page: 1, limit: 10 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.dsPickerPreloaded = res?.data?.datasources ?? [];
          this.dsPickerPreloadedTotal =
            res?.data?.count ?? this.dsPickerPreloaded?.length ?? 0;
        }
      })
      .catch(() => {
        this.dsPickerPreloaded = [];
        this.dsPickerPreloadedTotal = 0;
      });
  }

  /** Server-mode fetcher for the popup's datasource dropdown. */
  loadDsPickerPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const orgId = this.dsPickerActiveOrgId;
    if (!orgId) return { items: [], total: 0 };
    const params: any = { orgId, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Bumped on every datasource change in the popup. The schema
   * fetcher captures the value at request time and discards its
   * response if the token has changed — guards against the user
   * picking datasource A, then quickly switching to B; A's
   * response (in-flight) would otherwise overwrite B's state.
   */
  private dsPickerSchemaToken = 0;

  /**
   * Fires when the datasource dropdown changes. Reset the schema
   * selection / options / error, bump the staleness token, and
   * re-fetch for the new datasource. Cleared selection (user wiped
   * the dropdown) leaves the schema field disabled with no fetch.
   */
  onDsPickerDatasourceChange(): void {
    this.dsPickerSchemaToken++;
    this.schemaPickerSelected = null;
    this.schemaPickerOptions = null;
    this.schemaPickerError = null;
    this.schemaPickerLoading = false;
    const ds = this.dsPickerSelected;
    const orgId = this.dsPickerActiveOrgId;
    if (!ds?.id || !orgId) {
      this.cdr.markForCheck();
      return;
    }
    this.loadSchemasForPicker(String(orgId), String(ds.id));
  }

  private loadSchemasForPicker(orgId: string, datasourceId: string): void {
    const token = this.dsPickerSchemaToken;
    this.schemaPickerLoading = true;
    this.schemaPickerOptions = null;
    this.schemaPickerError = null;
    this.cdr.markForCheck();

    this.datasourceService
      .listDatasourceSchemas({ orgId, datasourceId })
      .then((res: any) => {
        // Discard if the user switched datasources before we got
        // here. The newer change handler has its own pending fetch.
        if (token !== this.dsPickerSchemaToken) return;
        if (this.globalService.handleSuccessService(res, false)) {
          // BE returns [{ schema_name, tables: [] }] per
          // src/modules/datasources/controllers/schema/listSchema.ts.
          // Map to a friendlier shape for the dropdown.
          const rows = res?.data ?? [];
          this.schemaPickerOptions = rows
            .map((r: any) => ({ name: r.schema_name }))
            .filter((s: any) => !!s.name);
          // Schema is optional — don't auto-select. If the user
          // wants to scope to one schema they pick it; if they leave
          // it blank Continue still works and the editor opens
          // against the whole datasource.
        } else {
          this.schemaPickerOptions = [];
          this.schemaPickerError =
            res?.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        }
        this.schemaPickerLoading = false;
        this.cdr.markForCheck();
      })
      .catch((err: any) => {
        if (token !== this.dsPickerSchemaToken) return;
        this.schemaPickerOptions = [];
        this.schemaPickerError =
          err?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.schemaPickerLoading = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Continue from the popup: route to /datasets/new with the picked
   * datasource (mandatory) and the picked schema (optional).
   *
   * When a schema is supplied the add page hard-scopes its sidebar
   * to that schema. When it isn't, the editor connects to the
   * datasource at the root level and shows every schema the user
   * has access to — same behaviour as before the schema selector
   * existed. Continue is enabled the moment a datasource is chosen;
   * schema is a "narrow the workspace" affordance, not a gate.
   */
  onDsPickerContinue(): void {
    if (!this.dsPickerSelected?.id) return;
    const queryParams: any = {
      datasourceId: this.dsPickerSelected.id,
    };
    if (this.schemaPickerSelected?.name) {
      queryParams.schema = this.schemaPickerSelected.name;
    }
    // Use the popup's chosen org (set by the org dropdown for system
    // admins, or seeded from the list page for org-scoped users)
    // rather than the list page's selectedOrg directly — a system
    // admin can pick a different org in the popup than the one
    // they're filtering the list by.
    const orgId = this.dsPickerActiveOrgId;
    if (orgId) queryParams.orgId = orgId;
    this.showDsPickerPopup = false;
    // Carry the full datasource record (already fetched from the
    // listDatasource paginator) through router state so the add page
    // doesn't have to re-hit GET /datasources/:org/:id just to
    // resolve name + dbType for the toolbar. That endpoint also
    // builds an expensive stats blob (size MB, row counts,
    // per-table index counts) — wasteful for the create flow where
    // none of that is rendered. The add page falls back to the
    // fetch on direct deep-link / refresh.
    this.router.navigate([DATASET.ADD], {
      queryParams,
      state: { datasource: this.dsPickerSelected },
    });
  }

  onAddViaPrompts() {
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
    this.showQueryBuilderPopup = true;
    this.loadQueryBuilders();
    setTimeout(() => this.qbSearchInput?.nativeElement?.focus());
  }

  closeQueryBuilderPopup() {
    this.showQueryBuilderPopup = false;
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
  }

  onQbSearch() {
    this.qbActiveIndex = -1;
    this.qbFilter$.next();
  }

  onQbKeydown(event: KeyboardEvent) {
    const len = this.queryBuilders.length;
    if (!len) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex < len - 1 ? this.qbActiveIndex + 1 : 0;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex > 0 ? this.qbActiveIndex - 1 : len - 1;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'Enter' && this.qbActiveIndex >= 0) {
      event.preventDefault();
      this.onQueryBuilderSelect(this.queryBuilders[this.qbActiveIndex]);
    } else if (event.key === 'Escape') {
      this.closeQueryBuilderPopup();
    }
  }

  private scrollQbActiveIntoView() {
    setTimeout(() => {
      const el = document.querySelector('.cmd-row.active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  private loadQueryBuilders() {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    this.loadingQueryBuilders = true;
    // Command-palette popup: search is debounced + server-side, so the user
    // narrows results by typing. Capped to 50 per page; if there are more,
    // they can refine the query rather than scroll a huge list.
    const params: any = {
      orgId: this.selectedOrg,
      datasourceId: this.selectedDatasource,
      page: 1,
      limit: 50,
    };

    const term = this.qbSearchTerm.trim();
    if (term) {
      params.filter = JSON.stringify({ name: term });
    }

    this.queryBuilderService
      .listQueryBuilder(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilders = response.data?.queryBuilders || [];
          this.qbTotalRecords =
            response.data?.count || this.queryBuilders.length;
        } else {
          this.queryBuilders = [];
          this.qbTotalRecords = 0;
        }
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.queryBuilders = [];
        this.qbTotalRecords = 0;
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      });
  }

  onQueryBuilderSelect(queryBuilder: any) {
    this.showQueryBuilderPopup = false;
    this.router.navigate([
      QUERY_BUILDER.run(
        this.selectedOrg,
        this.selectedDatasource,
        queryBuilder.id,
      ),
    ]);
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.edit(this.selectedOrg, id)]);
  }

  useAsAnalysis(id: string) {
    this.analysisDatasetId = id;
    this.showCreateAnalysisDialog = true;
  }

  onCreateAnalysisDialogClose(result: AnalysisFormData | null) {
    if (result && this.analysisDatasetId) {
      this.analysesService
        .addAnalyses({
          name: result.name,
          description: result.description,
          datasetId: this.analysisDatasetId,
          organisation: this.selectedOrg,
          datasource: this.selectedDatasource,
        })
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, true)) {
            this.router.navigate([ANALYSES.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showCreateAnalysisDialog = false;
    this.analysisDatasetId = '';
  }

  confirmDuplicate(dataset: any) {
    this.datasetToDuplicate = dataset;
    this.showDuplicateDialog = true;
  }

  onDuplicateDialogClose(result: DatasetFormData | null) {
    if (result && this.datasetToDuplicate) {
      this.datasetService
        .duplicateDataset(
          this.selectedOrg,
          this.datasetToDuplicate.id,
          result.name,
          result.description,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadDatasets();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showDuplicateDialog = false;
    this.datasetToDuplicate = null;
  }

  confirmDelete(id: string) {
    this.datasetToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.datasetToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDatasets.map((d: any) => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.datasetService
        .bulkDeleteDataset(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedDatasets = [];
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.datasetToDelete) {
      this.datasetService
        .deleteDataset(this.selectedOrg, this.datasetToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedDatasets = this.selectedDatasets.filter(
              (d: any) => d.id !== this.datasetToDelete,
            );
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadDatasets(this.lastTableLazyLoadEvent);
    } else {
      this.loadDatasets();
    }
  }
}
