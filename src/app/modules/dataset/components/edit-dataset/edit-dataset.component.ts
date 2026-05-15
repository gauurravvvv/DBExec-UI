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
import { MessageService } from 'primeng/api';
import { Observable, Subject, TimeoutError } from 'rxjs';
import { debounceTime, first, timeout } from 'rxjs/operators';
import { DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import {
  MONACO_EDITOR_OPTIONS,
  QUERY_EXECUTION_TIMEOUT_MS,
  SQL_EDITOR_PLACEHOLDER,
} from '../../config/sql-editor.config';
import { IAPIResponse } from 'src/app/core/interfaces/global.interface';
import {
  DatasourceSchema,
  QueryExecuteData,
  QueryResult,
} from '../../helpers/dummy-data.helper';
import { SchemaTransformerHelper } from '../../helpers/schema-transformer.helper';
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../../models/query-tab.model';
import { DatasetService } from '../../services/dataset.service';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import {
  AddDatasetActions,
  SchemaLoadingStatus,
  selectIsSchemaStale,
  selectSchemaByKey,
} from '../../store';
import { TranslateService } from '@ngx-translate/core';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;
import { expandAnimation } from '../../animations/expand.animation';

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

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  private signatureHelpDisposable: any = null;

  // Stable bound reference for context menu listener
  private boundCloseContextMenu = this.closeContextMenu.bind(this);

  // Organisation Management
  selectedOrg: any = {};
  selectedOrgName: string = '';
  userRole: string = '';
  showOrganisationDropdown: boolean = false;
  selectedDatasourceObj: any = null;
  selectedDatasourceName: string = '';

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
    private monacoIntelliSenseService: MonacoIntelliSenseService,
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
          this.cdr.markForCheck();
        });

        // Register IntelliSense
        this.registerIntelliSenseProviders();

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
    // Store schema data by database ID
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
        this.queryService
          .getDatasourceStructure(dbId, this.selectedOrg.id)
          .subscribe({
            next: (response: any) => {
              const schemaData =
                SchemaTransformerHelper.transformSchemaResponse(response);

              // Dispatch success action with schema data — cache stays valid
              // for this dbId regardless of whether the user moved on.
              if (schemaData.length > 0) {
                this.store.dispatch(
                  AddDatasetActions.loadSchemaDataSuccess({
                    orgId,
                    dbId: dbIdStr,
                    data: schemaData[0],
                  }),
                );
                this.datasourceSchemas[dbId] = schemaData[0];
              }

              // Push fresh schema into the IntelliSense cache only if the
              // user is still on this DB.
              if (token === this.schemaSelectionToken) {
                this.datasources = Object.values(this.datasourceSchemas);
                this.monacoIntelliSenseService.setDatasources(
                  this.datasources,
                );
              }

              this.loadingDatasources[dbId] = false;
              this.cdr.markForCheck();
              resolve();
            },
            error: (error: any) => {
              // Dispatch failure action
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataFailure({
                  orgId,
                  dbId: dbIdStr,
                  error: error.message || this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
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
            error: error.message || this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
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
        detail: this.translate.instant('DATASET.FILE_SIZE_LIMIT', { size: maxSizeInMB }),
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

        if (this.queryResult.columns.length > 0) {
          this.showResultsPopup = true;
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

        this.isExecutingQuery = false;
        this.cdr.markForCheck();
      },
    });
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
    } else {
      this.expandedPaths.add(key);
    }
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    const key = this.tablePath(dbId, schemaName, tableName);
    if (this.expandedPaths.has(key)) {
      this.expandedPaths.delete(key);
    } else {
      this.expandedPaths.add(key);
    }
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

  /**
   * Fetch dataset data by ID and populate the form
   */
  private fetchDatasetData(): void {
    if (!this.datasetId || !this.orgId) return;

    this.isLoadingDataset = true;

    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        this.isLoadingDataset = false;

        if (this.globalService.handleSuccessService(response, false)) {
          const dataset = response.data;

          // Type 2 (Prompt-based): redirect to execute-query-builder in edit mode
          if (dataset.type === 2 && dataset.queryBuilderId) {
            this.router.navigate(
              [
                '/app/query-builder/execute',
                dataset.organisationId,
                dataset.datasourceId,
                dataset.queryBuilderId,
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
          this.selectedOrgName = dataset.organisationName || '';

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
