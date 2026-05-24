import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, Subject, TimeoutError } from 'rxjs';
import { debounceTime, first, timeout } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { DATASET } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { IAPIResponse } from 'src/app/core/models/global.model';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from 'src/app/modules/datasource/constants/database-types.constant';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import {
  DIALECT_LINT_DEBOUNCE_MS,
  ENABLE_DIALECT_LINT,
  MONACO_EDITOR_OPTIONS,
  QUERY_EXECUTION_TIMEOUT_MS,
  SQL_EDITOR_PLACEHOLDER,
} from '../../config/sql-editor.config';
import {
  DatasourceSchema,
  QueryExecuteData,
  QueryResult,
} from '../../helpers/dummy-data.helper';
import {
  flexLastColumn,
  formatCellValue,
  measureColumnWidths,
} from '../../helpers/cell-formatter.helper';
import { SchemaTransformerHelper } from '../../helpers/schema-transformer.helper';
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../../models/query-tab.model';
import { DatasetService } from '../../services/dataset.service';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import { SqlFormatterService } from '../../services/sql-formatter.service';
import { SqlLinterService } from '../../services/sql-linter.service';
import { SqlValidatorService } from '../../services/sql-validator.service';
import {
  AddDatasetActions,
  SchemaLoadingStatus,
  selectIsSchemaStale,
  selectSchemaByKey,
} from '../../store';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

import { expandAnimation } from '../../animations/expand.animation';

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [expandAnimation],
})
export class AddDatasetComponent
  implements OnInit, OnDestroy, AfterViewInit, OnChanges, HasUnsavedChanges
{
  // ViewChild for file input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('sqlEditorContainer')
  sqlEditorContainer!: ElementRef<HTMLDivElement>;

  // Removed ViewChild as we now use dynamic containers per tab
  @Input() datasourceId?: string;
  @Input() orgId?: string;
  @Input() initialQuery?: string;

  editor: any;
  isLoadingEditor = true;
  isLoadingSchema = false;
  isExecutingQuery = false;
  monacoLoadFailed = false;
  queryResult: QueryResult | null = null;

  /**
   * True when the BE was able to discover types for at least one
   * column in the current result. Postgres always returns types
   * via pg_typeof; other dialects ship an empty `columnTypes` map
   * (driver field-metadata wiring is a follow-up). Hides the type
   * chip row in the results popup when no types are available so
   * the header doesn't read as a wall of em-dashes.
   */
  get hasAnyColumnType(): boolean {
    const types = this.queryResult?.columnTypes;
    return !!types && Object.keys(types).length > 0;
  }

  /**
   * Tracks which JSON cells in the result grid the user has
   * expanded. JSON cells render as a single-line summary by
   * default so one fat document doesn't make every row in the
   * grid 6em tall; clicking the expand chevron flips the cell
   * into a pre-wrapped multi-line view. Key = `${rowIndex}-${col}`
   * because column names alone aren't unique across rows.
   * Cleared on each new query result (see executeQuery handlers).
   */
  expandedJsonCells = new Set<string>();

  /**
   * Per-column pixel width applied to the result grid's <colgroup>.
   * Computed once per result via measureColumnWidths so columns
   * auto-fit their content instead of all sharing equal width.
   * Once applied, PrimeNG's [resizableColumns] lets the user drag
   * column borders to adjust; we don't write back to this map
   * during drag (PrimeNG manages the live width via the DOM).
   * Reset on every new query so stale widths don't bleed across
   * result sets.
   */
  columnWidths: Record<string, number> = {};

  /**
   * Cell-level right-click context menu state. Standard fare in
   * every database GUI (DBeaver, DataGrip, pgAdmin, TablePlus) —
   * users reach for it within seconds of trying to grab a value
   * out of the grid.
   *
   * The menu offers two actions:
   *   - Copy cell    — the displayed value of the right-clicked
   *                    cell, via formatCellValue so what the user
   *                    sees on screen is what lands on the clipboard
   *                    (the BIGINT preserved as string, the ISO
   *                    date, the JSON pretty-printed body).
   *   - Copy column  — the displayed values for all rows on the
   *                    current page, joined with newlines. Useful
   *                    for "grab all the email addresses out of
   *                    this query" workflows.
   *
   * Position is captured at click time; menu closes on any outside
   * click (handled by the existing boundCloseContextMenu listener)
   * or after a menu item is invoked.
   */
  showCellContextMenu = false;
  cellContextMenuTop = 0;
  cellContextMenuLeft = 0;
  private cellContextTarget: { rowIndex: number; col: string } | null = null;

  /** Stable key for the expanded-set above. */
  jsonCellKey(rowIndex: number, col: string): string {
    return `${rowIndex}-${col}`;
  }

  /** Toggle the expanded state for one JSON cell. The template
   *  reads `expandedJsonCells.has(key)` to decide between the
   *  summary line and the multi-line `<pre>`. */
  toggleJsonCell(rowIndex: number, col: string): void {
    const key = this.jsonCellKey(rowIndex, col);
    if (this.expandedJsonCells.has(key)) {
      this.expandedJsonCells.delete(key);
    } else {
      this.expandedJsonCells.add(key);
    }
    // Mutating the Set in place doesn't trip OnPush — re-assign
    // so the @Input-style equality checks fire. (Cheap; Set
    // construction over a tiny set is negligible.)
    this.expandedJsonCells = new Set(this.expandedJsonCells);
  }

  datasources: DatasourceSchema[] = [];
  currentQuery = '';

  // Theme monitoring
  private themeObserver: MutationObserver | null = null;
  private currentTheme: string = 'vs-dark';

  // Bound listener reference (for proper removeEventListener)
  private boundCloseContextMenu = this.closeContextMenu.bind(this);

  // Database sidebar
  showDatasourceSidebar = true;
  /**
   * Single set of expanded tree paths, keyed by composite strings:
   *   `${dbId}` for datasource rows
   *   `${dbId}.${schemaName}` for schema rows
   *   `${dbId}.${schemaName}.${tableName}` for table rows
   * Replaces the previous three separate dictionaries — one source of truth
   * means collapse cascades and refreshes don't fall out of sync.
   */
  expandedPaths = new Set<string>();
  /**
   * When the user opens add-dataset via the list-page popup we pass
   * a `schema` query param. The sidebar filter pipe (filterSchemas)
   * reads this and shows only that schema; cross-schema queries
   * still work (the editor doesn't reject them) but the tree is
   * scoped. Null = no scoping; show every schema as before.
   */
  scopedSchema: string | null = null;

  /**
   * True when the user arrived via `?schema=X` AND that schema's
   * tables fetch came back with a 404 / failure. Used to grey out
   * the SQL editor and block Run — without the scoped schema we
   * can't trust the autocomplete OR resolve unqualified table
   * references, so letting the user type into the editor would
   * produce queries that can't validate. Calculated on every
   * change-detection cycle by checking the matching schema row's
   * `tablesError` flag.
   */
  get scopedSchemaUnavailable(): boolean {
    if (!this.scopedSchema || !this.selectedDatasourceObj?.id) return false;
    const tree = this.datasourceSchemas[this.selectedDatasourceObj.id];
    const schema = tree?.schemas?.find(
      (s: any) => s.name === this.scopedSchema,
    ) as any;
    return !!schema?.tablesError;
  }

  /** Convenience for the template — the actual error message
   *  pulled from the scoped schema's tablesError, if any. */
  get scopedSchemaErrorMessage(): string | null {
    if (!this.scopedSchema || !this.selectedDatasourceObj?.id) return null;
    const tree = this.datasourceSchemas[this.selectedDatasourceObj.id];
    const schema = tree?.schemas?.find(
      (s: any) => s.name === this.scopedSchema,
    ) as any;
    return schema?.tablesError || null;
  }
  schemaSearchText = '';
  selectedDatasource: string = '';
  selectedSchema: string = '';

  // Context Menu
  showContextMenu = false;
  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];
  contextMenuDatasource: any | null = null;

  // Save as Dataset Dialog
  showDatasetDialog = false;

  // Results bottom sheet
  showResultsPopup = false;
  resultRows = 25;
  resultPage = 1;
  isExportingResults = false;
  resultFilterValues: { [key: string]: string } = {};
  private resultFilterSubject = new Subject<void>();
  private lastExecutedQuery = '';
  private lastResultsLazyEvent: any = null;

  /**
   * Sheet height in pixels. Default lands at ~45% of viewport but
   * never tinier than 240px (single row + paginator + header) nor
   * larger than viewport - 100px (keep some editor visible). Drag
   * handle clamps to the same range. Persisted across sessions
   * once the user adjusts it.
   */
  resultSheetHeightPx = 420;

  /**
   * When true the sheet collapses to its 40px-tall header strip
   * — the user can still see row count + Export + Show button.
   * Re-running the query auto-expands. Persisted across sessions.
   */
  isResultSheetCollapsed = false;

  /** Active drag state. While truthy, mousemove updates the
   *  height live and mouseup persists. */
  private sheetDragState: {
    startY: number;
    startHeight: number;
    onMove: (ev: MouseEvent) => void;
    onUp: () => void;
  } | null = null;

  get isPaginationEnabled(): boolean {
    return !!this.queryResult;
  }

  /**
   * Whether to render the paginator chrome (« ‹ 1 › » + page-size
   * dropdown). Lazy-load + total-count + filtering all still need
   * `isPaginationEnabled` to keep working in server-side mode; this
   * getter is purely the "should the chrome be visible" decision.
   * Hides when the entire result fits on one page so the popup
   * doesn't show a paginator for a 7-row query.
   */
  get isPaginatorNeeded(): boolean {
    return (
      !!this.queryResult && (this.queryResult.rowCount ?? 0) > this.resultRows
    );
  }

  // Change Confirmation Dialog
  showChangeConfirmDialog = false;
  pendingDatasourceChange: any = null;
  pendingOrgChange: any = null;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  private signatureHelpDisposable: any = null;
  /** Debounce handle for dialect lint. Cleared in ngOnDestroy. */
  private dialectLintTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monaco markers owner-id for the lint pass. Stable string so
   *  successive setModelMarkers() calls replace the previous batch. */
  private static readonly DIALECT_LINT_OWNER = 'sql-dialect-lint';

  // Organisation Management
  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  selectedOrg: any = {};
  userRole: string = '';
  showOrganisationDropdown: boolean = false;
  availableDatasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasourceObj: any = null;

  /**
   * Resolves the active datasource's engine to a DatabaseTypeOption so
   * the template can render the dbType badge (icon + label) next to the
   * datasource dropdown. Null when no datasource is selected. Falls back
   * to the Postgres entry for unknown / missing dbType (legacy rows).
   */
  get selectedDbTypeOption(): DatabaseTypeOption | null {
    const dbType = this.selectedDatasourceObj?.config?.dbType;
    if (!dbType) return null;
    return (
      DATABASE_TYPES.find(t => t.value === dbType) ??
      DATABASE_TYPES.find(t => t.value === 'postgres') ??
      null
    );
  }

  // Database Schema Management
  datasourceSchemas: { [dbId: string]: DatasourceSchema } = {};
  loadingDatasources: { [dbId: string]: boolean } = {};
  isLoadingDatasources: boolean = false;
  /**
   * Per-datasource mode flag the BE returns with the bulk schema
   * tree. `eager` = columns shipped inline (typical case);
   * `lazy` = warehouse-scale database, BE auto-degraded to schemas
   * + tables only, columns fetched per-table on first use. Lets
   * the sidebar tell the user why their first column reference
   * takes a beat to resolve.
   */
  schemaTreeMode: { [dbId: string]: 'eager' | 'lazy' } = {};
  // Sequence counter incremented on every datasource/org switch. Async schema
  // load callbacks compare against this to discard responses for selections
  // the user has already moved away from.
  private schemaSelectionToken = 0;

  // NgRx Store Observables for schema caching
  private schemaDataObservables: Map<string, Observable<any | null>> =
    new Map();
  private schemaStatusObservables: Map<
    string,
    Observable<SchemaLoadingStatus>
  > = new Map();

  get filteredAvailableDatasources(): any[] {
    if (!this.schemaSearchText) {
      return this.availableDatasources;
    }
    const search = this.schemaSearchText.toLowerCase();
    return this.availableDatasources.filter(db =>
      db.name.toLowerCase().includes(search),
    );
  }

  get isQueryEmpty(): boolean {
    const query = this.currentQuery.trim();
    const defaultQuery = SQL_EDITOR_PLACEHOLDER;
    return !query || query === defaultQuery;
  }

  private _saved = false;

  hasUnsavedChanges(): boolean {
    return !this.isQueryEmpty && !this._saved;
  }

  getFilteredTables(tables: any[]): any[] {
    if (!this.schemaSearchText) {
      return tables;
    }
    const search = this.schemaSearchText.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(search));
  }

  getFilteredSchemas(schemas: any[]): any[] {
    if (!schemas || !this.schemaSearchText) {
      return schemas || [];
    }
    const search = this.schemaSearchText.toLowerCase();
    return schemas.filter(schema => {
      // Show schema if its name matches or if any of its tables match
      const schemaNameMatches = schema.name.toLowerCase().includes(search);
      const hasMatchingTable = schema.tables.some((table: any) =>
        table.name.toLowerCase().includes(search),
      );
      return schemaNameMatches || hasMatchingTable;
    });
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  trackByIndex(index: number): number {
    return index;
  }

  private destroyRef = inject(DestroyRef);
  saving = this.datasetService.saving;

  constructor(
    private queryService: QueryService,
    private datasourceService: DatasourceService,
    private monacoIntelliSenseService: MonacoIntelliSenseService,
    private sqlFormatterService: SqlFormatterService,
    private sqlLinterService: SqlLinterService,
    private sqlValidatorService: SqlValidatorService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService,
    private store: Store,
    private cdr: ChangeDetectorRef,
    private monacoLoader: MonacoLoaderService,
    private translate: TranslateService,
  ) {
    this.userRole = this.globalService.getTokenDetails('role') || '';
    this.showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  }

  ngOnInit(): void {
    // Restore the user's preferred result-grid page size so a
    // returning user doesn't have to flip the dropdown from the
    // default every time. localStorage may be unavailable in
    // Safari private mode → fail silently.
    this.loadPersistedPageSize();
    // Same idea for the bottom sheet's height + collapsed state.
    // First-run users get a sensible 45vh default.
    this.loadPersistedSheetState();

    // Setup debounce for result filter changes
    this.resultFilterSubject
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.lastExecutedQuery) return;

        // Reset to first page on filter change
        this.resultPage = 1;

        // Build filter object from non-empty filter values
        const filter: { [key: string]: string } = {};
        for (const col of Object.keys(this.resultFilterValues)) {
          if (this.resultFilterValues[col]) {
            filter[col] = this.resultFilterValues[col];
          }
        }

        this.executeQueryForDatasource(
          this.lastExecutedQuery,
          1,
          this.resultRows,
          filter,
        );
      });

    // Resolve the active org. System admins used to pick from a
    // dropdown; with the popup flow they arrive with both `orgId`
    // (system-admin context) and `datasourceId` on the query string.
    // Regular org users get their org from the JWT.
    const qp = this.route.snapshot.queryParamMap;
    const queryOrgId = qp.get('orgId');
    const queryDatasourceId = qp.get('datasourceId');
    const querySchema = qp.get('schema');
    if (querySchema) {
      // Scope the editor to a single schema. The sidebar filter
      // pipe reads `scopedSchema` and hides every other schema row;
      // the picked one auto-expands on load so the user lands
      // straight in the tables list.
      this.scopedSchema = querySchema;
      this.expandedPaths.add(`${queryDatasourceId}.${querySchema}`);
    }

    if (queryOrgId) {
      this.selectedOrg = { id: queryOrgId };
    } else if (this.showOrganisationDropdown) {
      // Legacy fallback for system admins who deep-linked without the
      // popup (e.g. browser-history / refresh). The org dropdown is
      // gone from the template, so we just resolve the first org and
      // proceed; if there are none, the loadDatasources call below
      // will show the empty state.
      this.loadOrganisationsAndPickFirst();
      this.initializeComponent();
      return;
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
    }

    if (queryDatasourceId) {
      // Preselected path: skip the datasource list page entirely; just
      // fetch the one record and bootstrap straight into the editor.
      this.bootstrapPreselectedDatasource(queryDatasourceId);
    } else {
      this.loadDatasources();
    }
    this.initializeComponent();
  }

  /**
   * Legacy fallback when a system admin lands on /datasets/new without
   * the popup flow (e.g. browser back/refresh that loses the query
   * params). Loads orgs, picks the first, proceeds. Used to live
   * inline in ngOnInit; extracted so the popup-driven path can skip
   * it entirely.
   */
  private loadOrganisationsAndPickFirst(): void {
    const params = { page: DEFAULT_PAGE, limit: 10 };
    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const orgs = response?.data?.orgs ?? [];
          this.organisations = [...orgs];
          this.preloadedOrgs = orgs;
          this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
          if (orgs.length > 0) {
            this.selectedOrg = orgs[0];
            this.loadDatasources();
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /**
   * Fetch the preselected datasource record (set via ?datasourceId=
   * from the list-dataset popup) and treat it as the active selection.
   * No dropdown UI; the dbType badge picks it up from
   * `selectedDatasourceObj.config.dbType`.
   */
  private bootstrapPreselectedDatasource(datasourceId: string): void {
    if (!this.selectedOrg?.id) return;

    // Fast path — the list-dataset popup carries the full datasource
    // record through router state when the user clicks Continue.
    // That record already has id / name / config (with dbType), which
    // is everything the toolbar needs. Avoids hitting GET
    // /datasources/:org/:id, which builds an expensive stats blob
    // (size MB, row counts, per-table index counts) we don't render
    // on this page.
    const navState = this.router.getCurrentNavigation()?.extras?.state as
      | { datasource?: any }
      | undefined;
    const stateDs =
      navState?.datasource ??
      // Angular replays state via window.history.state on refresh of
      // the same SPA navigation; also check that fallback.
      (window.history?.state?.datasource ?? null);

    if (stateDs?.id && String(stateDs.id) === String(datasourceId)) {
      this.applyPreselectedDatasource(stateDs);
      return;
    }

    // Slow path — direct deep-link / browser refresh / external
    // navigation that didn't pass router state. Fall back to the
    // full fetch; the toolbar still needs the dbType to render
    // dialect-aware autocomplete.
    this.isLoadingDatasources = true;
    this.datasourceService
      .viewDatasource(String(this.selectedOrg.id), datasourceId)
      .then((res: any) => {
        this.isLoadingDatasources = false;
        if (this.globalService.handleSuccessService(res, false)) {
          const ds = res?.data;
          if (ds?.id) this.applyPreselectedDatasource(ds);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDatasources = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Common landing point for both fast (router state) and slow
   * (fetched) bootstrap paths — wires the selected datasource into
   * the component, mirrors it into the lookup lists used by the
   * dbType badge resolver, and triggers the lazy schema load.
   */
  private applyPreselectedDatasource(ds: any): void {
    this.selectedDatasourceObj = ds;
    this.preloadedDatasources = [ds];
    this.preloadedDatasourcesTotal = 1;
    this.availableDatasources = [ds];
    this.proceedWithDatasourceChange(ds);
  }

  private initializeComponent(): void {
    // Setup theme monitoring
    this.setupThemeObserver();

    // Close context menus on click outside
    document.addEventListener('click', this.boundCloseContextMenu);
  }

  /**
   * Fetcher for the server-mode organisation dropdown.
   */
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

  loadOrganisations(): void {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const orgs = response?.data?.orgs ?? [];
          this.organisations = [...orgs];
          this.preloadedOrgs = orgs;
          this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
          if (this.organisations.length > 0) {
            this.selectedOrg = this.organisations[0];
            this.loadDatasources();
            this.initializeComponent();
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onDatasourceChange(event: any): void {
    const selectedDb = event.value;
    if (!selectedDb || !selectedDb.id) return;

    // Check if editor has unsaved content
    const editorValue = this.editor ? this.editor.getValue().trim() : '';
    const hasContent = editorValue.length > 0;
    const defaultContent = SQL_EDITOR_PLACEHOLDER;
    const isDefaultContent = editorValue === defaultContent.trim();

    // Only show confirmation if there's actual user content (not empty and not default)
    if (hasContent && !isDefaultContent && this.selectedDatasourceObj) {
      // Show confirmation dialog
      this.pendingDatasourceChange = selectedDb;
      this.showChangeConfirmDialog = true;
      // Revert dropdown to current selection
      setTimeout(() => {
        this.selectedDatasourceObj = this.selectedDatasourceObj;
      }, 0);
      return;
    }

    this.proceedWithDatasourceChange(selectedDb);
  }

  private proceedWithDatasourceChange(selectedDb: any): void {
    // Bump the selection token so any in-flight schema responses for the
    // previously-selected datasource will be discarded when they return.
    const token = ++this.schemaSelectionToken;

    // Reset editor and results
    this.resetEditor();

    // Push the new dbType into the IntelliSense service so keyword /
    // function suggestions match the dialect the user is now writing
    // against. Cheap — providers stay registered and read this lazily.
    this.monacoIntelliSenseService.setActiveDbType(
      selectedDb?.config?.dbType ?? null,
    );

    // Expand the database in the tree
    this.expandedPaths.add(selectedDb.id);

    // Always load schema from API (don't use cached data)
    this.loadDatasourceSchema(selectedDb.id).then(() => {
      // If the user switched away while we were loading, don't initialize
      // the editor based on stale state.
      if (token !== this.schemaSelectionToken) return;
      // Initialize editor if not already done
      if (!this.editor) {
        setTimeout(() => this.loadMonacoEditor(), 100);
      }
    });
  }

  loadDatasources(): void {
    if (!this.selectedOrg || !this.selectedOrg.id) return;

    this.isLoadingDatasources = true;
    this.selectedDatasourceObj = null;
    const params = {
      orgId: this.selectedOrg.id,
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        this.isLoadingDatasources = false;
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.availableDatasources = items;

          // Auto-select the first database and load its schema
          if (this.availableDatasources.length > 0) {
            this.selectedDatasourceObj = this.availableDatasources[0];
            this.proceedWithDatasourceChange(this.selectedDatasourceObj);
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDatasources = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for the server-mode datasource dropdown. Pulls orgId from
   * selectedOrg (which is the full object in this component).
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
    if (!this.selectedOrg?.id) return { items: [], total: 0 };
    const params: any = { orgId: this.selectedOrg.id, page, limit };
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

  refreshDatasources(): void {
    // Collapse all expanded nodes
    this.expandedPaths.clear();

    // Clear all cached schema data
    this.datasourceSchemas = {};
    this.loadingDatasources = {};

    // Clear the datasources array for IntelliSense
    this.datasources = [];
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;

    // Reload the database list
    this.loadDatasources();
  }

  refreshSingleDatasource(dbId: string): void {
    if (!dbId || !this.selectedOrg?.id) return;

    const orgId = this.selectedOrg.id.toString();
    const dbIdStr = dbId.toString();

    // Dispatch refresh action to clear cache and reload
    this.store.dispatch(
      AddDatasetActions.refreshSchemaData({
        orgId,
        dbId: dbIdStr,
      }),
    );

    // Collapse this database's tree (datasource itself + schemas + tables).
    // One pass over the path set handles all three levels.
    this.collapseSubtree(dbId);

    // Clear local cache
    delete this.datasourceSchemas[dbId];
    delete this.loadingDatasources[dbId];

    // Remove from IntelliSense datasources array
    this.datasources = this.datasources.filter(
      db => db.name !== dbId.toString(),
    );

    // Re-fetch schema for this database from API
    this.loadDatasourceSchemaFromAPI(dbId);
  }

  refreshSelectedDatasource(): void {
    if (!this.selectedDatasourceObj || !this.selectedDatasourceObj.id) return;
    this.refreshSingleDatasource(this.selectedDatasourceObj.id);
  }

  onOrgChange(event: any): void {
    const newOrg = event.value;

    // Check if editor has unsaved content
    const editorValue = this.editor ? this.editor.getValue().trim() : '';
    const hasContent = editorValue.length > 0;
    const defaultContent = SQL_EDITOR_PLACEHOLDER;
    const isDefaultContent = editorValue === defaultContent.trim();

    // Only show confirmation if there's actual user content (not empty and not default)
    if (hasContent && !isDefaultContent && this.selectedOrg?.id) {
      // Show confirmation dialog
      this.pendingOrgChange = newOrg;
      this.showChangeConfirmDialog = true;
      // Revert dropdown to current selection
      setTimeout(() => {
        this.selectedOrg = this.selectedOrg;
      }, 0);
      return;
    }

    this.proceedWithOrgChange(newOrg);
  }

  private proceedWithOrgChange(newOrg: any): void {
    // Discard any in-flight schema responses tied to the previous org.
    this.schemaSelectionToken++;

    this.selectedOrg = newOrg;
    this.orgId = this.selectedOrg.id;

    // Reset editor and results
    this.resetEditor();

    // Clear existing data
    this.availableDatasources = [];
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;
    this.selectedDatasourceObj = null;
    this.datasourceSchemas = {};
    this.expandedPaths.clear();

    // Reload datasources for the new organisation
    this.loadDatasources();
  }

  /**
   * Get current theme based on body class
   */
  private getCurrentTheme(): string {
    const isDarkTheme = document.body.classList.contains('dark-theme');
    return isDarkTheme ? 'vs-dark' : 'vs';
  }

  /**
   * Setup MutationObserver to watch for theme changes
   */
  private setupThemeObserver(): void {
    this.currentTheme = this.getCurrentTheme();

    // Watch for theme changes on body element
    this.themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          const newTheme = this.getCurrentTheme();
          if (newTheme !== this.currentTheme) {
            this.currentTheme = newTheme;
            this.updateEditorTheme();
          }
        }
      });
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  /**
   * Update Monaco Editor theme
   */
  private updateEditorTheme(): void {
    if (this.editor) {
      monaco.editor.setTheme(this.currentTheme);
    }
  }

  ngAfterViewInit(): void {
    this.loadMonacoEditor();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update editor content if initialQuery changes
    if (
      changes['initialQuery'] &&
      this.editor &&
      changes['initialQuery'].currentValue
    ) {
      this.editor.setValue(changes['initialQuery'].currentValue);
    }
  }

  ngOnDestroy(): void {
    this.resultFilterSubject.complete();

    if (this.editor) {
      this.editor.dispose();
    }

    // Dispose IntelliSense providers
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
    }
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
    }
    if (this.signatureHelpDisposable) {
      this.signatureHelpDisposable.dispose();
    }

    // Cancel any pending lint pass so it doesn't fire after the
    // editor (and its model) have been torn down.
    if (this.dialectLintTimer) {
      clearTimeout(this.dialectLintTimer);
      this.dialectLintTimer = null;
    }

    // Dispose formatter and validator
    this.sqlFormatterService.dispose();
    this.sqlValidatorService.dispose();

    // Cleanup theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    // Remove context menu listener
    document.removeEventListener('click', this.boundCloseContextMenu);
  }

  private loadMonacoEditor(): void {
    this.monacoLoader
      .load()
      .then(() => {
        this.initMonaco();
      })
      .catch(() => {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.showMonacoLoadError();
        this.cdr.markForCheck();
      });
  }

  private showMonacoLoadError(): void {}

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  private initMonaco(): void {
    if (!this.selectedDatasourceObj) {
      this.isLoadingEditor = false;
      this.cdr.markForCheck();
      return;
    }

    // Wait for the DOM to be ready
    setTimeout(() => {
      const container = this.sqlEditorContainer?.nativeElement;
      if (!container) {
        this.isLoadingEditor = false;
        this.cdr.markForCheck();
        return;
      }

      try {
        // Dispose previous editor if exists
        if (this.editor) {
          this.editor.dispose();
        }

        const initialValue = this.initialQuery || SQL_EDITOR_PLACEHOLDER;

        // Create Monaco Editor instance. `readOnly` reflects the
        // current scopedSchemaUnavailable state — if the user
        // arrived via ?schema=X and that schema 404'd before the
        // editor mounted, start the editor locked so they don't
        // type a query that can't execute.
        this.editor = monaco.editor.create(container, {
          ...MONACO_EDITOR_OPTIONS,
          value: initialValue,
          theme: this.currentTheme,
          readOnly: this.scopedSchemaUnavailable,
        });
        this.currentQuery = initialValue;

        // Focus the editor
        this.editor.focus();

        // Register IntelliSense
        this.registerIntelliSenseProviders();

        // Register SQL Formatter
        this.sqlFormatterService.registerFormattingProvider();
        this.sqlFormatterService.registerContextMenuActions(this.editor);

        // Setup SQL Validator with real-time validation. Monaco events fire
        // outside Angular's zone, so OnPush won't notice the currentQuery
        // change without an explicit markForCheck — the Run button stays
        // greyed out as the user types otherwise.
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
          this.sqlValidatorService.validateDebounced(this.editor.getModel());
          this.scheduleDialectLint();
          this.cdr.markForCheck();
        });

        // Initial validation
        this.sqlValidatorService.validate(this.editor.getModel());
        this.scheduleDialectLint();

        // Add keyboard shortcuts via service
        this.monacoIntelliSenseService.registerKeyboardShortcuts(
          this.editor,
          () => this.executeQuery(),
        );

        // Add custom context menu items
        this.editor.addAction({
          id: 'execute-complete-query',
          label: 'Execute Complete Query',
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.5,
          run: () => {
            this.executeCompleteQuery();
          },
        });

        this.editor.addAction({
          id: 'execute-selection',
          label: 'Execute Selected Query',
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.6,
          precondition: 'editorHasSelection',
          run: () => {
            const selection = this.editor.getSelection();
            const selectedText = this.editor
              .getModel()
              .getValueInRange(selection);
            if (selectedText.trim()) {
              this.executeSelectedQuery(selectedText);
            }
          },
        });

        this.isLoadingEditor = false;
        this.cdr.markForCheck();
      } catch (error) {
        this.isLoadingEditor = false;
        this.cdr.markForCheck();
      }
    }, 100);
  }

  /**
   * Debounced dialect-aware lint pass. Re-parses the model with the
   * active dialect's grammar, surfaces error nodes as Monaco markers.
   * No-op when the feature flag is off so the rest of Phase 2 can ship
   * without exposing this surface to users.
   */
  private scheduleDialectLint(): void {
    if (!ENABLE_DIALECT_LINT) return;
    if (!this.editor) return;
    if (this.dialectLintTimer) clearTimeout(this.dialectLintTimer);
    this.dialectLintTimer = setTimeout(() => {
      this.dialectLintTimer = null;
      this.runDialectLint();
    }, DIALECT_LINT_DEBOUNCE_MS);
  }

  private runDialectLint(): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;
    const dbType =
      this.selectedDatasourceObj?.config?.dbType ?? null;
    const markers = this.sqlLinterService.lint(model.getValue(), dbType);
    monaco.editor.setModelMarkers(
      model,
      AddDatasetComponent.DIALECT_LINT_OWNER,
      markers,
    );
  }

  /**
   * Register IntelliSense providers
   */
  private registerIntelliSenseProviders(): void {
    // Dispose previous providers if they exist
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
    }
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
    }
    if (this.signatureHelpDisposable) {
      this.signatureHelpDisposable.dispose();
    }

    // Register new providers and store disposables
    if (this.editor) {
      this.completionProviderDisposable =
        this.monacoIntelliSenseService.registerSQLCompletions(
          this.datasources,
          this.editor,
        );
      this.hoverProviderDisposable =
        this.monacoIntelliSenseService.registerHoverProvider(this.datasources);
      this.signatureHelpDisposable =
        this.monacoIntelliSenseService.registerSignatureHelpProvider();
    }
  }

  private async loadDatasourceSchema(dbId: string): Promise<void> {
    if (!dbId || !this.selectedOrg?.id) return Promise.resolve();

    const orgId = this.selectedOrg.id.toString();
    const dbIdStr = dbId.toString();

    // Check if we have cached data in the store
    return new Promise((resolve, reject) => {
      this.store
        .select(selectSchemaByKey(orgId, dbIdStr))
        .pipe(first())
        .subscribe(cachedEntry => {
          if (!cachedEntry || !cachedEntry.data) {
            // No cached data, load from API
            this.loadDatasourceSchemaFromAPI(dbId).then(resolve).catch(reject);
          } else {
            // Check if data is stale
            this.store
              .select(selectIsSchemaStale(orgId, dbIdStr))
              .pipe(first())
              .subscribe(isStale => {
                if (isStale) {
                  // Data is stale, refresh from API
                  this.loadDatasourceSchemaFromAPI(dbId)
                    .then(resolve)
                    .catch(reject);
                } else {
                  // Use cached data
                  this.applyCachedSchemaData(dbId, cachedEntry.data);
                  resolve();
                }
              });
          }
        });
    });
  }

  /**
   * Apply cached schema data from store to component state
   */
  private applyCachedSchemaData(dbId: string, schemaData: any): void {
    // Tag the schema record with its dbType so hover / completion can
    // resolve the right dialect even when several datasources are loaded
    // into the IntelliSense cache simultaneously. The transformer doesn't
    // know the dbType (the API schema response doesn't include it), so
    // we annotate post-hoc from the matching datasource record.
    const dbType = this.getDbTypeFor(dbId);
    if (schemaData && dbType) {
      schemaData = { ...schemaData, dbType };
    }
    this.datasourceSchemas[dbId] = schemaData;

    // Push fresh schema into the IntelliSense cache. The completion/hover
    // providers read this lazily on each invocation, so no re-registration
    // is needed — they pick up the new schema on the next keystroke.
    this.datasources = Object.values(this.datasourceSchemas);
    this.monacoIntelliSenseService.setDatasources(this.datasources);

    this.loadingDatasources[dbId] = false;
    this.cdr.markForCheck();
  }

  /**
   * Resolve the dbType of a datasource id from whichever list is
   * authoritative right now — preloaded results first, then the active
   * selection if it matches.
   */
  private getDbTypeFor(dbId: string): string | null {
    const fromList =
      this.availableDatasources?.find((d: any) => String(d?.id) === String(dbId))
        ?.config?.dbType ??
      this.preloadedDatasources?.find((d: any) => String(d?.id) === String(dbId))
        ?.config?.dbType;
    if (fromList) return fromList;
    if (String(this.selectedDatasourceObj?.id) === String(dbId)) {
      return this.selectedDatasourceObj?.config?.dbType ?? null;
    }
    return null;
  }

  /**
   * Load datasource schema from API and update store
   */
  private async loadDatasourceSchemaFromAPI(dbId: string): Promise<void> {
    if (!dbId || !this.selectedOrg?.id) return Promise.resolve();

    const orgId = this.selectedOrg.id.toString();
    const dbIdStr = dbId.toString();
    // Capture the selection token so we can detect a stale response on return.
    const token = this.schemaSelectionToken;

    this.loadingDatasources[dbId] = true;

    // Dispatch loading action
    this.store.dispatch(
      AddDatasetActions.loadSchemaData({
        orgId,
        dbId: dbIdStr,
      }),
    );

    return new Promise((resolve, reject) => {
      try {
        // Single bulk call — schemas, tables, AND columns in one
        // round-trip. The BE's getDatasourceStructure controller
        // walks information_schema (dialect-aware) and returns the
        // whole tree pre-shaped. Monaco's IntelliSense, the sidebar,
        // and hover/completion all get populated at once instead of
        // the previous schemas-first / tables-on-expand / columns-on-
        // expand cascade — which forced the user to click every row
        // before completion worked on pasted SQL.
        //
        // Uses queryPostNoLoader under the hood so the global loader
        // stays out of the way; the sidebar shows skeleton rows
        // while the request is in flight.
        this.queryService
          .getDatasourceStructure(dbIdStr, orgId)
          .subscribe({
            next: (response: any) => {
              // Envelope check first — BE returns HTTP 200 with
              // status:false on application-level failures (bad
              // datasource, broken connection, etc.). Surface to
              // user via the standard service helper.
              if (response && response.status === false) {
                const msg =
                  response.message ||
                  this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
                this.globalService.handleSuccessService(response, false);
                this.store.dispatch(
                  AddDatasetActions.loadSchemaDataFailure({
                    orgId,
                    dbId: dbIdStr,
                    error: msg,
                  }),
                );
                this.loadingDatasources[dbId] = false;
                this.cdr.markForCheck();
                reject(new Error(msg));
                return;
              }

              const { datasources: transformed, mode } =
                SchemaTransformerHelper.transformSchemaResponseWithMode(
                  response,
                );
              // Mode = 'eager': columns shipped inline; every node
              // gets tablesStatus + columnsStatus = 'loaded' so the
              // lazy expand paths become no-ops.
              // Mode = 'lazy': BE auto-degraded (warehouse-scale
              // database). Schemas + tables are present; columns
              // are NOT. Mark tables loaded but columns idle so
              // ensureColumnsLoaded fires per-table on first
              // expand / IntelliSense reference. Track the mode on
              // the tree so the sidebar can hint at it.
              const loadedTree =
                mode === 'eager'
                  ? this.markTreeFullyLoaded(
                      transformed[0],
                      this.getDbTypeFor(dbId),
                    )
                  : this.markTreeTablesOnlyLoaded(
                      transformed[0],
                      this.getDbTypeFor(dbId),
                    );
              this.schemaTreeMode[dbId] = mode;

              // When the user picked a schema in the popup, narrow
              // the tree to just that schema so the sidebar matches
              // the editor's scope. The bulk endpoint returns
              // everything — cheaper to filter in JS than to ship a
              // separate scoped endpoint.
              const finalTree = this.scopedSchema
                ? {
                    ...loadedTree,
                    schemas: loadedTree.schemas.filter(
                      (s: any) => s.name === this.scopedSchema,
                    ),
                  }
                : loadedTree;

              this.store.dispatch(
                AddDatasetActions.loadSchemaDataSuccess({
                  orgId,
                  dbId: dbIdStr,
                  data: finalTree,
                }),
              );
              this.datasourceSchemas[dbId] = finalTree;

              if (token === this.schemaSelectionToken) {
                this.datasources = Object.values(this.datasourceSchemas);
                this.monacoIntelliSenseService.setDatasources(this.datasources);
                // Scoped-schema may have flipped to available/unavailable
                // depending on whether the schema name exists in the
                // returned tree — re-evaluate the editor lock.
                this.syncEditorReadOnlyState();
              }

              this.loadingDatasources[dbId] = false;
              this.cdr.markForCheck();
              resolve();
            },
            error: (error: any) => {
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataFailure({
                  orgId,
                  dbId: dbIdStr,
                  error:
                    error?.message ||
                    this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
                }),
              );
              this.loadingDatasources[dbId] = false;
              this.cdr.markForCheck();
              reject(error);
            },
          });
      } catch (error: any) {
        // Dispatch failure action
        this.store.dispatch(
          AddDatasetActions.loadSchemaDataFailure({
            orgId,
            dbId: dbIdStr,
            error:
              error.message ||
              this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
          }),
        );

        this.loadingDatasources[dbId] = false;
        this.cdr.markForCheck();
        reject(error);
      }
    });
  }

  /**
   * Execute query - Smart execution based on selection
   * If text is selected, runs selected SQL
   * If no selection, runs current statement at cursor
   */
  executeQuery(): void {
    if (!this.editor) return;
    // Block keyboard re-entry while the results popup is open or a query is
    // already in flight — Monaco keeps focus when the popup overlays it, so
    // Ctrl+Enter would otherwise fire repeatedly.
    if (this.showResultsPopup || this.isExecutingQuery) return;

    const selection = this.editor.getSelection();
    const hasSelection = selection && !selection.isEmpty();

    if (hasSelection) {
      // Execute selected text
      const selectedText = this.editor.getModel().getValueInRange(selection);
      if (selectedText.trim()) {
        this.executeSelectedQuery(selectedText);
        return;
      }
    }

    // No selection, execute complete query
    this.executeCompleteQuery();
  }

  /**
   * Execute complete SQL query from editor
   */
  executeCompleteQuery(): void {
    if (this.showResultsPopup || this.isExecutingQuery) return;
    const query = this.editor?.getValue() || this.currentQuery;
    this.resultPage = 1;
    this.resultFilterValues = {};
    this.queryResult = null;
    this.executeQueryForDatasource(query);
  }

  /**
   * Execute selected SQL text from editor
   * @param selectedText The selected SQL text to execute
   */
  executeSelectedQuery(selectedText: string): void {
    if (this.showResultsPopup || this.isExecutingQuery) return;
    this.resultPage = 1;
    this.resultFilterValues = {};
    this.queryResult = null;
    this.executeQueryForDatasource(selectedText);
  }

  clearEditor(): void {
    if (this.editor) {
      this.editor.setValue('');
    }
  }

  exportCurrentScript(): void {
    if (!this.editor || !this.selectedDatasourceObj) return;

    const query = this.editor.getValue();
    const datasourceName = this.selectedDatasourceObj.name || 'datasource';
    const fileName = `${datasourceName}_script.sql`;

    const blob = new Blob([query], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  triggerFileInput(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.click();
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.sql') && !fileName.endsWith('.txt')) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('DATASET.INVALID_FILE_FORMAT'),
        detail: this.translate.instant('DATASET.INVALID_FILE_FORMAT_DESC'),
        key: 'topRight',
        life: 3000,
        styleClass: 'custom-toast',
      });
      // Reset the file input
      event.target.value = '';
      return;
    }

    // Validate file size (e.g., max 2MB)
    const maxSizeInMB = 2;
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('DATASET.FILE_TOO_LARGE'),
        detail: this.translate.instant('DATASET.FILE_SIZE_LIMIT', {
          size: maxSizeInMB,
        }),
        key: 'topRight',
        life: 3000,
        styleClass: 'custom-toast',
      });
      event.target.value = '';
      return;
    }

    // Read file content
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const content = e.target.result;
      if (this.editor) {
        // Set the content to the editor
        this.editor.setValue(content);
        this.currentQuery = content;
      }
      // Reset the file input so the same file can be selected again if needed
      event.target.value = '';
    };

    reader.onerror = () => {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('DATASET.IMPORT_FAILED'),
        detail: this.translate.instant('DATASET.IMPORT_FAILED_DESC'),
        key: 'topRight',
        life: 3000,
        styleClass: 'custom-toast',
      });
      event.target.value = '';
    };

    reader.readAsText(file);
  }

  saveAsDataset(): void {
    if (!this.selectedDatasourceObj) return;

    // Show dialog
    this.showDatasetDialog = true;
  }

  onConfirmChange(saveFirst: boolean): void {
    if (saveFirst) {
      // Open save dataset dialog
      this.showChangeConfirmDialog = false;
      this.showDatasetDialog = true;
      return;
    }

    // Proceed with change without saving
    this.showChangeConfirmDialog = false;

    if (this.pendingDatasourceChange) {
      this.proceedWithDatasourceChange(this.pendingDatasourceChange);
      this.pendingDatasourceChange = null;
    }

    if (this.pendingOrgChange) {
      this.proceedWithOrgChange(this.pendingOrgChange);
      this.pendingOrgChange = null;
    }
  }

  onCancelChange(): void {
    this.showChangeConfirmDialog = false;
    this.pendingDatasourceChange = null;
    this.pendingOrgChange = null;
  }

  private resetEditor(): void {
    // Clear query result
    this.queryResult = null;

    // Reset editor content if it exists
    if (this.editor) {
      this.editor.setValue(SQL_EDITOR_PLACEHOLDER);
    }

    // Reset current query
    this.currentQuery = '';
  }

  onResultFilterChange(): void {
    this.resultFilterSubject.next();
  }

  clearResultFilters(): void {
    this.resultFilterValues = {};
    this.resultPage = 1;
    if (this.lastExecutedQuery) {
      this.executeQueryForDatasource(
        this.lastExecutedQuery,
        1,
        this.resultRows,
      );
    }
  }

  exportResultsAsCsv(): void {
    if (
      !this.lastExecutedQuery ||
      !this.selectedDatasourceObj?.id ||
      !this.selectedOrg?.id
    )
      return;

    this.isExportingResults = true;

    // Build filter from current filter values
    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    const payload: any = {
      orgId: this.selectedOrg.id,
      datasourceId: this.selectedDatasourceObj.id,
      query: this.lastExecutedQuery,
    };

    if (Object.keys(filter).length > 0) {
      payload.filter = JSON.stringify(filter);
    }

    this.queryService.exportQueryResults(payload).subscribe({
      next: (blob: Blob) => {
        const datasourceName = this.selectedDatasourceObj.name || 'datasource';
        const fileName = `${datasourceName}_query_results.csv`;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
        this.isExportingResults = false;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.isExportingResults = false;
        this.cdr.markForCheck();
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('DATASET.EXPORT_FAILED'),
          detail:
            error.error?.message ||
            error.message ||
            this.translate.instant('DATASET.EXPORT_FAILED_DESC'),
          key: 'topRight',
          life: 3000,
          styleClass: 'custom-toast',
        });
      },
    });
  }

  get isResultFilterActive(): boolean {
    return Object.values(this.resultFilterValues).some(v => !!v);
  }

  onResultsLazyLoad(event: any): void {
    this.lastResultsLazyEvent = event;
    const page =
      Math.floor((event.first || 0) / (event.rows || this.resultRows)) + 1;
    const limit = event.rows || this.resultRows;

    if (!this.lastExecutedQuery) return;

    this.resultPage = page;
    if (this.resultRows !== limit) {
      this.resultRows = limit;
      // User changed page size — persist so the new choice
      // survives reload. Page changes alone don't persist (those
      // are session-scoped navigation, not preferences).
      this.persistPageSize(limit);
    }

    // Build filter object from non-empty filter values
    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    this.executeQueryForDatasource(this.lastExecutedQuery, page, limit, filter);
  }

  /** localStorage key for the persisted page size. Namespaced to
   *  avoid collisions with other features that may add their own
   *  prefs later. */
  private static readonly PAGE_SIZE_STORAGE_KEY =
    'dbexec.queryResult.pageSize';
  /** Whitelist of page-size values we accept from storage. Anything
   *  outside this set (corruption, an old version with different
   *  options) falls through to the default. */
  private static readonly ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

  private loadPersistedPageSize(): void {
    try {
      const raw = localStorage.getItem(
        AddDatasetComponent.PAGE_SIZE_STORAGE_KEY,
      );
      if (!raw) return;
      const parsed = parseInt(raw, 10);
      if (AddDatasetComponent.ALLOWED_PAGE_SIZES.includes(parsed)) {
        this.resultRows = parsed;
      }
    } catch (_) {
      // Safari private mode + a couple of locked-down enterprise
      // configs throw on localStorage access. Treat as "no
      // persisted value" and keep the default.
    }
  }

  private persistPageSize(value: number): void {
    if (!AddDatasetComponent.ALLOWED_PAGE_SIZES.includes(value)) return;
    try {
      localStorage.setItem(
        AddDatasetComponent.PAGE_SIZE_STORAGE_KEY,
        String(value),
      );
    } catch (_) {
      // See loadPersistedPageSize — same defensive fallback. The
      // user's session-level choice still works; only the
      // cross-session persistence is lost.
    }
  }

  // ── Bottom-sheet drag + persistence ─────────────────────────────
  private static readonly SHEET_HEIGHT_STORAGE_KEY =
    'dbexec.queryResult.sheetHeightPx';
  private static readonly SHEET_COLLAPSED_STORAGE_KEY =
    'dbexec.queryResult.sheetCollapsed';
  private static readonly SHEET_MIN_HEIGHT = 240;
  /** Reserve at least this many pixels of editor visible above the
   *  sheet so a maximised sheet doesn't hide the SQL the user is
   *  iterating on. */
  private static readonly SHEET_MAX_HEIGHT_PADDING = 120;

  private clampSheetHeight(px: number): number {
    const max = Math.max(
      AddDatasetComponent.SHEET_MIN_HEIGHT,
      window.innerHeight - AddDatasetComponent.SHEET_MAX_HEIGHT_PADDING,
    );
    return Math.min(max, Math.max(AddDatasetComponent.SHEET_MIN_HEIGHT, px));
  }

  /** Read persisted sheet height + collapsed state on init. */
  private loadPersistedSheetState(): void {
    try {
      const raw = localStorage.getItem(
        AddDatasetComponent.SHEET_HEIGHT_STORAGE_KEY,
      );
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          this.resultSheetHeightPx = this.clampSheetHeight(parsed);
        }
      } else {
        // No persisted value yet — pick a sensible default
        // (45% of viewport, clamped) so the first-time experience
        // looks intentional rather than tiny or huge.
        this.resultSheetHeightPx = this.clampSheetHeight(
          Math.round(window.innerHeight * 0.45),
        );
      }
      const collapsedRaw = localStorage.getItem(
        AddDatasetComponent.SHEET_COLLAPSED_STORAGE_KEY,
      );
      this.isResultSheetCollapsed = collapsedRaw === 'true';
    } catch (_) {
      // Same defensive fallback as page-size persistence.
    }
  }

  private persistSheetHeight(px: number): void {
    try {
      localStorage.setItem(
        AddDatasetComponent.SHEET_HEIGHT_STORAGE_KEY,
        String(Math.round(px)),
      );
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  private persistSheetCollapsed(collapsed: boolean): void {
    try {
      localStorage.setItem(
        AddDatasetComponent.SHEET_COLLAPSED_STORAGE_KEY,
        collapsed ? 'true' : 'false',
      );
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  /**
   * Toggle expanded/collapsed. Closing the modal-style × used to
   * unmount the entire result set; the bottom-sheet pattern keeps
   * the data around so users can iterate on their SQL without
   * watching the result panel flash in and out.
   */
  toggleResultSheet(): void {
    this.isResultSheetCollapsed = !this.isResultSheetCollapsed;
    this.persistSheetCollapsed(this.isResultSheetCollapsed);
  }

  /**
   * Effective sheet height in pixels. Collapsed state returns the
   * stub height; otherwise the user-configured / persisted value.
   * Templated into the host element's `--sheet-height` CSS variable
   * so the editor pane can reserve matching `padding-bottom` and
   * keep the SQL editor visible above the sheet.
   */
  get effectiveSheetHeightPx(): number {
    if (!this.showResultsPopup || !this.queryResult) return 0;
    return this.isResultSheetCollapsed ? 44 : this.resultSheetHeightPx;
  }

  /**
   * mousedown on the drag handle. Captures the starting Y +
   * height so mousemove can compute the new height relative to
   * the drag, not the absolute cursor position. The listeners
   * attach to the document so dragging past the handle's bounds
   * (which happens constantly with a 6px-tall target) still works.
   */
  onSheetDragStart(event: MouseEvent): void {
    event.preventDefault();
    if (this.isResultSheetCollapsed) return;
    const startY = event.clientY;
    const startHeight = this.resultSheetHeightPx;

    const onMove = (ev: MouseEvent) => {
      // Dragging the handle UP grows the sheet; DOWN shrinks it.
      const delta = startY - ev.clientY;
      this.resultSheetHeightPx = this.clampSheetHeight(startHeight + delta);
      this.cdr.markForCheck();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.persistSheetHeight(this.resultSheetHeightPx);
      this.sheetDragState = null;
      // Remove the cursor override + body class.
      document.body.classList.remove('ds-sheet-dragging');
    };

    this.sheetDragState = { startY, startHeight, onMove, onUp };
    document.body.classList.add('ds-sheet-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /**
   * Keyboard a11y for the drag handle. Arrow keys nudge the
   * height; shift modifier is a larger step so power users can
   * resize without flailing the arrow key. Persists on each
   * keypress since there's no clear "release" moment.
   */
  onSheetHandleKeydown(event: KeyboardEvent): void {
    if (this.isResultSheetCollapsed) return;
    const step = event.shiftKey ? 80 : 20;
    let next = this.resultSheetHeightPx;
    if (event.key === 'ArrowUp') {
      next = this.resultSheetHeightPx + step;
    } else if (event.key === 'ArrowDown') {
      next = this.resultSheetHeightPx - step;
    } else {
      return;
    }
    event.preventDefault();
    this.resultSheetHeightPx = this.clampSheetHeight(next);
    this.persistSheetHeight(this.resultSheetHeightPx);
  }

  private executeQueryForDatasource(
    query: string,
    page: number = 1,
    limit: number = this.resultRows,
    filter: { [key: string]: string } = {},
  ): void {
    if (!query.trim()) {
      return;
    }

    if (!this.selectedDatasourceObj?.id || !this.selectedOrg?.id) {
      return;
    }

    this.isExecutingQuery = true;
    this.lastExecutedQuery = query;
    // Stale JSON-cell expand state would point at the previous
    // result's row indices; nuke it before the new rows arrive.
    if (this.expandedJsonCells.size > 0) {
      this.expandedJsonCells = new Set();
    }

    const startTime = Date.now();

    const payload: any = {
      orgId: this.selectedOrg.id,
      datasourceId: this.selectedDatasourceObj.id,
      query: query,
      page: page,
      limit: limit,
    };

    if (Object.keys(filter).length > 0) {
      payload.filter = JSON.stringify(filter);
    }

    this.queryService
      .executeQuery(payload)
      .pipe(timeout(QUERY_EXECUTION_TIMEOUT_MS))
      .subscribe({
        next: (response: IAPIResponse<QueryExecuteData>) => {
          if (!response.status) {
            this.queryResult = {
              columns: [],
              rows: [],
              rowCount: 0,
              executionTime: `${Date.now() - startTime}ms`,
              error:
                response.message ||
                this.translate.instant('DATASET.QUERY_EXECUTION_FAILED'),
            };
            this.isExecutingQuery = false;
            this.cdr.markForCheck();
            return;
          }

          const data = response.data;
          if (!data) {
            this.queryResult = {
              columns: [],
              rows: [],
              rowCount: 0,
              executionTime: `${Date.now() - startTime}ms`,
              message: response.message,
            };
            this.isExecutingQuery = false;
            this.cdr.markForCheck();
            return;
          }

          const executionTime =
            typeof data.executionTime === 'number'
              ? `${data.executionTime}ms`
              : data.executionTime || `${Date.now() - startTime}ms`;

          this.queryResult = {
            columns: data.columns ?? [],
            columnTypes: data.columnTypes ?? {},
            rows: Array.isArray(data.data) ? data.data : [],
            rowCount: data.rowCount ?? 0,
            executionTime,
            query: data.query,
          };

          // Auto-fit column widths to the content of this result,
          // then flex the last column to absorb leftover container
          // width so the table fills horizontally. Without the
          // flex step the table would render at sum(widths) and
          // leave a wide gap on the right of the popup; the table-
          // layout: fixed rule alone doesn't grow the columns to
          // fill, just enforces the colgroup widths.
          const measured = measureColumnWidths(
            this.queryResult.columns,
            this.queryResult.rows,
            this.queryResult.columnTypes,
          );
          this.columnWidths = flexLastColumn(
            measured,
            this.queryResult.columns,
            // Use the viewport width as a fair approximation of the
            // sheet's render width — the sheet spans 100% of the
            // viewport (position: fixed left:0 right:0). Slightly
            // pessimistic if a sidebar is visible, but the worst
            // case is a small horizontal scroll, not visual breakage.
            window.innerWidth,
          );

          // Auto-open the sheet on a fresh result. If the user
          // previously collapsed it, a successful query is a
          // strong signal they want to see the data — expand
          // automatically. Don't write the new state to storage;
          // the user's persisted preference still applies the
          // next time the page loads.
          if (this.queryResult.columns.length > 0) {
            this.showResultsPopup = true;
            if (this.isResultSheetCollapsed) {
              this.isResultSheetCollapsed = false;
            }
          }

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          const executionTime = `${Date.now() - startTime}ms`;

          // Extract error message — check for RxJS TimeoutError first so we can
          // surface a helpful message instead of an opaque "timeout" string.
          let errorMessage: string;
          if (error instanceof TimeoutError) {
            errorMessage = this.translate.instant('DATASET.QUERY_TIMEOUT');
          } else if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error?.error === 'string') {
            errorMessage = error.error;
          } else {
            errorMessage = this.translate.instant(
              'DATASET.QUERY_EXECUTION_FAILED',
            );
          }

          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: executionTime,
            error: errorMessage,
          };

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
      });
  }

  onDatasetDialogClose(formData: DatasetFormData | null): void {
    this.showDatasetDialog = false;

    if (formData) {
      if (!this.selectedDatasourceObj) return;

      // Get the SQL query
      const sql = this.editor?.getValue() || this.currentQuery;

      const payload = {
        name: formData.name,
        description: formData.description,
        organisation: this.selectedOrg?.id,
        datasource: this.selectedDatasourceObj.id,
        sql,
      };

      this.datasetService
        .addDataset(payload)
        .then(response => {
          if (this.globalService.handleSuccessService(response, true)) {
            // Navigate to dataset list
            this._saved = true;
            this.router.navigate([DATASET.LIST]);
            // Dataset saved successfully
            // Now proceed with pending change if any
            if (this.pendingDatasourceChange) {
              this.proceedWithDatasourceChange(this.pendingDatasourceChange);
              this.pendingDatasourceChange = null;
            }
            if (this.pendingOrgChange) {
              this.proceedWithOrgChange(this.pendingOrgChange);
              this.pendingOrgChange = null;
            }
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  toggleDatasourceSidebar(): void {
    this.showDatasourceSidebar = !this.showDatasourceSidebar;
    // Trigger Monaco editor resize after sidebar animation
    setTimeout(() => {
      if (this.editor) {
        this.editor.layout();
      }
    }, 300);
  }

  // ─── Tree expansion API ──────────────────────────────────
  // Path scheme:
  //   `${dbId}`                              datasource node
  //   `${dbId}.${schemaName}`                schema node
  //   `${dbId}.${schemaName}.${tableName}`   table node

  schemaPath(dbId: string, schemaName: string): string {
    return `${dbId}.${schemaName}`;
  }

  tablePath(dbId: string, schemaName: string, tableName: string): string {
    return `${dbId}.${schemaName}.${tableName}`;
  }

  isExpanded(path: string): boolean {
    return this.expandedPaths.has(path);
  }

  /** Remove `dbId` and every descendant path under it from the expansion set. */
  private collapseSubtree(dbId: string): void {
    const prefix = `${dbId}.`;
    for (const path of Array.from(this.expandedPaths)) {
      if (path === dbId || path.startsWith(prefix)) {
        this.expandedPaths.delete(path);
      }
    }
  }

  /** Remove `${dbId}.${schemaName}` and every table path under it. */
  private collapseSchemaSubtree(dbId: string, schemaName: string): void {
    const schemaKey = this.schemaPath(dbId, schemaName);
    const tablePrefix = `${schemaKey}.`;
    for (const path of Array.from(this.expandedPaths)) {
      if (path === schemaKey || path.startsWith(tablePrefix)) {
        this.expandedPaths.delete(path);
      }
    }
  }

  toggleDatasource(db: any): void {
    if (this.expandedPaths.has(db.id)) {
      // Collapse cascades to all schemas/tables under this DB.
      this.collapseSubtree(db.id);
    } else {
      this.expandedPaths.add(db.id);
      if (!this.datasourceSchemas[db.id]) {
        this.loadDatasourceSchema(db.id);
      }
    }
  }

  toggleSchema(dbId: string, schemaName: string): void {
    const key = this.schemaPath(dbId, schemaName);
    if (this.expandedPaths.has(key)) {
      this.collapseSchemaSubtree(dbId, schemaName);
      return;
    }
    this.expandedPaths.add(key);
    // Lazy-load: first expand triggers the table fetch. Subsequent
    // expands of the same schema hit the cached node and skip the
    // network call. Failures leave the node in an 'error' state with
    // the existing collapsed tables list visible (empty) — the user
    // can collapse + re-expand to retry.
    this.ensureTablesLoaded(dbId, schemaName);
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    const key = this.tablePath(dbId, schemaName, tableName);
    if (this.expandedPaths.has(key)) {
      this.expandedPaths.delete(key);
      return;
    }
    this.expandedPaths.add(key);
    this.ensureColumnsLoaded(dbId, schemaName, tableName);
  }

  /**
   * Kick off the lazy `tables-for-schema` fetch if this schema row
   * hasn't been populated yet. Idempotent: subsequent calls during
   * the same load (or after a successful load) are no-ops.
   *
   * With the bulk `getDatasourceStructure` call now driving the
   * initial load, every schema arrives already populated and this
   * method's already-loaded guard short-circuits in the common case.
   * It's still useful as a safety net for any future per-schema
   * refresh path or for trees that fall through with empty tables.
   *
   * `background` toggles the global loader off so manual single-
   * schema reloads can choose between blocking (default) and quiet
   * (true) behaviour.
   */
  private ensureTablesLoaded(
    dbId: string,
    schemaName: string,
    background = false,
  ): void {
    if (!this.selectedOrg?.id) return;
    const orgId = String(this.selectedOrg.id);
    const dbIdStr = String(dbId);
    const tree = this.datasourceSchemas[dbId];
    const existing = tree?.schemas?.find(s => s.name === schemaName) as any;
    // Already-loaded guard: if we have tables, skip the fetch.
    // Network is the expensive part — checking against the in-memory
    // copy is cheaper than subscribing to the store.
    if (
      existing &&
      Array.isArray(existing.tables) &&
      existing.tables.length > 0
    ) {
      return;
    }
    // Already in-flight guard: a parallel pre-warm fetch is enough;
    // a second click while loading would duplicate the round-trip.
    if (existing?.tablesStatus === 'loading') {
      return;
    }
    // Flip the per-row status to 'loading' immediately so the sidebar
    // shows the inline spinner even before the store action propagates
    // back. Without this the row reads as "idle" for a few hundred ms
    // and looks frozen.
    this.replaceSchemaNode(dbId, schemaName, prev => ({
      ...prev,
      tablesStatus: 'loading',
      tablesError: null,
    }));

    this.store.dispatch(
      AddDatasetActions.loadTablesForSchema({
        orgId,
        dbId: dbIdStr,
        schemaName,
      }),
    );

    this.datasourceService
      .listSchemaTables(
        {
          orgId,
          datasourceId: dbIdStr,
          schemaName,
        },
        background,
      )
      .then((response: any) => {
        // BE always returns HTTP 200; check the envelope's `status`
        // field for application-level failure. A typo in the URL
        // (e.g. ?schema=does_not_exist) returns
        // `{status: false, code: 404, message: 'Schema not found
        // in this datasource'}` — surface the message to the user
        // instead of silently rendering 0 tables.
        if (response && response.status === false) {
          const msg =
            response.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
          this.globalService.handleSuccessService(response, false);
          this.store.dispatch(
            AddDatasetActions.loadTablesForSchemaFailure({
              orgId,
              dbId: dbIdStr,
              schemaName,
              error: msg,
            }),
          );
          // Persist the error on the in-memory tree so the sidebar
          // can render an inline message under the schema row.
          this.replaceSchemaNode(dbId, schemaName, prev => ({
            ...prev,
            tablesError: msg,
            tablesStatus: 'error',
          }));
          this.cdr.markForCheck();
          return;
        }

        const tables =
          SchemaTransformerHelper.transformLazyTablesResponse(response);
        // OnPush + pure pipes mean we MUST swap references at every
        // level — mutating `schema.tables = newArr` works for the
        // direct property but the parent schemas array reference
        // stays the same, so the *ngFor + filterSchemas pipe both
        // see a cached input and don't re-render. Rebuild the chain.
        this.replaceSchemaNode(dbId, schemaName, prev => ({
          ...prev,
          tables,
          tablesError: null,
          tablesStatus: 'loaded',
        }));

        this.store.dispatch(
          AddDatasetActions.loadTablesForSchemaSuccess({
            orgId,
            dbId: dbIdStr,
            schemaName,
            tables: tables.map(t => ({ name: t.name, alias: t.alias })),
          }),
        );
        this.cdr.markForCheck();
      })
      .catch((error: any) => {
        const msg =
          error?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.store.dispatch(
          AddDatasetActions.loadTablesForSchemaFailure({
            orgId,
            dbId: dbIdStr,
            schemaName,
            error: msg,
          }),
        );
        this.replaceSchemaNode(dbId, schemaName, prev => ({
          ...prev,
          tablesError: msg,
          tablesStatus: 'error',
        }));
        this.cdr.markForCheck();
      });
  }

  /**
   * Tag every node in a freshly-arrived bulk-load tree as 'loaded'
   * (tablesStatus on each schema, columnsStatus on each table). This
   * keeps the per-row lazy spinners off and short-circuits any
   * subsequent `ensureTablesLoaded` / `ensureColumnsLoaded` calls
   * because their already-loaded guards see populated arrays.
   *
   * Pure function — returns a new tree object; original input is
   * not mutated, so callers can keep their own reference if needed.
   */
  private markTreeFullyLoaded(tree: any, dbType?: string | null): any {
    if (!tree) return tree;
    return {
      ...tree,
      ...(dbType ? { dbType } : {}),
      schemas: (tree.schemas ?? []).map((schema: any) => ({
        ...schema,
        tablesStatus: 'loaded',
        tablesError: null,
        tables: (schema.tables ?? []).map((table: any) => ({
          ...table,
          columnsStatus: 'loaded',
          columnsError: null,
        })),
      })),
    };
  }

  /**
   * Lazy-mode counterpart: tables are present (BE shipped them) but
   * columns are NOT. Mark tables loaded so the schema-expand spinner
   * stays off, but leave column status idle so `ensureColumnsLoaded`
   * fires the per-table fetch the first time the user expands the
   * row (or the first time Monaco's IntelliSense / hover needs that
   * table's columns). This is the warehouse-scale path.
   */
  private markTreeTablesOnlyLoaded(
    tree: any,
    dbType?: string | null,
  ): any {
    if (!tree) return tree;
    return {
      ...tree,
      ...(dbType ? { dbType } : {}),
      schemas: (tree.schemas ?? []).map((schema: any) => ({
        ...schema,
        tablesStatus: 'loaded',
        tablesError: null,
        tables: (schema.tables ?? []).map((table: any) => ({
          ...table,
          columnsStatus: 'idle',
          columnsError: null,
          columns: table.columns ?? [],
        })),
      })),
    };
  }


  /**
   * Immutably replace one schema row inside the cached tree. Rebuilds
   * the schemas array reference, the parent tree reference, and
   * `this.datasourceSchemas` itself so every reference Angular's
   * change-detector inspects (and every input the pure filterSchemas
   * / filterTables pipes cache against) actually changes. Also
   * refreshes the IntelliSense's mirrored copy so column hover /
   * completion picks up the new tables.
   */
  private replaceSchemaNode(
    dbId: string,
    schemaName: string,
    patch: (schema: any) => any,
  ): void {
    const tree = this.datasourceSchemas[dbId];
    if (!tree) return;
    const idx = tree.schemas?.findIndex((s: any) => s.name === schemaName) ?? -1;
    if (idx < 0) return;
    const nextSchemas = tree.schemas.slice();
    nextSchemas[idx] = patch(tree.schemas[idx]);
    const nextTree = { ...tree, schemas: nextSchemas };
    this.datasourceSchemas = {
      ...this.datasourceSchemas,
      [dbId]: nextTree,
    };
    this.datasources = Object.values(this.datasourceSchemas);
    this.monacoIntelliSenseService.setDatasources(this.datasources);
    // If the patched schema is the one the URL scoped us to, the
    // editor's read-only state may need to flip (error appeared /
    // cleared). Cheap to re-evaluate every time; idempotent.
    if (schemaName === this.scopedSchema) {
      this.syncEditorReadOnlyState();
    }
  }

  /**
   * Push the current `scopedSchemaUnavailable` state into Monaco's
   * `readOnly` option. Called after every lazy-load resolution so
   * the editor flips locked/unlocked in step with the sidebar's
   * error state. No-op if the editor hasn't been created yet
   * (loadMonacoEditor handles initial state via the same path).
   */
  private syncEditorReadOnlyState(): void {
    if (!this.editor) return;
    const readOnly = this.scopedSchemaUnavailable;
    this.editor.updateOptions({ readOnly });
  }

  /**
   * Same idea as replaceSchemaNode but one level deeper — replaces
   * one table row inside the matching schema.
   */
  private replaceTableNode(
    dbId: string,
    schemaName: string,
    tableName: string,
    patch: (table: any) => any,
  ): void {
    this.replaceSchemaNode(dbId, schemaName, schema => {
      const idx =
        schema.tables?.findIndex((t: any) => t.name === tableName) ?? -1;
      if (idx < 0) return schema;
      const nextTables = schema.tables.slice();
      nextTables[idx] = patch(schema.tables[idx]);
      return { ...schema, tables: nextTables };
    });
  }

  /**
   * Same shape as ensureTablesLoaded, one level deeper.
   */
  private ensureColumnsLoaded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): void {
    if (!this.selectedOrg?.id) return;
    const orgId = String(this.selectedOrg.id);
    const dbIdStr = String(dbId);
    const schema = this.datasourceSchemas[dbId]?.schemas?.find(
      s => s.name === schemaName,
    ) as any;
    const table = schema?.tables?.find((t: any) => t.name === tableName);
    if (table && Array.isArray(table.columns) && table.columns.length > 0) {
      return;
    }

    this.store.dispatch(
      AddDatasetActions.loadColumnsForTable({
        orgId,
        dbId: dbIdStr,
        schemaName,
        tableName,
      }),
    );

    this.datasourceService
      .listTableColumns({
        orgId,
        datasourceId: dbIdStr,
        schemaName,
        tableName,
      })
      .then((response: any) => {
        // Same envelope-status check as ensureTablesLoaded — see the
        // matching comment there for why a successful HTTP can still
        // be an application-level failure (BE always returns 200).
        if (response && response.status === false) {
          const msg =
            response.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
          this.globalService.handleSuccessService(response, false);
          this.store.dispatch(
            AddDatasetActions.loadColumnsForTableFailure({
              orgId,
              dbId: dbIdStr,
              schemaName,
              tableName,
              error: msg,
            }),
          );
          this.replaceTableNode(dbId, schemaName, tableName, prev => ({
            ...prev,
            columnsError: msg,
            columnsStatus: 'error',
          }));
          this.cdr.markForCheck();
          return;
        }

        const columns =
          SchemaTransformerHelper.transformLazyColumnsResponse(response);
        // Same immutable-rebuild rationale as ensureTablesLoaded — see
        // replaceSchemaNode / replaceTableNode comments above.
        this.replaceTableNode(dbId, schemaName, tableName, prev => ({
          ...prev,
          columns,
          columnsError: null,
          columnsStatus: 'loaded',
        }));
        this.store.dispatch(
          AddDatasetActions.loadColumnsForTableSuccess({
            orgId,
            dbId: dbIdStr,
            schemaName,
            tableName,
            columns: columns.map(c => ({
              name: c.name,
              type: c.type,
              nullable: c.nullable,
              defaultValue: c.defaultValue ?? null,
            })),
          }),
        );
        this.cdr.markForCheck();
      })
      .catch((error: any) => {
        const msg =
          error?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.store.dispatch(
          AddDatasetActions.loadColumnsForTableFailure({
            orgId,
            dbId: dbIdStr,
            schemaName,
            tableName,
            error: msg,
          }),
        );
        this.replaceTableNode(dbId, schemaName, tableName, prev => ({
          ...prev,
          columnsError: msg,
          columnsStatus: 'error',
        }));
        this.cdr.markForCheck();
      });
  }

  isTableExpanded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): boolean {
    return this.expandedPaths.has(this.tablePath(dbId, schemaName, tableName));
  }

  insertColumnName(
    dbId: string,
    schemaName: string,
    tableName: string,
    columnName: string,
  ): void {
    if (!this.editor) return;

    const selection = this.editor.getSelection();
    const text =
      schemaName.toLowerCase() === 'public'
        ? `${tableName}.${columnName}`
        : `${schemaName}.${tableName}.${columnName}`;

    this.editor.executeEdits('insert-column', [
      {
        range: selection,
        text: text,
        forceMoveMarkers: true,
      },
    ]);

    this.editor.focus();
  }

  onDatasourceContextMenu(event: MouseEvent, datasource: any): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatasource = datasource;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    this.contextMenuItems = [
      {
        label: this.translate.instant('DATASET.REFRESH_SCHEMA'),
        icon: 'pi pi-refresh',
        command: () => this.refreshDatasourceFromContext(),
      },
    ];

    this.showContextMenu = true;
  }

  closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuDatasource = null;
    // Cell-level menu shares the global outside-click listener
    // (see boundCloseContextMenu) so we close it from here too.
    this.showCellContextMenu = false;
    this.cellContextTarget = null;
  }

  /**
   * Right-click on a result-grid cell. Stashes which cell was
   * targeted and positions the menu under the cursor. Stops the
   * event from bubbling so the document-level click handler that
   * dismisses other menus doesn't fire on this open event.
   */
  onCellContextMenu(event: MouseEvent, rowIndex: number, col: string): void {
    if (!this.queryResult) return;
    event.preventDefault();
    event.stopPropagation();
    // Close any other menu first so we don't end up with two open.
    this.showContextMenu = false;
    this.cellContextTarget = { rowIndex, col };
    this.cellContextMenuLeft = event.clientX;
    this.cellContextMenuTop = event.clientY;
    this.showCellContextMenu = true;
  }

  /**
   * Copy the displayed value of the right-clicked cell to the
   * clipboard. Uses formatCellValue so what gets copied matches
   * what the user sees — BIGINT as the preserved string, dates
   * in ISO 8601, JSON pretty-printed, NULL as the literal word
   * "NULL". Skips the navigator.clipboard.writeText permission
   * dance because the click handler runs inside a user gesture.
   */
  async copyCellValue(): Promise<void> {
    if (!this.cellContextTarget || !this.queryResult) return;
    const { rowIndex, col } = this.cellContextTarget;
    const raw = this.queryResult.rows?.[rowIndex]?.[col];
    const cell = formatCellValue(raw, this.queryResult.columnTypes?.[col]);
    const text =
      cell.kind === 'null'
        ? this.translate.instant('DATASET.CELL_NULL')
        : cell.display;
    await this.writeToClipboard(text);
    this.closeContextMenu();
  }

  /**
   * Copy every value in the right-clicked column for the current
   * page, joined with newlines. Common workflow: "grab all the
   * email addresses out of this query result" — paste into a
   * spreadsheet, done.
   */
  async copyColumnValues(): Promise<void> {
    if (!this.cellContextTarget || !this.queryResult) return;
    const { col } = this.cellContextTarget;
    const lines = (this.queryResult.rows || []).map(row => {
      const cell = formatCellValue(
        row?.[col],
        this.queryResult?.columnTypes?.[col],
      );
      return cell.kind === 'null' ? '' : cell.display;
    });
    await this.writeToClipboard(lines.join('\n'));
    this.closeContextMenu();
  }

  /**
   * Wrapper around navigator.clipboard.writeText that handles the
   * "I'm in an insecure context" fallback (rare in this app since
   * it ships HTTPS, but cheap to keep). Toasts the result either
   * way so users know whether the action succeeded.
   */
  private async writeToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts. Creates a hidden
        // textarea, selects it, runs document.execCommand('copy').
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      // showInfo is the quiet toast — copy is a frequent action,
      // a success-coloured banner would be obnoxious.
      this.globalService.showInfo(this.translate.instant('DATASET.COPIED'));
    } catch (_) {
      // Clipboard write can throw on permission denial — surface
      // the failure rather than silently swallowing.
      this.globalService.showWarn(
        this.translate.instant('DATASET.COPY_FAILED'),
      );
    }
  }

  refreshDatasourceFromContext(): void {
    if (!this.contextMenuDatasource) return;

    // Refresh schema for this specific database
    this.refreshSingleDatasource(this.contextMenuDatasource.id);

    this.closeContextMenu();
  }

  /**
   * Esc closes the open results popup or context menu without affecting Monaco's
   * own Esc handling (Monaco gets the key first when the editor has focus, so it
   * can dismiss its own widgets like the suggestion list before this fires).
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showResultsPopup) {
      this.showResultsPopup = false;
      this.cdr.markForCheck();
      return;
    }
    if (this.showContextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
  }
}
