import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, Subject, TimeoutError } from 'rxjs';
import { debounceTime, first, timeout } from 'rxjs/operators';
import { DATASET, QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { IAPIResponse } from 'src/app/core/models/global.model';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { expandAnimation } from '../../animations/expand.animation';
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
import { DatasourceService } from '../../../datasource/services/datasource.service';
import { DatasetService } from '../../services/dataset.service';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import { SqlLinterService } from '../../services/sql-linter.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from '../../../datasource/constants/database-types.constant';
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

@Component({
  selector: 'app-edit-dataset',
  templateUrl: './edit-dataset.component.html',
  styleUrls: ['./edit-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [expandAnimation],
})
export class EditDatasetComponent
  implements OnInit, OnDestroy, AfterViewInit, HasUnsavedChanges
{
  // ViewChild for file input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('sqlEditorContainer')
  sqlEditorContainer!: ElementRef<HTMLDivElement>;

  // Dataset ID from route
  datasetId?: string;
  orgId?: string;
  isLoadingDataset = false;
  datasetName: string = '';
  datasetDescription: string = '';
  datasetStatus: number = 1;
  initialQuery?: string;
  originalQuery: string = ''; // Store original query from dataset

  editor: any;
  isLoadingEditor = true;
  isLoadingSchema = false;
  isExecutingQuery = false;
  monacoLoadFailed = false;
  queryResult: QueryResult | null = null;
  datasources: DatasourceSchema[] = [];
  currentQuery = '';

  // Theme monitoring
  private themeObserver: MutationObserver | null = null;
  private currentTheme: string = 'vs-dark';

  // Database sidebar
  showDatasourceSidebar = true;
  /**
   * Single set of expanded tree paths (`dbId`, `dbId.schemaName`,
   * `dbId.schemaName.tableName`). Replaces three parallel dictionaries.
   */
  expandedPaths = new Set<string>();
  schemaSearchText = '';

  // Context Menu
  showContextMenu = false;
  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];
  contextMenuDatasource: any | null = null;

  // Save as Dataset Dialog
  showDatasetDialog = false;

  // Results Popup
  showResultsPopup = false;
  resultRows = 25;
  resultPage = 1;
  isExportingResults = false;
  resultFilterValues: { [key: string]: string } = {};
  private resultFilterSubject = new Subject<void>();
  private lastExecutedQuery = '';
  private lastResultsLazyEvent: any = null;

  get isPaginationEnabled(): boolean {
    return !!this.queryResult;
  }

  // (Removed: isPaginatorNeeded — see add-dataset for the same
  // change. Paginator is now always-on so the footer doesn't pop
  // in when a result spills past one page.)

  /** True when at least one column has a type hint. Hides the type
   *  chip row when the BE didn't ship types for any column. */
  get hasAnyColumnType(): boolean {
    const types = this.queryResult?.columnTypes;
    return !!types && Object.keys(types).length > 0;
  }

  // ── Bottom-sheet state (mirrors add-dataset) ──────────────────────
  resultSheetHeightPx = 420;
  isResultSheetCollapsed = false;
  private sheetDragState: {
    startY: number;
    startHeight: number;
    onMove: (ev: MouseEvent) => void;
    onUp: () => void;
  } | null = null;

  /** Per-column pixel width applied to the result grid's <colgroup>. */
  columnWidths: Record<string, number> = {};

  /** Expanded JSON-cell tracking for the result grid. */
  expandedJsonCells = new Set<string>();

  /** Cell-level right-click context menu state. */
  showCellContextMenu = false;
  cellContextMenuTop = 0;
  cellContextMenuLeft = 0;
  private cellContextTarget: { rowIndex: number; col: string } | null = null;

  /** ResizeObserver watching .editor-results-area so column widths
   *  re-flow when the pane width changes. */
  private paneResizeObserver: ResizeObserver | null = null;
  private paneResizeTimer: any = null;
  private lastObservedPaneWidth = 0;

  /** PrimeNG <p-table> ref so we can reset `.first` between
   *  successive queries (prevents stale paginator state). */
  @ViewChild('resultsTable') resultsTable: any;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  private signatureHelpDisposable: any = null;

  /** Debounce handle for dialect lint. Cleared in ngOnDestroy. */
  private dialectLintTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monaco markers owner-id for the lint pass. */
  private static readonly DIALECT_LINT_OWNER = 'sql-dialect-lint';

  // Stable bound reference for context menu listener
  private boundCloseContextMenu = this.closeContextMenu.bind(this);

  selectedOrg: any = {};
  selectedDatasourceObj: any = null;
  selectedDatasourceName: string = '';

  /**
   * DatabaseTypeOption for the dataset's owning datasource. Drives the
   * dbType badge next to the read-only datasource input. Edit mode
   * never lets the user change datasources, so this is fixed once
   * `selectedDatasourceObj` resolves from the dataset record.
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
  // Sequence counter incremented on every datasource switch. Async schema
  // load callbacks compare against this to discard stale state writes.
  private schemaSelectionToken = 0;

  // NgRx Store Observables for schema caching
  private schemaDataObservables: Map<string, Observable<any | null>> =
    new Map();
  private schemaStatusObservables: Map<
    string,
    Observable<SchemaLoadingStatus>
  > = new Map();

  get isQueryEmpty(): boolean {
    const query = this.currentQuery.trim();
    const defaultQuery = SQL_EDITOR_PLACEHOLDER;
    return !query || query === defaultQuery;
  }

  get hasQueryChanged(): boolean {
    if (!this.editor) return false;
    const currentQuery = this.editor.getValue().trim();
    const originalQuery = this.originalQuery.trim();
    return currentQuery !== originalQuery;
  }

  hasUnsavedChanges(): boolean {
    return this.hasQueryChanged;
  }

  getFilteredTables(tables: any[]): any[] {
    if (!this.schemaSearchText) {
      return tables;
    }
    const search = this.schemaSearchText.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(search));
  }

  getFilteredSchemas(schemas: any[] | undefined): any[] {
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
    private sqlLinterService: SqlLinterService,
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
  ) {
  }

  ngOnInit(): void {
    // Restore the user's preferred result-sheet height + collapsed
    // state so a returning user gets back where they left off.
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

    // Fetch orgId and datasetId from route params
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.datasetId = params['id'] ? params['id'] : undefined;
        this.orgId = params['orgId']
          ? params['orgId']
          : this.globalService.getTokenDetails('organisationId');

        // If datasetId is present, fetch dataset data first
        if (this.datasetId && this.orgId) {
          this.fetchDatasetData();
        }
      });
  }

  private initializeComponent(): void {
    // Setup theme monitoring
    this.setupThemeObserver();

    // Close context menus on click outside
    document.addEventListener('click', this.boundCloseContextMenu);
  }

  refreshSingleDatasource(dbId: string): void {
    if (!dbId || !this.orgId) return;

    const orgId = this.orgId.toString();
    const dbIdStr = dbId.toString();

    // Dispatch refresh action to clear cache and reload
    this.store.dispatch(
      AddDatasetActions.refreshSchemaData({
        orgId,
        dbId: dbIdStr,
      }),
    );

    // Collapse this database's tree (datasource itself + schemas + tables).
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
    this.installResultPaneResizeObserver();
  }

  ngOnDestroy(): void {
    this.resultFilterSubject.complete();

    if (this.paneResizeObserver) {
      this.paneResizeObserver.disconnect();
      this.paneResizeObserver = null;
    }
    if (this.paneResizeTimer) {
      clearTimeout(this.paneResizeTimer);
      this.paneResizeTimer = null;
    }

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

    // Cancel any pending lint pass so it doesn't fire after teardown.
    if (this.dialectLintTimer) {
      clearTimeout(this.dialectLintTimer);
      this.dialectLintTimer = null;
    }

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

    // Lock the dialect to the datasource we're editing against. Edit
    // mode never lets the user switch datasources — the dataset is
    // bound to one — so this only needs to fire once per editor init.
    this.monacoIntelliSenseService.setActiveDbType(
      this.selectedDatasourceObj?.config?.dbType ?? null,
    );

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

        // Create Monaco Editor instance
        this.editor = monaco.editor.create(container, {
          ...MONACO_EDITOR_OPTIONS,
          value: initialValue,
          theme: this.currentTheme,
        });
        this.currentQuery = initialValue;

        // Add Ctrl+Enter handler for query execution
        this.editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          () => {
            this.executeQuery();
          },
        );

        // Focus the editor
        this.editor.focus();

        // Setup content change listener. Monaco events fire outside Angular's
        // zone — without markForCheck the Run button (gated on isQueryEmpty
        // / hasQueryChanged) won't update as the user types under OnPush.
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
          this.scheduleDialectLint();
          this.cdr.markForCheck();
        });

        // Register IntelliSense
        this.registerIntelliSenseProviders();
        // Kick an initial lint pass so the user sees marker decorations
        // for any pre-existing syntax errors when they open an existing
        // dataset (instead of only on subsequent keystrokes).
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
   * Register IntelliSense providers
   */
  /**
   * Debounced dialect-aware lint pass. Re-parses the model with the
   * active dialect's grammar, surfaces error nodes as Monaco markers.
   * No-op when ENABLE_DIALECT_LINT is false.
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
      EditDatasetComponent.DIALECT_LINT_OWNER,
      markers,
    );
  }

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
    if (!dbId || !this.orgId) return Promise.resolve();

    const orgId = this.orgId.toString();
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
    // Tag the schema record with its dbType so multi-datasource hover
    // / completion can resolve the dialect (the API schema response
    // doesn't include it; we annotate post-hoc from the active record).
    const dbType = this.selectedDatasourceObj?.config?.dbType ?? null;
    if (schemaData && dbType) {
      schemaData = { ...schemaData, dbType };
    }
    this.datasourceSchemas[dbId] = schemaData;

    // Push fresh schema into the IntelliSense cache. Providers read this
    // lazily on each invocation, so no re-registration is needed.
    this.datasources = Object.values(this.datasourceSchemas);
    this.monacoIntelliSenseService.setDatasources(this.datasources);

    this.loadingDatasources[dbId] = false;
    this.cdr.markForCheck();
  }

  /**
   * Load datasource schema from API and update store
   */
  private async loadDatasourceSchemaFromAPI(dbId: string): Promise<void> {
    if (!dbId || !this.orgId) return Promise.resolve();

    const orgId = this.orgId.toString();
    const dbIdStr = dbId.toString();
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
        // Lazy schema-list fetch (see add-dataset for the same pattern).
        this.datasourceService
          .listDatasourceSchemas({
            orgId,
            datasourceId: dbIdStr,
          })
          .then((response: any) => {
            const schemaData =
              SchemaTransformerHelper.transformLazySchemasResponse(response);

            if (schemaData.length > 0) {
              const dbType =
                this.selectedDatasourceObj?.config?.dbType ?? null;
              const tagged = dbType
                ? { ...schemaData[0], dbType }
                : schemaData[0];
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataSuccess({
                  orgId,
                  dbId: dbIdStr,
                  data: tagged,
                }),
              );
              this.datasourceSchemas[dbId] = tagged;
            }

            if (token === this.schemaSelectionToken) {
              this.datasources = Object.values(this.datasourceSchemas);
              this.monacoIntelliSenseService.setDatasources(this.datasources);
            }

            this.loadingDatasources[dbId] = false;
            this.cdr.markForCheck();
            resolve();
          })
          .catch((error: any) => {
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
    // Re-entry guard against double-firing while a query is in
    // flight. The previous `showResultsPopup ||` clause was a
    // modal-era leftover; with the docked sheet, Run is expected
    // to work whether the sheet is open or not.
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
    // Leave queryResult in place until the new result lands —
    // avoids the *ngIf flicker that would otherwise unmount the
    // sheet between queries.
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

  resetToOriginal(): void {
    if (!this.editor) return;

    // Reset editor to original query
    this.editor.setValue(this.originalQuery);
    this.currentQuery = this.originalQuery;
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
    const maxSizeInMB = 22;
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
    this.resultRows = limit;

    // Build filter object from non-empty filter values
    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    this.executeQueryForDatasource(this.lastExecutedQuery, page, limit, filter);
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

          // Auto-fit columns to content with last-column flex —
          // mirrors add-dataset's behaviour.
          const measured = measureColumnWidths(
            this.queryResult.columns,
            this.queryResult.rows,
            this.queryResult.columnTypes,
          );
          this.columnWidths = flexLastColumn(
            measured,
            this.queryResult.columns,
            this.lastObservedPaneWidth || window.innerWidth,
          );

          if (this.queryResult.columns.length > 0) {
            this.surfaceResultSheet();
          }

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          const executionTime = `${Date.now() - startTime}ms`;

          // Extract error message — RxJS TimeoutError gets a friendlier copy.
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
          this.surfaceResultSheet();

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ────────────────────────────────────────────────────────────────
  // Bottom-sheet behaviour mirrored from add-dataset. See
  // add-dataset.component.ts for the long-form comments on each
  // method — same semantics, scoped to this component's lifecycle.
  // ────────────────────────────────────────────────────────────────

  private static readonly SHEET_HEIGHT_STORAGE_KEY =
    'dbexec.queryResult.sheetHeightPx';
  private static readonly SHEET_COLLAPSED_STORAGE_KEY =
    'dbexec.queryResult.sheetCollapsed';
  private static readonly SHEET_MIN_HEIGHT = 240;
  private static readonly SHEET_MAX_HEIGHT_PADDING = 120;

  private clampSheetHeight(px: number): number {
    const host = this.elementRef.nativeElement.querySelector(
      '.editor-results-area',
    ) as HTMLElement | null;
    const containerHeight =
      host?.getBoundingClientRect().height ?? window.innerHeight;
    const max = Math.max(
      EditDatasetComponent.SHEET_MIN_HEIGHT,
      containerHeight - EditDatasetComponent.SHEET_MAX_HEIGHT_PADDING,
    );
    return Math.min(
      max,
      Math.max(EditDatasetComponent.SHEET_MIN_HEIGHT, px),
    );
  }

  private loadPersistedSheetState(): void {
    try {
      const raw = localStorage.getItem(
        EditDatasetComponent.SHEET_HEIGHT_STORAGE_KEY,
      );
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          this.resultSheetHeightPx = this.clampSheetHeight(parsed);
        }
      } else {
        this.resultSheetHeightPx = this.clampSheetHeight(
          Math.round(window.innerHeight * 0.45),
        );
      }
      const collapsedRaw = localStorage.getItem(
        EditDatasetComponent.SHEET_COLLAPSED_STORAGE_KEY,
      );
      this.isResultSheetCollapsed = collapsedRaw === 'true';
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  private persistSheetHeight(px: number): void {
    try {
      localStorage.setItem(
        EditDatasetComponent.SHEET_HEIGHT_STORAGE_KEY,
        String(Math.round(px)),
      );
    } catch (_) {}
  }

  private persistSheetCollapsed(collapsed: boolean): void {
    try {
      localStorage.setItem(
        EditDatasetComponent.SHEET_COLLAPSED_STORAGE_KEY,
        collapsed ? 'true' : 'false',
      );
    } catch (_) {}
  }

  toggleResultSheet(): void {
    this.isResultSheetCollapsed = !this.isResultSheetCollapsed;
    this.persistSheetCollapsed(this.isResultSheetCollapsed);
  }

  dismissResultSheet(): void {
    this.showResultsPopup = false;
    this.queryResult = null;
    if (this.expandedJsonCells.size > 0) {
      this.expandedJsonCells = new Set();
    }
  }

  private surfaceResultSheet(): void {
    this.showResultsPopup = true;
    if (this.isResultSheetCollapsed) {
      this.isResultSheetCollapsed = false;
      this.persistSheetCollapsed(false);
    }
    if (this.resultsTable) {
      this.resultsTable.first = 0;
    }
    this.resultPage = 1;
  }

  onSheetDragStart(event: MouseEvent): void {
    event.preventDefault();
    if (this.isResultSheetCollapsed) return;
    const startY = event.clientY;
    const startHeight = this.resultSheetHeightPx;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      this.resultSheetHeightPx = this.clampSheetHeight(startHeight + delta);
      this.cdr.markForCheck();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.persistSheetHeight(this.resultSheetHeightPx);
      this.sheetDragState = null;
      document.body.classList.remove('ds-sheet-dragging');
    };
    this.sheetDragState = { startY, startHeight, onMove, onUp };
    document.body.classList.add('ds-sheet-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onSheetHandleKeydown(event: KeyboardEvent): void {
    if (this.isResultSheetCollapsed) return;
    const step = event.shiftKey ? 80 : 20;
    let next = this.resultSheetHeightPx;
    if (event.key === 'ArrowUp') next = this.resultSheetHeightPx + step;
    else if (event.key === 'ArrowDown') next = this.resultSheetHeightPx - step;
    else return;
    event.preventDefault();
    this.resultSheetHeightPx = this.clampSheetHeight(next);
    this.persistSheetHeight(this.resultSheetHeightPx);
  }

  get effectiveSheetHeightPx(): number {
    if (!this.showResultsPopup || !this.queryResult) return 0;
    return this.isResultSheetCollapsed ? 44 : this.resultSheetHeightPx;
  }

  // ── JSON cell expand/collapse ─────────────────────────────────
  jsonCellKey(rowIndex: number, col: string): string {
    return `${rowIndex}-${col}`;
  }

  toggleJsonCell(rowIndex: number, col: string): void {
    const key = this.jsonCellKey(rowIndex, col);
    if (this.expandedJsonCells.has(key)) this.expandedJsonCells.delete(key);
    else this.expandedJsonCells.add(key);
    this.expandedJsonCells = new Set(this.expandedJsonCells);
  }

  // ── Cell context menu (Copy cell / column) ────────────────────
  onCellContextMenu(event: MouseEvent, rowIndex: number, col: string): void {
    if (!this.queryResult) return;
    event.preventDefault();
    event.stopPropagation();
    this.showContextMenu = false;
    this.cellContextTarget = { rowIndex, col };
    this.cellContextMenuLeft = event.clientX;
    this.cellContextMenuTop = event.clientY;
    this.showCellContextMenu = true;
  }

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

  private async writeToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
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
      this.globalService.showInfo(this.translate.instant('DATASET.COPIED'));
    } catch (_) {
      this.globalService.showWarn(
        this.translate.instant('DATASET.COPY_FAILED'),
      );
    }
  }

  // ── Pane-resize column re-flow ────────────────────────────────
  private installResultPaneResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const pane = this.elementRef.nativeElement.querySelector(
      '.editor-results-area',
    ) as HTMLElement | null;
    if (!pane) return;
    this.lastObservedPaneWidth = pane.getBoundingClientRect().width;
    this.paneResizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (Math.abs(width - this.lastObservedPaneWidth) < 50) return;
      this.lastObservedPaneWidth = width;
      if (this.paneResizeTimer) clearTimeout(this.paneResizeTimer);
      this.paneResizeTimer = setTimeout(() => {
        this.recalculateColumnWidths();
        this.paneResizeTimer = null;
      }, 80);
    });
    this.paneResizeObserver.observe(pane);
  }

  private recalculateColumnWidths(): void {
    if (!this.queryResult || !this.queryResult.columns?.length) return;
    const measured = measureColumnWidths(
      this.queryResult.columns,
      this.queryResult.rows,
      this.queryResult.columnTypes,
    );
    this.columnWidths = flexLastColumn(
      measured,
      this.queryResult.columns,
      this.lastObservedPaneWidth || window.innerWidth,
    );
    this.cdr.markForCheck();
  }

  onDatasetDialogClose(formData: DatasetFormData | null): void {
    this.showDatasetDialog = false;

    if (formData) {
      if (!this.selectedDatasourceObj || !this.datasetId) return;

      // Get the SQL query
      const sql = this.editor?.getValue() || this.currentQuery;

      const saveData = {
        id: this.datasetId,
        name: formData.name,
        description: formData.description,
        organisation: this.selectedOrg?.id,
        datasource: this.selectedDatasourceObj.id,
        sql,
      };

      this.datasetService
        .updateDataset(saveData, (formData.justification || '').trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response, true)) {
            this.originalQuery = this.editor?.getValue() || this.currentQuery;
            this.router.navigate([DATASET.LIST]);
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

  /** Remove `dbId` and every descendant path under it. */
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
   * Lazy fetch tables on first expand of a schema row. See
   * add-dataset.component.ts for the matching implementation; the two
   * components have to repeat the logic because the schema cache is
   * keyed per-component instance, not in a shared service.
   */
  private ensureTablesLoaded(dbId: string, schemaName: string): void {
    if (!this.selectedOrg?.id) return;
    const orgId = String(this.selectedOrg.id);
    const dbIdStr = String(dbId);
    const schema = this.datasourceSchemas[dbId]?.schemas?.find(
      s => s.name === schemaName,
    ) as any;
    if (schema && Array.isArray(schema.tables) && schema.tables.length > 0) {
      return;
    }
    this.store.dispatch(
      AddDatasetActions.loadTablesForSchema({
        orgId,
        dbId: dbIdStr,
        schemaName,
      }),
    );
    this.datasourceService
      .listSchemaTables({ orgId, datasourceId: dbIdStr, schemaName })
      .then((response: any) => {
        // BE returns HTTP 200 with `status: false` for app-level
        // failures (e.g. schema not found). Surface the message in
        // the sidebar + a toast rather than silently rendering 0
        // tables. Mirrors the add-dataset implementation.
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
   * Immutably replace a schema row inside the cached tree so OnPush
   * + the filterSchemas / filterTables pure pipes see new
   * references and re-render. Mirrors the helper of the same name
   * in add-dataset.component.ts.
   */
  private replaceSchemaNode(
    dbId: string,
    schemaName: string,
    patch: (schema: any) => any,
  ): void {
    const tree = this.datasourceSchemas[dbId];
    if (!tree) return;
    const idx =
      tree.schemas?.findIndex((s: any) => s.name === schemaName) ?? -1;
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
  }

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
    const text = `${schemaName}.${tableName}.${columnName}`;

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
    // Cell-level context menu shares the global outside-click
    // listener, so close it from here too.
    this.showCellContextMenu = false;
    this.cellContextTarget = null;
  }

  refreshDatasourceFromContext(): void {
    if (!this.contextMenuDatasource) return;

    // Refresh schema for this specific database
    this.refreshSingleDatasource(this.contextMenuDatasource.id);

    this.closeContextMenu();
  }

  /**
   * Esc dismisses transient overlays only. The docked result
   * sheet is intentionally NOT bound to Esc — accidental Esc
   * dropping the result would be a footgun. Use the sheet's
   * chevron (collapse) or × (dismiss) buttons.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showContextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
  }

  /**
   * Fetch dataset data by ID and populate the form
   */
  private fetchDatasetData(): void {
    if (!this.datasetId) return;

    this.isLoadingDataset = true;

    this.datasetService
      .getDataset(this.datasetId)
      .then(response => {
        this.isLoadingDataset = false;

        if (this.globalService.handleSuccessService(response, false)) {
          const dataset = response.data;

          // Type 2 (Prompt-based): redirect to execute-query-builder in edit mode
          if (dataset.type === 2 && dataset.queryBuilderId) {
            this.router.navigate(
              [
                QUERY_BUILDER.run(
                  dataset.organisationId,
                  dataset.datasourceId,
                  dataset.queryBuilderId,
                ),
              ],
              {
                queryParams: {
                  editDatasetId: dataset.id,
                  editDatasetName: dataset.name,
                },
                replaceUrl: true,
              },
            );
            return;
          }

          // Store dataset details
          this.datasetName = dataset.name || '';
          this.datasetDescription = dataset.description || '';
          this.datasetStatus = dataset.status || 1;

          // Set organisation from API response
          this.selectedOrg = {
            id: dataset.organisationId,
          };

          // Set database from API response
          this.selectedDatasourceObj = {
            id: dataset.datasourceId,
            name: dataset.datasource?.name,
          };
          this.selectedDatasourceName = dataset.datasource?.name || '';
          this.expandedPaths.add(dataset.datasourceId);

          // Load schema for the selected database
          this.loadDatasourceSchema(dataset.datasourceId).then(() => {
            // Set the SQL query in editor
            const sqlQuery = dataset.sql || SQL_EDITOR_PLACEHOLDER;
            this.initialQuery = sqlQuery;
            this.currentQuery = sqlQuery;
            this.originalQuery = sqlQuery; // Store original query for reset

            // Initialize editor with the query
            if (!this.editor) {
              setTimeout(() => this.loadMonacoEditor(), 100);
            } else {
              this.editor.setValue(sqlQuery);
            }

            // Initialize component setup
            this.initializeComponent();
          });
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDataset = false;
        this.cdr.markForCheck();
      });
  }
}
