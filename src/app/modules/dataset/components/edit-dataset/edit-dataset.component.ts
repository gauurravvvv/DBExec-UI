import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { MessageService } from 'primeng/api';
import { Observable, Subject } from 'rxjs';
import { debounceTime, first } from 'rxjs/operators';
import { DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { MONACO_EDITOR_OPTIONS } from '../../config/sql-editor.config';
import { DatasourceSchema, QueryResult } from '../../helpers/dummy-data.helper';
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
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;
@Component({
  selector: 'app-edit-dataset',
  templateUrl: './edit-dataset.component.html',
  styleUrls: ['./edit-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  expandedDatasources: { [key: string]: boolean } = {};
  expandedSchemas: { [key: string]: boolean } = {};
  expandedTables: { [key: string]: boolean } = {};
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

  // NgRx Store Observables for schema caching
  private schemaDataObservables: Map<string, Observable<any | null>> =
    new Map();
  private schemaStatusObservables: Map<
    string,
    Observable<SchemaLoadingStatus>
  > = new Map();

  get isQueryEmpty(): boolean {
    const query = this.currentQuery.trim();
    const defaultQuery = '-- Write your SQL query here';
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
  ) {
    this.userRole = this.globalService.getTokenDetails('role') || '';
    this.showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
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

    // Collapse this database's tree (schemas and tables)
    Object.keys(this.expandedSchemas).forEach(key => {
      if (key.startsWith(`${dbId}.`)) {
        delete this.expandedSchemas[key];
      }
    });
    Object.keys(this.expandedTables).forEach(key => {
      if (key.startsWith(`${dbId}.`)) {
        delete this.expandedTables[key];
      }
    });

    // Collapse the database itself
    delete this.expandedDatasources[dbId];

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
      return;
    }

    // Wait for the DOM to be ready
    setTimeout(() => {
      const container = this.sqlEditorContainer?.nativeElement;
      if (!container) {
        this.isLoadingEditor = false;
        return;
      }

      try {
        // Dispose previous editor if exists
        if (this.editor) {
          this.editor.dispose();
        }

        // Create Monaco Editor instance
        this.editor = monaco.editor.create(container, {
          ...MONACO_EDITOR_OPTIONS,
          value: this.initialQuery || '-- Write your SQL query here',
          theme: this.currentTheme,
        });

        // Add Ctrl+Enter handler for query execution
        this.editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          () => {
            this.executeQuery();
          },
        );

        // Focus the editor
        this.editor.focus();

        // Setup content change listener
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
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
      } catch (error) {
        this.isLoadingEditor = false;
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

    // Update datasources array for IntelliSense
    this.datasources = Object.values(this.datasourceSchemas);

    // Re-register completions with new schema
    this.registerIntelliSenseProviders();

    this.loadingDatasources[dbId] = false;
  }

  /**
   * Load datasource schema from API and update store
   */
  private async loadDatasourceSchemaFromAPI(dbId: string): Promise<void> {
    if (!dbId || !this.orgId) return Promise.resolve();

    const orgId = this.orgId.toString();
    const dbIdStr = dbId.toString();

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

              // Dispatch success action with schema data
              if (schemaData.length > 0) {
                this.store.dispatch(
                  AddDatasetActions.loadSchemaDataSuccess({
                    orgId,
                    dbId: dbIdStr,
                    data: schemaData[0],
                  }),
                );

                // Store schema data by database ID
                this.datasourceSchemas[dbId] = schemaData[0];
              }

              // Update datasources array for IntelliSense
              this.datasources = Object.values(this.datasourceSchemas);

              // Re-register completions with new schema
              this.registerIntelliSenseProviders();

              this.loadingDatasources[dbId] = false;
              resolve();
            },
            error: (error: any) => {
              // Dispatch failure action
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataFailure({
                  orgId,
                  dbId: dbIdStr,
                  error: error.message || 'Failed to load schema',
                }),
              );

              this.loadingDatasources[dbId] = false;
              reject(error);
            },
          });
      } catch (error: any) {
        // Dispatch failure action
        this.store.dispatch(
          AddDatasetActions.loadSchemaDataFailure({
            orgId,
            dbId: dbIdStr,
            error: error.message || 'Failed to load schema',
          }),
        );

        this.loadingDatasources[dbId] = false;
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
        summary: 'Invalid File Format',
        detail: 'Please upload a valid SQL file (.sql or .txt)',
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
        summary: 'File Too Large',
        detail: `File size must be less than ${maxSizeInMB}MB`,
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
        summary: 'Import Failed',
        detail: 'Failed to read the file. Please try again.',
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
      this.editor.setValue('-- Write your SQL query here');
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
      },
      error: (error: any) => {
        this.isExportingResults = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Export Failed',
          detail:
            error.error?.message ||
            error.message ||
            'Failed to export query results',
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

    this.queryService.executeQuery(payload).subscribe({
      next: (response: any) => {
        // Check if response indicates an error (status: false)
        if (response.status === false) {
          const executionTime = `${Date.now() - startTime}ms`;
          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: executionTime,
            error: response.message || 'Query execution failed',
          };
          this.isExecutingQuery = false;
          return;
        }

        // Handle string-based response
        if (typeof response === 'string') {
          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: `${Date.now() - startTime}ms`,
            message: response,
          };
          this.isExecutingQuery = false;
          return;
        }

        // Extract the actual data object from response
        const dataObj = response.data || response;

        // Extract execution time
        let executionTime = dataObj.executionTime || response.executionTime;

        if (executionTime && typeof executionTime === 'string') {
          executionTime = executionTime;
        } else if (executionTime && typeof executionTime === 'number') {
          executionTime = `${executionTime}ms`;
        } else {
          const calculatedTime = Date.now() - startTime;
          executionTime = `${calculatedTime}ms`;
        }

        // Extract columns and rows from API response
        const data = dataObj.data || dataObj.rows || [];
        const columns =
          dataObj.columns ||
          (Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : []);
        const rowCount =
          dataObj.rowCount !== undefined
            ? dataObj.rowCount
            : Array.isArray(data)
              ? data.length
              : 0;

        // Extract column types
        const columnTypes = dataObj.columnTypes || response.columnTypes || {};

        this.queryResult = {
          columns: columns,
          columnTypes: columnTypes,
          rows: Array.isArray(data) ? data : [],
          rowCount: rowCount,
          executionTime: executionTime,
          query: dataObj.query || response.query,
        };

        // Auto-open results popup if there are columns
        if (this.queryResult.columns.length > 0) {
          this.showResultsPopup = true;
        }

        this.isExecutingQuery = false;
      },
      error: (error: any) => {
        const executionTime = `${Date.now() - startTime}ms`;

        // Extract error message
        let errorMessage = 'Query execution failed';
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }

        this.queryResult = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: executionTime,
          error: errorMessage,
        };

        this.isExecutingQuery = false;
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

  toggleDatasource(db: any): void {
    const isExpanded = this.expandedDatasources[db.id];

    if (isExpanded) {
      // Collapse - also collapse all child schemas and tables
      this.expandedDatasources[db.id] = false;

      // Collapse all schemas under this database
      Object.keys(this.expandedSchemas).forEach(key => {
        if (key.startsWith(`${db.id}.`)) {
          delete this.expandedSchemas[key];
        }
      });

      // Collapse all tables under this database
      Object.keys(this.expandedTables).forEach(key => {
        if (key.startsWith(`${db.id}.`)) {
          delete this.expandedTables[key];
        }
      });
    } else {
      // Expand - fetch schema if not already loaded
      this.expandedDatasources[db.id] = true;

      if (!this.datasourceSchemas[db.id]) {
        this.loadDatasourceSchema(db.id);
      }
    }
  }

  toggleSchema(dbId: string, schemaName: string): void {
    const key = `${dbId}.${schemaName}`;
    const isExpanded = this.expandedSchemas[key];

    if (isExpanded) {
      // Collapse - also collapse all child tables
      delete this.expandedSchemas[key];

      // Collapse all tables under this schema
      Object.keys(this.expandedTables).forEach(tableKey => {
        if (tableKey.startsWith(`${dbId}.${schemaName}.`)) {
          delete this.expandedTables[tableKey];
        }
      });
    } else {
      // Expand
      this.expandedSchemas[key] = true;
    }
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    const key = `${dbId}.${schemaName}.${tableName}`;
    this.expandedTables[key] = !this.expandedTables[key];
  }

  isTableExpanded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): boolean {
    const key = `${dbId}.${schemaName}.${tableName}`;
    return this.expandedTables[key] || false;
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
        label: 'Refresh Schema',
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
          this.expandedDatasources[dataset.datasourceId] = true;

          // Load schema for the selected database
          this.loadDatasourceSchema(dataset.datasourceId).then(() => {
            // Set the SQL query in editor
            const sqlQuery = dataset.sql || '-- Write your SQL query here';
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
