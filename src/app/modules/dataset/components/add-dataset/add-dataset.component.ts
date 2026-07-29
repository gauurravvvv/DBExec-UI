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
import { IAPIResponse } from 'src/app/core/models/global.model';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from 'src/app/modules/datasource/constants/database-types.constant';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
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
} from '../../models/dataset-schema.model';
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
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';
import { DatasetParamConfig } from '../../helpers/param-tokens.helper';
import {
  ColumnProfile,
  downloadTextFile,
  rowsToCsv,
  rowsToJson,
} from '../../helpers/dataset-result-tools.helper';
import {
  buildResultExportPayload,
  downloadBlob,
  exportBaseName as buildExportBaseName,
  readSqlFile,
} from '../../helpers/dataset-export.helper';
import {
  ResultSheetHost,
  ResultSheetLayoutService,
} from '../../services/result-sheet-layout.service';
import {
  ResultGridHost,
  ResultGridToolsService,
} from '../../services/result-grid-tools.service';
import {
  DatasetSchemaTreeService,
  EnsureTablesOptions,
  SchemaTreeHost,
} from '../../services/dataset-schema-tree.service';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

import { expandAnimation } from '../../animations/expand.animation';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [expandAnimation],
  // Component-scoped: the sheet height, the drag in progress and the grid's
  // expanded cells all belong to THIS screen's result pane, never shared.
  providers: [
    ResultSheetLayoutService,
    ResultGridToolsService,
    DatasetSchemaTreeService,
  ],
})
export class AddDatasetComponent
  implements
    OnInit,
    OnDestroy,
    AfterViewInit,
    OnChanges,
    HasUnsavedChanges,
    ResultSheetHost,
    ResultGridHost,
    SchemaTreeHost
{
  /**
   * Size cap for an imported .sql / .txt script.
   *
   * edit-dataset uses 22 here. That divergence is preserved deliberately — see
   * the drift reconciliation plan — so the value stays per-screen rather than
   * moving into the shared helper.
   */
  private static readonly SQL_UPLOAD_MAX_MB = 2;

  // ViewChild for file input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('sqlEditorContainer')
  sqlEditorContainer!: ElementRef<HTMLDivElement>;
  /**
   * Reference to the PrimeNG result-grid Table so we can call its
   * `.reset()` between queries. Without this, PrimeNG keeps its
   * internal "first row index" state across `queryResult` changes,
   * so running query A (200 rows, viewing page 4) then query B (7
   * rows) leaves the table pointing at row 75 of a 7-row result —
   * the grid renders empty until the user clicks page 1. Typed as
   * any so we don't pull primeng/table into this controller's
   * import surface (the component already has plenty).
   */
  @ViewChild('resultsTable') resultsTable: any;

  // Removed ViewChild as we now use dynamic containers per tab
  @Input() datasourceId?: string;
  @Input() initialQuery?: string;

  editor: any;
  /** Owns the editor lifetime; see CodeEditorService. */
  private handle: EditorHandle | null = null;
  private codeEditor = inject(CodeEditorService);
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
    return this.grid.hasAnyColumnType();
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
  get expandedJsonCells(): Set<string> {
    return this.grid.expandedJsonCells;
  }
  set expandedJsonCells(cells: Set<string>) {
    this.grid.expandedJsonCells = cells;
  }

  /**
   * Per-column pixel width for the result grid's <colgroup>, measured by
   * ResultGridToolsService. PrimeNG's [resizableColumns] then lets the user drag
   * borders; the live width during a drag is PrimeNG's own DOM state, not this map.
   */
  get columnWidths(): Record<string, number> {
    return this.grid.columnWidths;
  }

  // The pane ResizeObserver, its debounce timer and the last observed width live
  // on ResultSheetLayoutService, which also disposes them.

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
  get showCellContextMenu(): boolean {
    return this.grid.showCellContextMenu;
  }
  get cellContextMenuTop(): number {
    return this.grid.cellContextMenuTop;
  }
  get cellContextMenuLeft(): number {
    return this.grid.cellContextMenuLeft;
  }

  /** Stable key for the expanded-set above. */
  jsonCellKey(rowIndex: number, col: string): string {
    return this.grid.jsonCellKey(rowIndex, col);
  }

  /** Toggle the expanded state for one JSON cell. The template
   *  reads `expandedJsonCells.has(key)` to decide between the
   *  summary line and the multi-line `<pre>`. */
  toggleJsonCell(rowIndex: number, col: string): void {
    this.grid.toggleJsonCell(rowIndex, col);
  }

  /** IntelliSense-facing projection of the loaded trees; held by the tree service. */
  get datasources(): DatasourceSchema[] {
    return this.tree.datasources;
  }
  set datasources(list: DatasourceSchema[]) {
    this.tree.datasources = list;
  }
  currentQuery = '';

  // ── Query parameters ({{name}}) ───────────────────────────────────
  /** Debounced SQL snapshot fed to the params panel for token scanning. */
  paramsSql = '';
  /** Configured params, collected from the panel; saved as paramsConfig. */
  paramsConfig: DatasetParamConfig[] = [];
  private sqlParamScan$ = new Subject<string>();

  // Theme monitoring. Default to the app's light theme ('vs'), not
  // 'vs-dark' — Monaco's setTheme is GLOBAL, so a stale dark default
  // corrects this at create time; the light default avoids a flash.

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
  get expandedPaths(): Set<string> {
    return this.tree.expandedPaths;
  }
  /**
   * When the user opens add-dataset via the list-page popup we pass
   * a `schema` query param. The sidebar filter pipe (filterSchemas)
   * reads this and shows only that schema; cross-schema queries
   * still work (the editor doesn't reject them) but the tree is
   * scoped. Null = no scoping; show every schema as before.
   */
  get scopedSchema(): string | null {
    return this.tree.scopedSchema;
  }
  set scopedSchema(schema: string | null) {
    this.tree.scopedSchema = schema;
  }

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
  get schemaSearchText(): string {
    return this.tree.schemaSearchText;
  }
  set schemaSearchText(text: string) {
    this.tree.schemaSearchText = text;
  }
  selectedDatasource: string = '';
  selectedSchema: string = '';

  // Context Menu
  showContextMenu = false;
  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];
  contextMenuDatasource: any | null = null;

  // Save as Dataset Dialog
  showDatasetDialog = false;

  // ── Result export + profiling (Slice 4) ───────────────────────────
  /** Toggle for the client-side column-profiling strip. */
  get showColumnProfile(): boolean {
    return this.grid.showColumnProfile;
  }
  /** Cached profiles for the current preview rows. */
  get columnProfiles(): ColumnProfile[] {
    return this.grid.columnProfiles;
  }

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
   * Sheet height and collapsed state live on ResultSheetLayoutService; these
   * proxies keep the template bindings working unchanged.
   */
  get resultSheetHeightPx(): number {
    return this.sheet.heightPx;
  }
  set resultSheetHeightPx(px: number) {
    this.sheet.heightPx = px;
  }

  get isResultSheetCollapsed(): boolean {
    return this.sheet.isCollapsed;
  }
  set isResultSheetCollapsed(collapsed: boolean) {
    this.sheet.isCollapsed = collapsed;
  }

  get isPaginationEnabled(): boolean {
    return !!this.queryResult;
  }

  // (Removed: isPaginatorNeeded getter that conditionally hid the
  // paginator on single-page results. With the docked sheet, the
  // footer's vertical position should be stable between queries —
  // a 7-row result followed by a 1000-row result shouldn't make
  // the pagination chrome appear out of nowhere. PrimeNG greys out
  // the navigation arrows automatically when rowCount fits one
  // page; the page-size selector + range report stay readable.)

  // Change Confirmation Dialog
  showChangeConfirmDialog = false;
  pendingDatasourceChange: any = null;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  private signatureHelpDisposable: any = null;
  /** Debounce handle for dialect lint. Cleared in ngOnDestroy. */
  private dialectLintTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monaco markers owner-id for the lint pass. Stable string so
   *  successive setModelMarkers() calls replace the previous batch. */
  private static readonly DIALECT_LINT_OWNER = 'sql-dialect-lint';

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
  get datasourceSchemas(): { [dbId: string]: DatasourceSchema } {
    return this.tree.datasourceSchemas;
  }
  set datasourceSchemas(map: { [dbId: string]: DatasourceSchema }) {
    this.tree.datasourceSchemas = map;
  }
  get loadingDatasources(): { [dbId: string]: boolean } {
    return this.tree.loadingDatasources;
  }
  set loadingDatasources(map: { [dbId: string]: boolean }) {
    this.tree.loadingDatasources = map;
  }
  isLoadingDatasources: boolean = false;
  /**
   * Per-datasource mode flag the BE returns with the bulk schema
   * tree. `eager` = columns shipped inline (typical case);
   * `lazy` = warehouse-scale database, BE auto-degraded to schemas
   * + tables only, columns fetched per-table on first use. Lets
   * the sidebar tell the user why their first column reference
   * takes a beat to resolve.
   */
  get schemaTreeMode(): { [dbId: string]: 'eager' | 'lazy' } {
    return this.tree.schemaTreeMode;
  }
  // Sequence counter incremented on every datasource/org switch. Async schema
  // load callbacks compare against this to discard responses for selections the
  // user has already moved away from. Owned by the tree service.
  private get schemaSelectionToken(): number {
    return this.tree.schemaSelectionToken;
  }
  private set schemaSelectionToken(token: number) {
    this.tree.schemaSelectionToken = token;
  }


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
    return this.tree.getFilteredTables(tables);
  }

  getFilteredSchemas(schemas: any[] | undefined): any[] {
    return this.tree.getFilteredSchemas(schemas);
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
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService,
    private store: Store,
    private cdr: ChangeDetectorRef,
    private monacoLoader: MonacoLoaderService,
    private translate: TranslateService,
    private elementRef: ElementRef<HTMLElement>,
    private readonly sheet: ResultSheetLayoutService,
    private readonly grid: ResultGridToolsService,
    private readonly tree: DatasetSchemaTreeService,
  ) {}

  /**
   * Lazy-fetch behaviour this screen asks for: skip a fetch already in flight,
   * and show the row spinner up front. edit-dataset passes neither.
   */
  private static readonly ENSURE_TABLES: EnsureTablesOptions = {
    guardReentry: true,
    markLoading: true,
  };

  // ── SchemaTreeHost ──────────────────────────────────────────────

  editorInstance(): any {
    return this.editor;
  }

  selectedDatasourceRecord(): any | null {
    return this.selectedDatasourceObj;
  }

  /** Loaded list first, then preloaded — the order this screen already used. */
  dbTypeCandidates(): any[] {
    return [
      ...(this.availableDatasources ?? []),
      ...(this.preloadedDatasources ?? []),
    ];
  }

  cachedSchemaDbType(dbId: string): string | null {
    return this.tree.getDbTypeFor(dbId);
  }

  /** This screen inserts `table.column` for the public schema. */
  omitPublicSchemaPrefix(): boolean {
    return true;
  }

  /** A scoped tree landed — the editor's read-only state may need to flip. */
  onScopedTreeChanged(): void {
    this.syncEditorReadOnlyState();
  }

  // ── ResultSheetHost / ResultGridHost ────────────────────────────
  //
  // The two result-pane services reach back through these rather than taking an
  // ElementRef or a ChangeDetectorRef of their own, which keeps them free of any
  // dependency on this screen in particular.

  /** The pane the sheet lives in; height is clamped against it, not the viewport. */
  sheetPaneElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector(
      '.editor-results-area',
    ) as HTMLElement | null;
  }

  requestRender(): void {
    this.cdr.markForCheck();
  }

  /** Pane width changed materially — re-measure the result grid's columns. */
  onPaneWidthChanged(): void {
    this.grid.recalculateColumnWidths();
  }

  currentResult(): QueryResult | null {
    return this.queryResult;
  }

  /** Close the datasource tree menu so two menus are never open at once. */
  closeOtherMenus(): void {
    this.showContextMenu = false;
  }

  ngOnInit(): void {
    // Restore the user's preferred result-grid page size so a
    // returning user doesn't have to flip the dropdown from the
    // default every time. localStorage may be unavailable in
    // Safari private mode → fail silently.
    this.loadPersistedPageSize();
    // Same idea for the bottom sheet's height + collapsed state.
    // First-run users get a sensible 45vh default.
    this.sheet.attach(this);
    this.grid.attach(this);
    this.tree.attach(this, AddDatasetComponent.ENSURE_TABLES);
    this.sheet.loadPersisted();

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

    // Debounced SQL → params panel. Re-scanning on every keystroke would
    // thrash the tokenizer; 400ms matches the feel of the dialect lint.
    this.sqlParamScan$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(sql => {
        this.paramsSql = sql;
        this.cdr.markForCheck();
      });

    // The popup flow forwards `datasourceId` and an optional `schema`
    // on the query string. The BE derives the org from the JWT.
    const qp = this.route.snapshot.queryParamMap;
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
   * Fetch the preselected datasource record (set via ?datasourceId=
   * from the list-dataset popup) and treat it as the active selection.
   * No dropdown UI; the dbType badge picks it up from
   * `selectedDatasourceObj.config.dbType`.
   */
  private bootstrapPreselectedDatasource(datasourceId: string): void {
    // Fast path — the list-dataset popup carries the full datasource
    // record through router state when the user clicks Continue.
    // That record already has id / name / config (with dbType), which
    // is everything the toolbar needs. Avoids hitting GET
    // /datasources/:org/:id, which builds an expensive stats blob
    // (size MB, row counts, per-table index counts) we don't render
    // on this page.
    const navState = this.router.getCurrentNavigation()?.extras?.state as
      { datasource?: any } | undefined;
    const stateDs =
      navState?.datasource ??
      // Angular replays state via window.history.state on refresh of
      // the same SPA navigation; also check that fallback.
      window.history?.state?.datasource ??
      null;

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
      .viewDatasource(datasourceId)
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

    // Close context menus on click outside
    document.addEventListener('click', this.boundCloseContextMenu);
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
    this.tree.loadDatasourceSchema(selectedDb.id).then(() => {
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
    this.isLoadingDatasources = true;
    this.selectedDatasourceObj = null;
    const params = {
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
   * Fetcher for the server-mode datasource dropdown.
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
    const params: any = { page, limit };
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
    this.tree.refreshSingleDatasource(dbId);
  }

  refreshSelectedDatasource(): void {
    if (!this.selectedDatasourceObj || !this.selectedDatasourceObj.id) return;
    this.refreshSingleDatasource(this.selectedDatasourceObj.id);
  }


  /**
   * Setup MutationObserver to watch for theme changes
   */

  /**
   * Update Monaco Editor theme
   */
  private updateEditorTheme(): void {
    if (this.editor) {
    }
  }

  ngAfterViewInit(): void {
    this.loadMonacoEditor();
    this.sheet.installResizeObserver();
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
    // The pane observer, its debounce timer and any in-flight sheet drag are
    // disposed by ResultSheetLayoutService's own ngOnDestroy, which Angular runs
    // for a component-provided service.

    if (this.editor) {
      // Through the handle: it disposes the editor plus every listener and
      // overlay registered against it, so nothing is left behind.
      this.handle?.dispose();
      this.handle = null;
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
    setTimeout(async () => {
      const container = this.sqlEditorContainer?.nativeElement;
      if (!container) {
        this.isLoadingEditor = false;
        this.cdr.markForCheck();
        return;
      }

      try {
        // Dispose previous editor if exists
        if (this.editor) {
          // Through the handle: it disposes the editor plus every listener and
          // overlay registered against it, so nothing is left behind.
          this.handle?.dispose();
          this.handle = null;
        }

        const initialValue = this.initialQuery || SQL_EDITOR_PLACEHOLDER;
        // One call replaces load → register language → define theme → create →
        // re-assert the global theme → focus. CodeEditorService owns that sequence
        // for every editor in the app, so this screen cannot drift from the others.
        const handle = await this.codeEditor.create({
          host: container,
          flavour: 'sql',
          value: initialValue,
          readOnly: this.scopedSchemaUnavailable,
                    autoFocus: true,
        });
        this.handle = handle;
        // Existing call sites keep using this.editor; the handle is what
        // disposal goes through.
        this.editor = handle.editor;
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
          this.sqlParamScan$.next(this.currentQuery);
          this.cdr.markForCheck();
        });

        // Initial validation
        this.sqlValidatorService.validate(this.editor.getModel());
        this.scheduleDialectLint();
        // Seed the params panel with the initial editor content.
        this.paramsSql = this.currentQuery;

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
    const dbType = this.selectedDatasourceObj?.config?.dbType ?? null;
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





  /**
   * Execute query - Smart execution based on selection
   * If text is selected, runs selected SQL
   * If no selection, runs current statement at cursor
   */
  executeQuery(): void {
    if (!this.editor) return;
    // Re-entry guard against double-firing while a query is already
    // in flight. The previous version also bailed when
    // `showResultsPopup` was true — a leftover from the modal era
    // when the popup stole focus from Monaco. The docked sheet
    // doesn't steal focus, so users expect Run / Ctrl+Enter to fire
    // a fresh query whether or not the sheet is open.
    if (this.isExecutingQuery) return;

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
    if (this.isExecutingQuery) return;
    const query = this.editor?.getValue() || this.currentQuery;
    this.resultPage = 1;
    this.resultFilterValues = {};
    // Deliberately leave `queryResult` in place until the new
    // result lands. Nulling it would unmount the sheet (the
    // *ngIf="queryResult" branch flips), flicker for the duration
    // of the round-trip, then mount again. The pre-existing rows
    // are correctly replaced when the new response arrives.
    this.executeQueryForDatasource(query);
  }

  /**
   * Execute selected SQL text from editor
   * @param selectedText The selected SQL text to execute
   */
  executeSelectedQuery(selectedText: string): void {
    if (this.isExecutingQuery) return;
    this.resultPage = 1;
    this.resultFilterValues = {};
    // See executeCompleteQuery — same anti-flicker reasoning.
    this.executeQueryForDatasource(selectedText);
  }

  clearEditor(): void {
    if (this.editor) {
      this.editor.setValue('');
    }
  }

  exportCurrentScript(): void {
    if (!this.editor || !this.selectedDatasourceObj) return;

    const datasourceName = this.selectedDatasourceObj.name || 'datasource';
    downloadTextFile(
      this.editor.getValue(),
      `${datasourceName}_script.sql`,
      'text/plain',
    );
  }

  triggerFileInput(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.click();
    }
  }

  /**
   * Import a .sql / .txt file into the editor.
   *
   * Validation and reading live in `dataset-export.helper`; this keeps the toast
   * copy and the editor write, which are the parts that need the component. The
   * file input is cleared on every path so re-picking the same file still fires a
   * change event.
   */
  async onFileSelected(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    const result = await readSqlFile(file, AddDatasetComponent.SQL_UPLOAD_MAX_MB);
    event.target.value = '';

    if (result.ok) {
      if (this.editor) {
        this.editor.setValue(result.sql);
        this.currentQuery = result.sql;
      }
      return;
    }

    const toast =
      result.reason === 'extension'
        ? {
            summary: 'DATASET.INVALID_FILE_FORMAT',
            detail: 'DATASET.INVALID_FILE_FORMAT_DESC',
            params: undefined,
          }
        : result.reason === 'size'
          ? {
              summary: 'DATASET.FILE_TOO_LARGE',
              detail: 'DATASET.FILE_SIZE_LIMIT',
              params: { size: AddDatasetComponent.SQL_UPLOAD_MAX_MB },
            }
          : {
              summary: 'DATASET.IMPORT_FAILED',
              detail: 'DATASET.IMPORT_FAILED_DESC',
              params: undefined,
            };

    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant(toast.summary),
      detail: this.translate.instant(toast.detail, toast.params),
      key: 'topRight',
      life: 3000,
      styleClass: 'custom-toast',
    });
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
  }

  onCancelChange(): void {
    this.showChangeConfirmDialog = false;
    this.pendingDatasourceChange = null;
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
    if (!this.lastExecutedQuery || !this.selectedDatasourceObj?.id) return;

    this.isExportingResults = true;

    const payload = buildResultExportPayload(
      this.selectedDatasourceObj.id,
      this.lastExecutedQuery,
      this.resultFilterValues,
    );

    this.queryService.exportQueryResults(payload).subscribe({
      next: (blob: Blob) => {
        const datasourceName = this.selectedDatasourceObj.name || 'datasource';
        downloadBlob(blob, `${datasourceName}_query_results.csv`);
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
  private static readonly PAGE_SIZE_STORAGE_KEY = 'dbexec.queryResult.pageSize';
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


  /** Toggle the sheet between expanded and collapsed. */
  toggleResultSheet(): void {
    this.sheet.toggle();
  }

  /**
   * Dismiss the sheet entirely. Clears the result so neither the
   * expanded sheet nor the collapsed strip render. Distinct from
   * `toggleResultSheet` which keeps the data alive and just hides
   * the body. Re-running the query brings everything back; until
   * then the editor pane reclaims the full pane height.
   *
   * Doesn't touch the persisted height / collapsed prefs — the
   * user's preferred LAYOUT survives, only the current data is
   * cleared.
   */
  dismissResultSheet(): void {
    this.showResultsPopup = false;
    this.queryResult = null;
    // expandedJsonCells references row indices in queryResult; drop
    // them so a fresh result starts with no expanded JSON cells.
    this.grid.resetExpandedCells();
  }

  /**
   * Surface the sheet for any new result — success, error, or
   * empty / message-only. The previous code only auto-opened on
   * the success branch, which meant a failed query produced no
   * visible feedback when run from a closed sheet, and a query
   * that returned a status message (DDL etc.) flashed nothing.
   *
   * Also flips the collapsed flag back to expanded — and writes
   * the expand to localStorage so the user's preference syncs
   * with their actual usage. The reasoning: a user who ran Run
   * is asking to see the result. Honouring an older "collapsed"
   * pref over that explicit action would be surprising. They can
   * still collapse afterwards.
   */
  private surfaceResultSheet(): void {
    this.showResultsPopup = true;
    this.sheet.expand();
    // Snap the table's internal "first row index" back to 0 so a
    // 200-row → 7-row result transition doesn't leave the grid
    // showing page 4 of nothing. PrimeNG's <p-table>.first is the
    // index of the first row of the current page; setting it to 0
    // is the minimal reset (filter inputs + sort survive — see
    // .reset() if a fuller wipe is ever wanted).
    if (this.resultsTable) {
      this.resultsTable.first = 0;
    }
    this.resultPage = 1;
  }

  /**
   * Effective sheet height in pixels. Collapsed state returns the
   * stub height; otherwise the user-configured / persisted value.
   * Templated into the host element's `--sheet-height` CSS variable
   * so the editor pane can reserve matching `padding-bottom` and
   * keep the SQL editor visible above the sheet.
   */
  get effectiveSheetHeightPx(): number {
    return this.sheet.effectiveHeightPx(
      this.showResultsPopup,
      !!this.queryResult,
    );
  }

  /**
   * mousedown on the drag handle. Captures the starting Y +
   * height so mousemove can compute the new height relative to
   * the drag, not the absolute cursor position. The listeners
   * attach to the document so dragging past the handle's bounds
   * (which happens constantly with a 6px-tall target) still works.
   */
  onSheetDragStart(event: MouseEvent): void {
    this.sheet.onDragStart(event);
  }

  /**
   * Keyboard a11y for the drag handle. Arrow keys nudge the
   * height; shift modifier is a larger step so power users can
   * resize without flailing the arrow key. Persists on each
   * keypress since there's no clear "release" moment.
   */
  onSheetHandleKeydown(event: KeyboardEvent): void {
    this.sheet.onHandleKeydown(event);
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

    if (!this.selectedDatasourceObj?.id) {
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
            // Surface the error in the sheet so the user sees what
            // failed instead of staring at a Run button that
            // appeared to do nothing.
            this.surfaceResultSheet();
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
            // Show the message banner (DDL, "0 rows affected", etc.)
            // in the sheet even though there are no rows to render.
            this.surfaceResultSheet();
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

          // Auto-fit column widths to this result's content.
          this.grid.recalculateColumnWidths();

          // Refresh the profiling strip against the new rows (only when
          // it's currently visible — otherwise it recomputes on open).
          if (this.showColumnProfile) this.grid.recomputeColumnProfiles();

          if (this.queryResult.columns.length > 0) {
            this.surfaceResultSheet();
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
          // Same reason as the response-status:false branch above
          // — surface the failure in the sheet so it's visible.
          this.surfaceResultSheet();

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

      const payload: any = {
        name: formData.name,
        description: formData.description,
        datasource: this.selectedDatasourceObj.id,
        sql,
      };
      // Persist the {{name}} parameter configuration alongside the SQL.
      // Empty when the SQL declares no tokens, so param-less datasets
      // send the same payload as before.
      if (this.paramsConfig.length > 0) {
        payload.paramsConfig = this.paramsConfig;
      }

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
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  /**
   * Params panel emitted an updated config (a token was added/removed
   * or a row's type/label/default/source changed). Store it so it rides
   * along on the next save.
   */
  onParamsConfigChange(config: DatasetParamConfig[]): void {
    this.paramsConfig = config;
    this.cdr.markForCheck();
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

  schemaPath(dbId: string, schemaName: string): string {
    return this.tree.schemaPath(dbId, schemaName);
  }

  tablePath(dbId: string, schemaName: string, tableName: string): string {
    return this.tree.tablePath(dbId, schemaName, tableName);
  }

  isExpanded(path: string): boolean {
    return this.tree.isExpanded(path);
  }



  toggleDatasource(db: any): void {
    this.tree.toggleDatasource(db);
  }

  toggleSchema(dbId: string, schemaName: string): void {
    this.tree.toggleSchema(dbId, schemaName);
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    this.tree.toggleTable(dbId, schemaName, tableName);
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




  isTableExpanded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): boolean {
    return this.tree.isTableExpanded(dbId, schemaName, tableName);
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
    // The cell-level menu shares the global outside-click listener
    // (see boundCloseContextMenu), so it closes from here too.
    this.grid.closeCellContextMenu();
  }

  /**
   * Right-click on a result-grid cell. Stashes which cell was
   * targeted and positions the menu under the cursor. Stops the
   * event from bubbling so the document-level click handler that
   * dismisses other menus doesn't fire on this open event.
   */
  onCellContextMenu(event: MouseEvent, rowIndex: number, col: string): void {
    this.grid.onCellContextMenu(event, rowIndex, col);
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
    await this.grid.copyCellValue();
  }

  /**
   * Copy every value in the right-clicked column for the current
   * page, joined with newlines. Common workflow: "grab all the
   * email addresses out of this query result" — paste into a
   * spreadsheet, done.
   */
  async copyColumnValues(): Promise<void> {
    await this.grid.copyColumnValues();
  }

  /**
   * Wrapper around navigator.clipboard.writeText that handles the
   * "I'm in an insecure context" fallback (rare in this app since
   * it ships HTTPS, but cheap to keep). Toasts the result either
   * way so users know whether the action succeeded.
   */


  // ── Client-side result export + profiling (Slice 4) ───────────────

  /** Base file name for exports — derived from the datasource. */
  private exportBaseName(): string {
    return buildExportBaseName([this.selectedDatasourceObj?.name]);
  }

  /**
   * Export the CURRENT in-memory preview rows to CSV, client-side. No
   * BE call — mirrors what the grid shows. Distinct from
   * `exportResultsAsCsv`, which streams the full server-side result.
   */
  exportResultsCsvClient(): void {
    if (!this.queryResult?.columns?.length) return;
    const csv = rowsToCsv(this.queryResult.columns, this.queryResult.rows);
    downloadTextFile(
      csv,
      `${this.exportBaseName()}_preview.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  /** Export the current in-memory preview rows to JSON, client-side. */
  exportResultsJsonClient(): void {
    if (!this.queryResult?.columns?.length) return;
    const json = rowsToJson(this.queryResult.columns, this.queryResult.rows);
    downloadTextFile(
      json,
      `${this.exportBaseName()}_preview.json`,
      'application/json;charset=utf-8;',
    );
  }

  /** Copy the current SQL editor content to the clipboard. */
  async copySql(): Promise<void> {
    const sql = this.editor?.getValue() || this.currentQuery || '';
    await this.grid.writeToClipboard(sql);
  }

  /** Toggle the column-profiling strip; (re)compute on show. */
  toggleColumnProfile(): void {
    this.grid.toggleColumnProfile();
  }

  /** Recompute per-column profiles over the loaded preview rows. */


  /** Template helper — traffic-light class for a null-% bar. */
  nullSeverity(pct: number): 'good' | 'warn' | 'bad' {
    return this.grid.nullSeverity(pct);
  }

  refreshDatasourceFromContext(): void {
    if (!this.contextMenuDatasource) return;

    // Refresh schema for this specific database
    this.refreshSingleDatasource(this.contextMenuDatasource.id);

    this.closeContextMenu();
  }

  /**
   * Esc dismisses transient overlays (context menus, popovers).
   * The docked result sheet is intentionally NOT in this list —
   * with the modal-era popup, Esc made sense as "close the
   * overlay above the editor"; in the docked sheet world the
   * panel is part of the page layout, and an accidental Esc
   * tap losing the result would be a footgun. Use the chevron
   * (collapse) or × (dismiss) buttons in the sheet header.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showContextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
  }
}
