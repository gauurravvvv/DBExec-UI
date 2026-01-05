import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import {
  EDITOR_LOADING_CONFIG,
  MONACO_EDITOR_OPTIONS,
} from '../../config/sql-editor.config';
import { DatabaseSchema, QueryResult } from '../../helpers/dummy-data.helper';
import { SchemaTransformerHelper } from '../../helpers/schema-transformer.helper';
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../../models/query-tab.model';
import { MonacoIntelliSenseService } from '../../services copy/monaco-intellisense.service';
import { QueryService } from '../../services copy/query.service';
import { DatasetService } from '../../services/dataset.service';
import { SqlFormatterService } from '../../services/sql-formatter.service';
import { SqlValidatorService } from '../../services/sql-validator.service';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';
import { DATASET } from 'src/app/constants/routes';
import { MessageService } from 'primeng/api';
import {
  AddDatasetActions,
  SchemaLoadingStatus,
  selectSchemaData,
  selectSchemaStatus,
  selectIsSchemaStale,
  selectSchemaByKey,
  selectIsSchemaLoaded,
} from '../../store';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
})
export class AddDatasetComponent
  implements OnInit, OnDestroy, AfterViewInit, OnChanges
{
  // ViewChild for file input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Removed ViewChild as we now use dynamic containers per tab
  @Input() databaseId?: number;
  @Input() orgId?: number;
  @Input() initialQuery?: string;

  editor: any;
  isLoadingEditor = true;
  isLoadingSchema = false;
  isExecutingQuery = false;
  monacoLoadFailed = false;
  queryResult: QueryResult | null = null;
  databases: DatabaseSchema[] = [];
  currentQuery = '';

  // Theme monitoring
  private themeObserver: MutationObserver | null = null;
  private currentTheme: string = 'vs-dark';

  // Database sidebar
  showDatabaseSidebar = true;
  expandedDatabases: { [key: string]: boolean } = {};
  expandedSchemas: { [key: string]: boolean } = {};
  expandedTables: { [key: string]: boolean } = {};
  schemaSearchText = '';
  selectedDatabase: string = '';
  selectedSchema: string = '';

  // Context Menu
  showContextMenu = false;
  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];
  contextMenuDatabase: any | null = null;

  // Save as Dataset Dialog
  showDatasetDialog = false;

  // Change Confirmation Dialog
  showChangeConfirmDialog = false;
  pendingDatabaseChange: any = null;
  pendingOrgChange: any = null;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;

  // Organisation Management
  organisations: any[] = [];
  selectedOrg: any = {};
  userRole: string = '';
  showOrganisationDropdown: boolean = false;
  availableDatabases: any[] = [];
  selectedDatabaseObj: any = null;

  // Database Schema Management
  databaseSchemas: { [dbId: string]: DatabaseSchema } = {};
  loadingDatabases: { [dbId: string]: boolean } = {};
  isLoadingDatabases: boolean = false;

  // NgRx Store Observables for schema caching
  private schemaDataObservables: Map<string, Observable<any | null>> =
    new Map();
  private schemaStatusObservables: Map<
    string,
    Observable<SchemaLoadingStatus>
  > = new Map();

  get filteredAvailableDatabases(): any[] {
    if (!this.schemaSearchText) {
      return this.availableDatabases;
    }
    const search = this.schemaSearchText.toLowerCase();
    return this.availableDatabases.filter(db =>
      db.name.toLowerCase().includes(search)
    );
  }

  get isQueryEmpty(): boolean {
    const query = this.currentQuery.trim();
    const defaultQuery = '-- Write your SQL query here';
    return !query || query === defaultQuery;
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
        table.name.toLowerCase().includes(search)
      );
      return schemaNameMatches || hasMatchingTable;
    });
  }

  constructor(
    private queryService: QueryService,
    private databaseService: DatabaseService,
    private monacoIntelliSenseService: MonacoIntelliSenseService,
    private sqlFormatterService: SqlFormatterService,
    private sqlValidatorService: SqlValidatorService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private router: Router,
    private messageService: MessageService,
    private store: Store
  ) {
    this.userRole = this.globalService.getTokenDetails('role') || '';
    this.showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  }

  ngOnInit(): void {
    // Load organisations if super admin
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
      this.initializeComponent();
    }
  }

  private initializeComponent(): void {
    // Setup theme monitoring
    this.setupThemeObserver();

    // Close context menus on click outside
    document.addEventListener('click', this.closeContextMenu.bind(this));
  }

  loadOrganisations(): void {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadDatabases();
          this.initializeComponent();
        }
      }
    });
  }

  onDatabaseChange(event: any): void {
    const selectedDb = event.value;
    if (!selectedDb || !selectedDb.id) return;

    // Check if editor has unsaved content
    const editorValue = this.editor ? this.editor.getValue().trim() : '';
    const hasContent = editorValue.length > 0;
    const defaultContent = '-- Write your SQL query here';
    const isDefaultContent = editorValue === defaultContent.trim();

    // Only show confirmation if there's actual user content (not empty and not default)
    if (hasContent && !isDefaultContent && this.selectedDatabaseObj) {
      // Show confirmation dialog
      this.pendingDatabaseChange = selectedDb;
      this.showChangeConfirmDialog = true;
      // Revert dropdown to current selection
      setTimeout(() => {
        this.selectedDatabaseObj = this.selectedDatabaseObj;
      }, 0);
      return;
    }

    this.proceedWithDatabaseChange(selectedDb);
  }

  private proceedWithDatabaseChange(selectedDb: any): void {
    // Reset editor and results
    this.resetEditor();

    // Expand the database in the tree
    this.expandedDatabases[selectedDb.id] = true;

    // Always load schema from API (don't use cached data)
    this.loadDatabaseSchema(selectedDb.id).then(() => {
      // Initialize editor if not already done
      if (!this.editor) {
        setTimeout(() => this.loadMonacoEditor(), 100);
      }
    });
  }

  loadDatabases(): void {
    if (!this.selectedOrg || !this.selectedOrg.id) return;

    this.isLoadingDatabases = true;
    this.selectedDatabaseObj = null;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService
      .listDatabase(params)
      .then(response => {
        this.isLoadingDatabases = false;
        if (this.globalService.handleSuccessService(response, false)) {
          this.availableDatabases = response.data || [];
        }
      })
      .catch(() => {
        this.isLoadingDatabases = false;
      });
  }

  refreshDatabases(): void {
    // Collapse all expanded databases
    this.expandedDatabases = {};
    this.expandedSchemas = {};
    this.expandedTables = {};

    // Clear all cached schema data
    this.databaseSchemas = {};
    this.loadingDatabases = {};

    // Clear the databases array for IntelliSense
    this.databases = [];

    // Reload the database list
    this.loadDatabases();
  }

  refreshSingleDatabase(dbId: number): void {
    if (!dbId || !this.selectedOrg?.id) return;

    const orgId = this.selectedOrg.id.toString();
    const dbIdStr = dbId.toString();

    // Dispatch refresh action to clear cache and reload
    this.store.dispatch(
      AddDatasetActions.refreshSchemaData({
        orgId,
        dbId: dbIdStr,
      })
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
    delete this.expandedDatabases[dbId];

    // Clear local cache
    delete this.databaseSchemas[dbId];
    delete this.loadingDatabases[dbId];

    // Remove from IntelliSense databases array
    this.databases = this.databases.filter(db => db.name !== dbId.toString());

    // Re-fetch schema for this database from API
    this.loadDatabaseSchemaFromAPI(dbId);
  }

  refreshSelectedDatabase(): void {
    if (!this.selectedDatabaseObj || !this.selectedDatabaseObj.id) return;
    this.refreshSingleDatabase(this.selectedDatabaseObj.id);
  }

  onOrgChange(event: any): void {
    const newOrg = event.value;

    // Check if editor has unsaved content
    const editorValue = this.editor ? this.editor.getValue().trim() : '';
    const hasContent = editorValue.length > 0;
    const defaultContent = '-- Write your SQL query here';
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
    this.selectedOrg = newOrg;
    this.orgId = this.selectedOrg.id;

    // Reset editor and results
    this.resetEditor();

    // Clear existing data
    this.availableDatabases = [];
    this.selectedDatabaseObj = null;
    this.databaseSchemas = {};
    this.expandedDatabases = {};

    // Reload databases for the new organisation
    this.loadDatabases();
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

    // Dispose formatter and validator
    this.sqlFormatterService.dispose();
    this.sqlValidatorService.dispose();

    // Cleanup theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    // Remove context menu listener
    document.removeEventListener('click', this.closeContextMenu.bind(this));
  }

  private loadMonacoEditor(): void {
    // Check if Monaco is already loaded
    if (typeof monaco !== 'undefined') {
      setTimeout(() => this.initMonaco(), 0);
      return;
    }

    // Check if loading failed during script load
    if (window.monacoLoading === false && typeof monaco === 'undefined') {
      this.isLoadingEditor = false;
      this.monacoLoadFailed = true;
      this.showMonacoLoadError();
      return;
    }

    let attempts = 0;
    const maxAttempts = EDITOR_LOADING_CONFIG.MAX_ATTEMPTS;
    const checkInterval = EDITOR_LOADING_CONFIG.CHECK_INTERVAL_MS;

    const checkMonaco = setInterval(() => {
      attempts++;

      if (typeof monaco !== 'undefined') {
        clearInterval(checkMonaco);
        this.initMonaco();
        return;
      }

      // Check if loading explicitly failed
      if (window.monacoLoading === false) {
        clearInterval(checkMonaco);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.showMonacoLoadError();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkMonaco);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.showMonacoLoadError();
      }
    }, checkInterval);

    // Extended timeout fallback - 20 seconds instead of 10
    setTimeout(() => {
      clearInterval(checkMonaco);
      if (typeof monaco === 'undefined') {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.showMonacoLoadError();
      }
    }, 20000);
  }

  private showMonacoLoadError(): void {}

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  private initMonaco(): void {
    if (!this.selectedDatabaseObj) {
      this.isLoadingEditor = false;
      return;
    }

    // Wait for the DOM to be ready
    setTimeout(() => {
      const container = document.getElementById('sql-editor-container');
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
          }
        );

        // Focus the editor
        this.editor.focus();

        // Register IntelliSense
        this.registerIntelliSenseProviders();

        // Register SQL Formatter
        this.sqlFormatterService.registerFormattingProvider();
        this.sqlFormatterService.registerContextMenuActions(this.editor);

        // Setup SQL Validator with real-time validation
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
          // Validate SQL with debouncing
          this.sqlValidatorService.validateDebounced(this.editor.getModel());
        });

        // Initial validation
        this.sqlValidatorService.validate(this.editor.getModel());

        // Add keyboard shortcuts via service
        this.monacoIntelliSenseService.registerKeyboardShortcuts(
          this.editor,
          () => this.executeQuery()
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

    // Register new providers and store disposables
    if (this.editor) {
      this.completionProviderDisposable =
        this.monacoIntelliSenseService.registerSQLCompletions(
          this.databases,
          this.editor
        );
      this.hoverProviderDisposable =
        this.monacoIntelliSenseService.registerHoverProvider(this.databases);
    }
  }

  private async loadDatabaseSchema(dbId: number): Promise<void> {
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
            this.loadDatabaseSchemaFromAPI(dbId).then(resolve).catch(reject);
          } else {
            // Check if data is stale
            this.store
              .select(selectIsSchemaStale(orgId, dbIdStr))
              .pipe(first())
              .subscribe(isStale => {
                if (isStale) {
                  // Data is stale, refresh from API
                  this.loadDatabaseSchemaFromAPI(dbId)
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
  private applyCachedSchemaData(dbId: number, schemaData: any): void {
    // Store schema data by database ID
    this.databaseSchemas[dbId] = schemaData;

    // Update databases array for IntelliSense
    this.databases = Object.values(this.databaseSchemas);

    // Re-register completions with new schema
    this.registerIntelliSenseProviders();

    this.loadingDatabases[dbId] = false;
  }

  /**
   * Load database schema from API and update store
   */
  private async loadDatabaseSchemaFromAPI(dbId: number): Promise<void> {
    if (!dbId || !this.selectedOrg?.id) return Promise.resolve();

    const orgId = this.selectedOrg.id.toString();
    const dbIdStr = dbId.toString();

    this.loadingDatabases[dbId] = true;

    // Dispatch loading action
    this.store.dispatch(
      AddDatasetActions.loadSchemaData({
        orgId,
        dbId: dbIdStr,
      })
    );

    return new Promise((resolve, reject) => {
      try {
        this.queryService
          .getDatabaseStructure(dbId, this.selectedOrg.id)
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
                  })
                );

                // Store schema data by database ID
                this.databaseSchemas[dbId] = schemaData[0];
              }

              // Update databases array for IntelliSense
              this.databases = Object.values(this.databaseSchemas);

              // Re-register completions with new schema
              this.registerIntelliSenseProviders();

              this.loadingDatabases[dbId] = false;
              resolve();
            },
            error: (error: any) => {
              // Dispatch failure action
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataFailure({
                  orgId,
                  dbId: dbIdStr,
                  error: error.message || 'Failed to load schema',
                })
              );

              this.loadingDatabases[dbId] = false;
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
          })
        );

        this.loadingDatabases[dbId] = false;
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
    this.executeQueryForDatabase(query);
  }

  /**
   * Execute selected SQL text from editor
   * @param selectedText The selected SQL text to execute
   */
  executeSelectedQuery(selectedText: string): void {
    this.executeQueryForDatabase(selectedText);
  }

  clearEditor(): void {
    if (this.editor) {
      this.editor.setValue('');
    }
  }

  exportCurrentScript(): void {
    if (!this.editor || !this.selectedDatabaseObj) return;

    const query = this.editor.getValue();
    const databaseName = this.selectedDatabaseObj.name || 'database';
    const fileName = `${databaseName}_script.sql`;

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
    const maxSizeInMB = 2;
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
    if (!this.selectedDatabaseObj) return;

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

    if (this.pendingDatabaseChange) {
      this.proceedWithDatabaseChange(this.pendingDatabaseChange);
      this.pendingDatabaseChange = null;
    }

    if (this.pendingOrgChange) {
      this.proceedWithOrgChange(this.pendingOrgChange);
      this.pendingOrgChange = null;
    }
  }

  onCancelChange(): void {
    this.showChangeConfirmDialog = false;
    this.pendingDatabaseChange = null;
    this.pendingOrgChange = null;
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

  private executeQueryForDatabase(query: string): void {
    if (!query.trim()) {
      return;
    }

    if (!this.selectedDatabaseObj?.id || !this.selectedOrg?.id) {
      return;
    }

    this.isExecutingQuery = true;
    this.queryResult = null;

    const startTime = Date.now();

    this.queryService
      .executeQuery({
        orgId: this.selectedOrg.id,
        databaseId: this.selectedDatabaseObj.id,
        query: query,
      })
      .subscribe({
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
            (Array.isArray(data) && data.length > 0
              ? Object.keys(data[0])
              : []);
          const rowCount =
            dataObj.rowCount !== undefined
              ? dataObj.rowCount
              : Array.isArray(data)
              ? data.length
              : 0;

          this.queryResult = {
            columns: columns,
            rows: Array.isArray(data) ? data : [],
            rowCount: rowCount,
            executionTime: executionTime,
            query: dataObj.query || response.query,
          };

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
      if (!this.selectedDatabaseObj) return;

      // Get the SQL query
      const sql = this.editor?.getValue() || this.currentQuery;

      const payload = {
        name: formData.name,
        description: formData.description,
        organisation: this.selectedOrg?.id,
        database: this.selectedDatabaseObj.id,
        sql,
      };

      this.datasetService.addDataset(payload).then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          // Navigate to dataset list
          this.router.navigate([DATASET.LIST]);
          // Dataset saved successfully
          // Now proceed with pending change if any
          if (this.pendingDatabaseChange) {
            this.proceedWithDatabaseChange(this.pendingDatabaseChange);
            this.pendingDatabaseChange = null;
          }
          if (this.pendingOrgChange) {
            this.proceedWithOrgChange(this.pendingOrgChange);
            this.pendingOrgChange = null;
          }
        }
      });
    }
  }

  toggleDatabaseSidebar(): void {
    this.showDatabaseSidebar = !this.showDatabaseSidebar;
    // Trigger Monaco editor resize after sidebar animation
    setTimeout(() => {
      if (this.editor) {
        this.editor.layout();
      }
    }, 300);
  }

  toggleDatabase(db: any): void {
    const isExpanded = this.expandedDatabases[db.id];

    if (isExpanded) {
      // Collapse - also collapse all child schemas and tables
      this.expandedDatabases[db.id] = false;

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
      this.expandedDatabases[db.id] = true;

      if (!this.databaseSchemas[db.id]) {
        this.loadDatabaseSchema(db.id);
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
    tableName: string
  ): boolean {
    const key = `${dbId}.${schemaName}.${tableName}`;
    return this.expandedTables[key] || false;
  }

  insertColumnName(
    dbId: string,
    schemaName: string,
    tableName: string,
    columnName: string
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

  onDatabaseContextMenu(event: MouseEvent, database: any): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatabase = database;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    this.contextMenuItems = [
      {
        label: 'Refresh Schema',
        icon: 'pi pi-refresh',
        command: () => this.refreshDatabaseFromContext(),
      },
    ];

    this.showContextMenu = true;
  }

  closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuDatabase = null;
  }

  refreshDatabaseFromContext(): void {
    if (!this.contextMenuDatabase) return;

    // Refresh schema for this specific database
    this.refreshSingleDatabase(this.contextMenuDatabase.id);

    this.closeContextMenu();
  }
}
