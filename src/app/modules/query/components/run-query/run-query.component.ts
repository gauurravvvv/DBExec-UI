import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from '../../../database/services/database.service';
import { OrganisationService } from '../../../organisation/services/organisation.service';
import {
  EDITOR_LOADING_CONFIG,
  MONACO_EDITOR_OPTIONS
} from '../../config/sql-editor.config';
import { DatabaseSchemaHelper } from '../../helpers/database-schema.helper';
import {
  DatabaseSchema,
  QueryResult
} from '../../helpers/dummy-data.helper';
import { EditorCustomizationHelper } from '../../helpers/editor-customization.helper';
import { SchemaTransformerHelper } from '../../helpers/schema-transformer.helper';
import { TabManagementHelper } from '../../helpers/tab-management.helper';
import { ContextMenuItem, ContextMenuPosition, QueryTab } from '../../models/query-tab.model';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-run-query',
  templateUrl: './run-query.component.html',
  styleUrls: ['./run-query.component.scss'],
})
export class RunQueryComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
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

  // Tab Management
  queryTabs: QueryTab[] = [];
  activeTabId: string | null = null;
  tabCounter = 0;

  // Context Menu
  showContextMenu = false;
  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];
  contextMenuDatabase: any | null = null;
  
  // Tab Context Menu
  showTabContextMenu = false;
  tabContextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  tabContextMenuItems: ContextMenuItem[] = [];
  contextMenuTabId: string | null = null;
  
  // Tab Editing
  editingTabId: string | null = null;
  editingTabTitle: string = '';
  editingTabError: boolean = false;
  @ViewChild('tabTitleInput') tabTitleInput!: ElementRef;

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

  get filteredDatabases(): DatabaseSchema[] {
    return DatabaseSchemaHelper.filterDatabases(
      this.databases,
      this.schemaSearchText,
      this.expandedDatabases,
      this.expandedSchemas
    );
  }

  get filteredAvailableDatabases(): any[] {
    if (!this.schemaSearchText) {
      return this.availableDatabases;
    }
    const search = this.schemaSearchText.toLowerCase();
    return this.availableDatabases.filter(db => 
      db.name.toLowerCase().includes(search)
    );
  }

  constructor(
    private queryService: QueryService,
    private databaseService: DatabaseService,
    private monacoIntelliSenseService: MonacoIntelliSenseService,
    private organisationService: OrganisationService,
    private globalService: GlobalService
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
        id: this.globalService.getTokenDetails('organisationId')
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
    document.addEventListener('click', this.closeTabContextMenu.bind(this));
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

  loadDatabases(): void {
    if (!this.selectedOrg || !this.selectedOrg.id) return;

    this.isLoadingDatabases = true;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      this.isLoadingDatabases = false;
      if (this.globalService.handleSuccessService(response, false)) {
        this.availableDatabases = response.data || [];
      }
    }).catch(() => {
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
    if (!dbId) return;

    // Clear cached schema for this specific database
    delete this.databaseSchemas[dbId];
    delete this.loadingDatabases[dbId];
    
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
    
    // Remove from IntelliSense databases array
    this.databases = this.databases.filter(db => db.name !== dbId.toString());
    
    // Re-fetch schema for this database
    this.loadDatabaseSchema(dbId);
  }

  onOrgChange(event: any): void {
    this.selectedOrg = event.value;
    this.orgId = this.selectedOrg.id;
    
    // Clear existing data
    this.availableDatabases = [];
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
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
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
      attributeFilter: ['class']
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
    if (changes['initialQuery'] && this.editor && changes['initialQuery'].currentValue) {
      this.editor.setValue(changes['initialQuery'].currentValue);
    }
  }

  ngOnDestroy(): void {
    // Dispose all editors
    this.queryTabs.forEach(tab => {
      if (tab.editor) {
        tab.editor.dispose();
      }
    });

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
    
    // Cleanup theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    // Remove context menu listener
    document.removeEventListener('click', this.closeContextMenu.bind(this));
    document.removeEventListener('click', this.closeTabContextMenu.bind(this));
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

  private showMonacoLoadError(): void {
  }

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  private initMonaco(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) {
      this.isLoadingEditor = false;
      return;
    }

    // Wait for the DOM to be ready
    setTimeout(() => {
      const container = document.getElementById('editor-' + activeTab.id);
      if (!container) {
        this.isLoadingEditor = false;
        return;
      }

      try {
        // Dispose previous editor if exists
        if (activeTab.editor) {
          activeTab.editor.dispose();
        }

        // Create Monaco Editor instance for active tab
        activeTab.editor = monaco.editor.create(container, {
          ...MONACO_EDITOR_OPTIONS,
          value: this.initialQuery || activeTab.query,
          theme: this.currentTheme
        });

        // Keep reference for backward compatibility
        this.editor = activeTab.editor;

        // Setup keyboard handlers
        EditorCustomizationHelper.setupKeyboardHandlers(activeTab.editor);

        // Focus the editor
        EditorCustomizationHelper.focusEditor(activeTab.editor);

        // Setup content change listener
        EditorCustomizationHelper.setupContentChangeListener(activeTab.editor, (value) => {
          activeTab.query = value;
          this.currentQuery = value; // Keep for backward compatibility
        });

        // Register IntelliSense only once
        this.registerIntelliSenseProviders();

        // Add keyboard shortcuts via service
        this.monacoIntelliSenseService.registerKeyboardShortcuts(activeTab.editor, () => this.executeQuery());

        // Customize context menu for SQL editor
        EditorCustomizationHelper.customizeEditorContextMenu(
          activeTab.editor,
          () => this.executeCompleteQuery(),
          (selectedText: string) => this.executeSelectedQuery(selectedText)
        );

        this.isLoadingEditor = false;
      } catch (error) {
        this.isLoadingEditor = false;
      }
    }, 100);
  }

  /**
   * Register IntelliSense providers only once to avoid duplicates
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
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.editor) { 
      this.completionProviderDisposable = this.monacoIntelliSenseService.registerSQLCompletions(this.databases, activeTab.editor);
      this.hoverProviderDisposable = this.monacoIntelliSenseService.registerHoverProvider(this.databases); 
    }
  }

  private async loadDatabaseSchema(dbId: number): Promise<void> {
    if (!dbId || !this.selectedOrg?.id) return Promise.resolve();

    this.loadingDatabases[dbId] = true;

    return new Promise((resolve, reject) => {
      try {
        this.queryService.getDatabaseStructure(dbId, this.selectedOrg.id).subscribe({
          next: (response: any) => {
            const schemaData = SchemaTransformerHelper.transformSchemaResponse(response);
            
            // Store schema data by database ID
            if (schemaData.length > 0) {
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
            this.loadingDatabases[dbId] = false;
            reject(error);
          }
        });
      } catch (error) {
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
    const activeTab = this.getActiveTab();
    if (!activeTab || !activeTab.editor) return;

    const selection = activeTab.editor.getSelection();
    const hasSelection = selection && !selection.isEmpty();
    
    if (hasSelection) {
      // Execute selected text
      const selectedText = activeTab.editor.getModel().getValueInRange(selection);
      if (selectedText.trim()) {
        this.executeSelectedQuery(selectedText);
        return;
      }
    }
    
    // No selection, execute current statement at cursor
    const currentStatement = EditorCustomizationHelper.getCurrentStatement(activeTab.editor);
    if (currentStatement) {
      this.executeSelectedQuery(currentStatement);
    } else {
      // Fallback to complete query
      this.executeCompleteQuery();
    }
  }

  /**
   * Execute complete SQL query from editor
   */
  executeCompleteQuery(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    this.executeQueryForTab(activeTab);
  }

  /**
   * Execute selected SQL text from editor
   * @param selectedText The selected SQL text to execute
   */
  executeSelectedQuery(selectedText: string): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;
    
    // Execute the selected query directly
    this.executeQueryForTab(activeTab, selectedText);
  }


  clearEditor(): void {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.editor) {
      activeTab.editor.setValue('');
    }
  }

  saveCurrentScript(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    // TODO: Implement save to database
  }

  exportCurrentScript(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    const query = activeTab.editor?.getValue() || activeTab.query;
    const databaseName = activeTab.databaseName || 'database';
    const scriptName = activeTab.title.replace(/\s+/g, '_');
    const fileName = `${databaseName}_${scriptName}.txt`;
    
    const blob = new Blob([query], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  saveAsDataset(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    // TODO: Implement save as dataset logic
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
    const key = DatabaseSchemaHelper.buildSchemaKey(dbId, schemaName);
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
    const key = DatabaseSchemaHelper.buildTableKey(dbId, schemaName, tableName);
    this.expandedTables[key] = !this.expandedTables[key];
  }

  isTableExpanded(dbId: string, schemaName: string, tableName: string): boolean {
    const key = DatabaseSchemaHelper.buildTableKey(dbId, schemaName, tableName);
    return this.expandedTables[key] || false;
  }

  insertColumnName(dbId: string, schemaName: string, tableName: string, columnName: string): void {
    const activeTab = this.getActiveTab();
    if (!activeTab || !activeTab.editor) return;
    
    const selection = activeTab.editor.getSelection();
    const text = DatabaseSchemaHelper.generateColumnReference(schemaName, tableName, columnName);
    
    activeTab.editor.executeEdits('insert-column', [{
      range: selection,
      text: text,
      forceMoveMarkers: true
    }]);
    
    activeTab.editor.focus();
  }

  getDatabaseTooltip(tab: QueryTab): string {
    if (!tab.databaseId) {
      return 'No database connected';
    }
    
    const database = this.availableDatabases.find(db => db.id === tab.databaseId);
    if (!database) {
      return `Database: ${tab.databaseName}`;
    }
    
    const lines = [];
    lines.push(`Database: ${database.name}`);
    if (database.config) {
      lines.push(`Username: ${database.config.username}`);
      lines.push(`Host: ${database.config.hostname}`);
      lines.push(`Port: ${database.config.port}`);
    }
    
    return lines.join('\n');
  }


  createNewTab(title: string, databaseId?: number, databaseName: string = 'database'): QueryTab | null {
    // Check maximum tab limit
    if (TabManagementHelper.isMaxTabsReached(this.queryTabs.length)) {
      return null;
    }

    // Check for duplicate name in same database
    let finalTitle = title;
    let counter = 1;
    while (this.isDuplicateTabName(finalTitle, databaseName)) {
      finalTitle = `${title} (${counter})`;
      counter++;
    }

    const newTab = TabManagementHelper.createQueryTab(
      ++this.tabCounter,
      finalTitle,
      databaseId,
      databaseName
    );

    // Deactivate all other tabs
    TabManagementHelper.deactivateAllTabs(this.queryTabs);

    // Add new tab
    this.queryTabs.push(newTab);
    this.activeTabId = newTab.id;

    return newTab;
  }

  isDuplicateTabName(title: string, databaseName: string, excludeTabId?: string): boolean {
    return this.queryTabs.some(tab => 
      tab.title === title && 
      tab.databaseName === databaseName && 
      tab.id !== excludeTabId
    );
  }

  switchTab(tabId: string): void {
    const previousTab = this.getActiveTab();
    
    // Save current editor content to the previous tab before switching
    if (previousTab && previousTab.editor) {
      previousTab.query = previousTab.editor.getValue();
    }
    
    this.queryTabs.forEach(tab => {
      tab.isActive = tab.id === tabId;
    });
    this.activeTabId = tabId;

    // Dispose previous editor's DOM
    if (previousTab) {
      TabManagementHelper.disposeTabEditor(previousTab);
    }

    // Re-create editor for active tab after a short delay
    setTimeout(() => {
      const activeTab = this.getActiveTab();
      if (activeTab) {
        this.initMonacoForTab(activeTab);
      }
    }, 100);
  }

  closeTab(tabId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const index = this.queryTabs.findIndex(tab => tab.id === tabId);
    if (index === -1) return;

    // Dispose editor if exists
    const tab = this.queryTabs[index];
    TabManagementHelper.disposeTabEditor(tab);

    // Remove tab
    this.queryTabs.splice(index, 1);

    // If closing active tab, activate another
    if (tabId === this.activeTabId && this.queryTabs.length > 0) {
      const newActiveIndex = Math.min(index, this.queryTabs.length - 1);
      this.switchTab(this.queryTabs[newActiveIndex].id);
    } else if (this.queryTabs.length === 0) {
      // No tabs left, clear active tab ID
      this.activeTabId = null;
    }

    this.activeTabId = this.queryTabs.find(t => t.isActive)?.id || null;
  }

  getActiveTab(): QueryTab | undefined {
    return this.queryTabs.find(tab => tab.isActive);
  }

  isAnyQueryExecuting(): boolean {
    return this.queryTabs.some(tab => tab.isExecuting);
  }

  // Tab Context Menu Methods

  onTabContextMenu(event: MouseEvent, tabId: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuTabId = tabId;
    this.tabContextMenuPosition = { x: event.clientX, y: event.clientY };
    
    const tabIndex = this.queryTabs.findIndex(tab => tab.id === tabId);
    
    this.tabContextMenuItems = TabManagementHelper.getTabContextMenuItems(
      tabIndex,
      this.queryTabs.length,
      () => this.renameTab(),
      () => this.closeTabFromContext(),
      () => this.closeOtherTabs(),
      () => this.closeTabsToRight(),
      () => this.closeTabsToLeft()
    );

    this.showTabContextMenu = true;
  }

  closeTabContextMenu(): void {
    this.showTabContextMenu = false;
    this.contextMenuTabId = null;
  }

  renameTab(): void {
    if (!this.contextMenuTabId) return;
    
    const tab = this.queryTabs.find(t => t.id === this.contextMenuTabId);
    if (!tab) return;

    this.editingTabId = tab.id;
    this.editingTabTitle = tab.title;
    this.editingTabError = false;
    
    this.closeTabContextMenu();
    
    // Focus input after view update
    setTimeout(() => {
      if (this.tabTitleInput && this.tabTitleInput.nativeElement) {
        this.tabTitleInput.nativeElement.focus();
        this.tabTitleInput.nativeElement.select();
      }
    }, 0);
  }

  finishRenameTab(): void {
    if (!this.editingTabId) return;
    
    const tab = this.queryTabs.find(t => t.id === this.editingTabId);
    if (tab && this.editingTabTitle.trim()) {
      const newTitle = this.editingTabTitle.trim();
      
      // Check if name already exists for same database (excluding current tab)
      if (this.isDuplicateTabName(newTitle, tab.databaseName, tab.id)) {
        // Set error state and keep editing mode
        this.editingTabError = true;
        // Refocus the input
        setTimeout(() => {
          if (this.tabTitleInput && this.tabTitleInput.nativeElement) {
            this.tabTitleInput.nativeElement.focus();
          }
        }, 0);
        return;
      }
      
      tab.title = newTitle;
    }
    
    this.editingTabId = null;
    this.editingTabTitle = '';
    this.editingTabError = false;
  }

  cancelRenameTab(): void {
    this.editingTabId = null;
    this.editingTabTitle = '';
    this.editingTabError = false;
  }

  closeTabFromContext(): void {
    if (!this.contextMenuTabId) return;
    this.closeTab(this.contextMenuTabId);
    this.closeTabContextMenu();
  }

  closeOtherTabs(): void {
    if (!this.contextMenuTabId) return;
    
    const tabsToClose = TabManagementHelper.getOtherTabs(this.queryTabs, this.contextMenuTabId);
    
    // Dispose and remove all other tabs
    TabManagementHelper.disposeTabEditors(tabsToClose);
    
    // Keep only the context menu tab
    const keepTab = this.queryTabs.find(tab => tab.id === this.contextMenuTabId);
    if (keepTab) {
      this.queryTabs = [keepTab];
      keepTab.isActive = true;
      this.activeTabId = keepTab.id;
      
      // Re-initialize editor for the kept tab
      setTimeout(() => {
        if (keepTab) {
          this.initMonacoForTab(keepTab);
        }
      }, 100);
    }
    
    this.closeTabContextMenu();
  }

  closeTabsToRight(): void {
    if (!this.contextMenuTabId) return;
    
    const tabIndex = this.queryTabs.findIndex(tab => tab.id === this.contextMenuTabId);
    if (tabIndex === -1 || tabIndex === this.queryTabs.length - 1) return;
    
    // Get tabs to the right
    const tabsToClose = TabManagementHelper.getTabsToRight(this.queryTabs, tabIndex);
    
    // Dispose editors
    TabManagementHelper.disposeTabEditors(tabsToClose);
    
    // Remove tabs to the right
    this.queryTabs = this.queryTabs.slice(0, tabIndex + 1);
    
    // If active tab was closed, activate the context menu tab
    if (!this.queryTabs.find(tab => tab.id === this.activeTabId)) {
      const contextTab = this.queryTabs.find(tab => tab.id === this.contextMenuTabId);
      if (contextTab) {
        this.switchTab(contextTab.id);
      }
    }
    
    this.closeTabContextMenu();
  }

  closeTabsToLeft(): void {
    if (!this.contextMenuTabId) return;
    
    const tabIndex = this.queryTabs.findIndex(tab => tab.id === this.contextMenuTabId);
    if (tabIndex === -1 || tabIndex === 0) return;
    
    // Get tabs to the left
    const tabsToClose = TabManagementHelper.getTabsToLeft(this.queryTabs, tabIndex);
    
    // Dispose editors
    TabManagementHelper.disposeTabEditors(tabsToClose);
    
    // Remove tabs to the left
    this.queryTabs = this.queryTabs.slice(tabIndex);
    
    // If active tab was closed, activate the context menu tab
    if (!this.queryTabs.find(tab => tab.id === this.activeTabId)) {
      const contextTab = this.queryTabs.find(tab => tab.id === this.contextMenuTabId);
      if (contextTab) {
        this.switchTab(contextTab.id);
      }
    }
    
    this.closeTabContextMenu();
  }

  onDatabaseContextMenu(event: MouseEvent, database: any): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatabase = database;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    
    this.contextMenuItems = TabManagementHelper.getDatabaseContextMenuItems(
      () => this.createNewScriptFromContext(),
      () => this.refreshDatabaseFromContext(),
      TabManagementHelper.isMaxTabsReached(this.queryTabs.length)
    );

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

  createNewScriptFromContext(): void {
    if (!this.contextMenuDatabase) return;

    // Check maximum tab limit - silently return if limit reached
    if (TabManagementHelper.isMaxTabsReached(this.queryTabs.length)) {
      this.closeContextMenu();
      return;
    }

    // Store reference to database before closing context menu
    const database = this.contextMenuDatabase;

    // Check if database schema is already loaded
    const schemaLoaded = this.databaseSchemas[database.id];
    
    this.closeContextMenu();

    if (!schemaLoaded) {
      // Schema not loaded, fetch it first
      this.loadDatabaseSchema(database.id).then(() => {
        this.createScriptTab(database);
      })
    } else {
      // Schema already loaded, create tab immediately
      this.createScriptTab(database);
    }
  }

  private createScriptTab(database: any): void {
    // Save current editor content before creating new tab
    const currentTab = this.getActiveTab();
    if (currentTab && currentTab.editor) {
      currentTab.query = currentTab.editor.getValue();
    }

    const newTab = this.createNewTab(
      `Script ${this.tabCounter + 1}`,
      database.id,
      database.name
    );

    // Initialize editor for new tab after a short delay if created
    if (newTab) {
      setTimeout(() => {
        this.initMonacoForTab(newTab);
      }, 100);
    }
  }

  private initMonacoForTab(tab: QueryTab): void {
    if (typeof monaco === 'undefined') return;

    // Get the tab-specific container
    const container = document.getElementById('editor-' + tab.id);
    if (!container) {
      return;
    }

    try {
      // Dispose previous editor if exists
      if (tab.editor) {
        tab.editor.dispose();
        tab.editor = null as any;
      }

      // Clear the container completely before creating new editor
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      // Create Monaco Editor instance for this tab
      tab.editor = monaco.editor.create(container, {
        ...MONACO_EDITOR_OPTIONS,
        value: tab.query,
        theme: this.currentTheme
      });

      // Keep reference for backward compatibility
      this.editor = tab.editor;

      // Setup keyboard handlers
      EditorCustomizationHelper.setupKeyboardHandlers(tab.editor);

      // Focus the editor
      EditorCustomizationHelper.focusEditor(tab.editor);

      // Setup content change listener
      EditorCustomizationHelper.setupContentChangeListener(tab.editor, (value) => {
        tab.query = value;
      });

      // Register IntelliSense providers (only once globally)
      this.registerIntelliSenseProviders();

      // Register keyboard shortcuts
      this.monacoIntelliSenseService.registerKeyboardShortcuts(tab.editor, () => this.executeQueryForTab(tab));

      // Customize context menu for SQL editor
      EditorCustomizationHelper.customizeEditorContextMenu(
        tab.editor,
        () => this.executeCompleteQuery(),
        (selectedText: string) => this.executeSelectedQuery(selectedText)
      );

    } catch (error) {
      console.error(`Error initializing Monaco Editor for tab ${tab.id}:`, error);
    }
  }

  private executeQueryForTab(tab: QueryTab, customQuery?: string): void {
    const query = customQuery || tab.editor?.getValue() || tab.query;
    
    if (!query.trim()) {
      return;
    }

    if (!tab.databaseId || !this.selectedOrg?.id) {
      return;
    }

    tab.isExecuting = true;
    tab.result = null;

    const startTime = Date.now();

    this.queryService.executeQuery({
      orgId: this.selectedOrg.id,
      databaseId: tab.databaseId,
      query: query
    }).subscribe({
      next: (response: any) => {
        // Check if response indicates an error (status: false)
        if (response.status === false) {
          const executionTime = `${Date.now() - startTime}ms`;
          tab.result = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: executionTime,
            error: response.message || 'Query execution failed'
          };
          tab.isExecuting = false;
          return;
        }
        
        // Handle string-based response (e.g., "Query executed successfully")
        if (typeof response === 'string') {
          tab.result = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: `${Date.now() - startTime}ms`,
            message: response
          };
          tab.isExecuting = false;
          return;
        }

        // Extract the actual data object from response
        const dataObj = response.data || response;

        // Extract execution time - check both response.data and response levels
        let executionTime = dataObj.executionTime || response.executionTime;
        
        if (executionTime && typeof executionTime === 'string') {
          // Already in "8ms" format, use as is
          executionTime = executionTime;
        } else if (executionTime && typeof executionTime === 'number') {
          // Convert number to "Xms" format
          executionTime = `${executionTime}ms`;
        } else {
          // Fallback to client-side calculation
          const calculatedTime = Date.now() - startTime;
          executionTime = `${calculatedTime}ms`;
        }

        // Extract columns and rows from API response
        // Data could be in dataObj.data (nested) or dataObj itself
        const data = dataObj.data || dataObj.rows || [];
        const columns = dataObj.columns || (Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : []);
        const rowCount = dataObj.rowCount !== undefined ? dataObj.rowCount : (Array.isArray(data) ? data.length : 0);

        tab.result = {
          columns: columns,
          rows: Array.isArray(data) ? data : [],
          rowCount: rowCount,
          executionTime: executionTime,
          query: dataObj.query || response.query
        };

        tab.isExecuting = false;
      },
      error: (error: any) => {
        const executionTime = `${Date.now() - startTime}ms`;
        
        // Extract error message from different possible locations
        let errorMessage = 'Query execution failed';
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }
        
        tab.result = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: executionTime,
          error: errorMessage
        };

        tab.isExecuting = false;
      }
    });
  }
}
