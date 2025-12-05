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
import { DatabaseService } from '../../../database/services/database.service';
import {
  EDITOR_LOADING_CONFIG,
  MONACO_EDITOR_OPTIONS
} from '../../config/sql-editor.config';
import {
  DatabaseSchema,
  DummyDataHelper,
  QueryResult
} from '../../helpers/dummy-data.helper';
import { SchemaTransformerHelper } from '../../helpers/schema-transformer.helper';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import { QueryTab, ContextMenuItem, ContextMenuPosition } from '../../models/query-tab.model';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-run-query',
  templateUrl: './run-query.component.html',
  styleUrls: ['./run-query.component.scss'],
})
export class RunQueryComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @ViewChild('editorContainer', { static: false }) editorContainer!: ElementRef;
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
  contextMenuDatabase: string | null = null;
  
  // Tab Context Menu
  showTabContextMenu = false;
  tabContextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };
  tabContextMenuItems: ContextMenuItem[] = [];
  contextMenuTabId: string | null = null;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;

  get filteredDatabases(): DatabaseSchema[] {
    if (!this.databases || this.databases.length === 0) {
      return [];
    }
    if (!this.schemaSearchText.trim()) {
      return this.databases;
    }
    const search = this.schemaSearchText.toLowerCase();
    const filtered = this.databases.map(db => ({
      ...db,
      schemas: db.schemas.map(schema => ({
        ...schema,
        tables: schema.tables.filter(table => 
          table.name.toLowerCase().includes(search) ||
          table.columns.some(col => col.name.toLowerCase().includes(search))
        )
      })).filter(schema => schema.tables.length > 0)
    })).filter(db => db.schemas.length > 0);

    // Auto-expand databases and schemas that have matching results
    filtered.forEach(db => {
      this.expandedDatabases[db.name] = true;
      db.schemas.forEach(schema => {
        this.expandedSchemas[`${db.name}.${schema.name}`] = true;
      });
    });

    return filtered;
  }

  constructor(
    private queryService: QueryService,
    private databaseService: DatabaseService,
    private monacoIntelliSenseService: MonacoIntelliSenseService
  ) {}

  ngOnInit(): void {
    // Load database schema for IntelliSense
    if (this.databaseId && this.orgId) {
      this.loadDatabaseSchema();
    } else {
      // Load dummy schema for testing/demo
      this.loadDummySchema();
    }
    
    // Setup theme monitoring
    this.setupThemeObserver();
    
    // Load dummy results for testing
    this.loadDummyResults();

    // Close context menu on click outside
    document.addEventListener('click', this.closeContextMenu.bind(this));
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

    // Reload schema if database changes
    if (changes['databaseId'] && this.databaseId && this.orgId) {
      this.loadDatabaseSchema();
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
      
      // Log every 20 attempts (every second) to avoid console spam
      if (attempts % 20 === 0) {
      }

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
    if (!this.editorContainer || !this.editorContainer.nativeElement) {
      this.isLoadingEditor = false;
      // Retry after a short delay
      setTimeout(() => {
        if (this.editorContainer && this.editorContainer.nativeElement) {
          this.isLoadingEditor = true;
          this.initMonaco();
        }
      }, 100);
      return;
    }

    try {
      const activeTab = this.getActiveTab();
      if (!activeTab) return;

      // Dispose previous editor if exists
      if (activeTab.editor) {
        activeTab.editor.dispose();
      }

      // Create Monaco Editor instance for active tab
      activeTab.editor = monaco.editor.create(this.editorContainer.nativeElement, {
        ...MONACO_EDITOR_OPTIONS,
        value: this.initialQuery || activeTab.query,
        theme: this.currentTheme
      });

      // Keep reference for backward compatibility
      this.editor = activeTab.editor;

      // Prevent arrow keys from moving cursor when suggestions are visible
      activeTab.editor.onKeyDown((e: any) => {
        const suggestWidget = (activeTab.editor as any)._contentWidgets['editor.widget.suggestWidget'];
        const isSuggestWidgetVisible = suggestWidget && suggestWidget.widget && suggestWidget.widget._isVisible;
        
        // If suggestions are visible and arrow keys are pressed, let Monaco handle it
        if (isSuggestWidgetVisible && (e.keyCode === monaco.KeyCode.UpArrow || e.keyCode === monaco.KeyCode.DownArrow)) {
          // Monaco will handle navigation, do nothing
          return;
        }
      });

      // Focus the editor to ensure keyboard events work
      setTimeout(() => {
        if (activeTab.editor) {
          activeTab.editor.focus();
        }
      }, 100);

      // Listen to content changes
      activeTab.editor.onDidChangeModelContent(() => {
        activeTab.query = activeTab.editor.getValue();
        this.currentQuery = activeTab.query; // Keep for backward compatibility
      });

      // Register IntelliSense only once
      this.registerIntelliSenseProviders();

      // Add keyboard shortcuts via service
      this.monacoIntelliSenseService.registerKeyboardShortcuts(activeTab.editor, () => this.executeQuery());

      this.isLoadingEditor = false;
    } catch (error) {
      this.isLoadingEditor = false;
    }
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

  private async loadDatabaseSchema(): Promise<void> {
    if (!this.databaseId || !this.orgId) return;

    try {
      // Use the getDatabaseStructure method from QueryService
      this.queryService.getDatabaseStructure(this.databaseId, this.orgId).subscribe({
        next: (response: any) => {
          this.databases = SchemaTransformerHelper.transformSchemaResponse(response);
          
          // Re-register completions with new schema
          this.registerIntelliSenseProviders();
        },
        error: (error: any) => {
        }
      });
    } catch (error) {
    }
  }



  executeQuery(): void {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    this.executeQueryForTab(activeTab);
  }

  formatQuery(): void {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.editor) {
      activeTab.editor.getAction('editor.action.formatDocument').run();
    }
  }

  clearEditor(): void {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.editor) {
      activeTab.editor.setValue('');
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

  toggleDatabase(dbName: string): void {
    this.expandedDatabases[dbName] = !this.expandedDatabases[dbName];
  }

  toggleSchema(dbName: string, schemaName: string): void {
    // Ensure parent database is expanded
    this.expandedDatabases[dbName] = true;
    
    const key = `${dbName}.${schemaName}`;
    this.expandedSchemas[key] = !this.expandedSchemas[key];
  }

  toggleTable(dbName: string, schemaName: string, tableName: string): void {
    // Ensure parent hierarchy is expanded
    this.expandedDatabases[dbName] = true;
    this.expandedSchemas[`${dbName}.${schemaName}`] = true;
    
    const key = `${dbName}.${schemaName}.${tableName}`;
    this.expandedTables[key] = !this.expandedTables[key];
  }

  /**
   * Ensure the entire parent hierarchy is expanded for a given item
   */
  private ensureParentExpanded(dbName: string, schemaName?: string, tableName?: string): void {
    this.expandedDatabases[dbName] = true;
    
    if (schemaName) {
      this.expandedSchemas[`${dbName}.${schemaName}`] = true;
    }
    
    if (tableName && schemaName) {
      this.expandedTables[`${dbName}.${schemaName}.${tableName}`] = true;
    }
  }

  isTableExpanded(dbName: string, schemaName: string, tableName: string): boolean {
    const key = `${dbName}.${schemaName}.${tableName}`;
    return this.expandedTables[key] || false;
  }

  refreshSchema(): void {
    if (this.databaseId && this.orgId) {
      this.loadDatabaseSchema();
    }
  }

  insertColumnName(dbName: string, schemaName: string, tableName: string, columnName: string): void {
    const activeTab = this.getActiveTab();
    if (!activeTab || !activeTab.editor) return;
    
    // Ensure parent hierarchy is expanded
    this.ensureParentExpanded(dbName, schemaName, tableName);
    
    const selection = activeTab.editor.getSelection();
    const text = schemaName === 'public' 
      ? `${tableName}.${columnName}` 
      : `${schemaName}.${tableName}.${columnName}`;
    
    activeTab.editor.executeEdits('insert-column', [{
      range: selection,
      text: text,
      forceMoveMarkers: true
    }]);
    
    activeTab.editor.focus();
  }

  // ===================================================================
  // Tab Management Methods
  // ===================================================================

  createNewTab(title: string, databaseId?: number, databaseName: string = 'database'): QueryTab | null {
    // Check maximum tab limit
    if (this.queryTabs.length >= 10) {
      return null;
    }

    const tabId = `tab_${++this.tabCounter}`;
    const newTab: QueryTab = {
      id: tabId,
      title: title,
      databaseId: databaseId,
      databaseName: databaseName,
      query: '-- Write your SQL query here\nSELECT * FROM your_table LIMIT 10;',
      result: null,
      isActive: true,
      isExecuting: false
    };

    // Deactivate all other tabs
    this.queryTabs.forEach(tab => tab.isActive = false);

    // Add new tab
    this.queryTabs.push(newTab);
    this.activeTabId = tabId;

    return newTab;
  }

  switchTab(tabId: string): void {
    const previousTab = this.getActiveTab();
    
    this.queryTabs.forEach(tab => {
      tab.isActive = tab.id === tabId;
    });
    this.activeTabId = tabId;

    // Dispose previous editor's DOM
    if (previousTab && previousTab.editor) {
      previousTab.editor.dispose();
      previousTab.editor = null;
    }

    // Re-create editor for active tab after a short delay
    setTimeout(() => {
      const activeTab = this.getActiveTab();
      if (activeTab && this.editorContainer) {
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
    if (tab.editor) {
      tab.editor.dispose();
    }

    // Remove tab
    this.queryTabs.splice(index, 1);

    // If closing active tab, activate another
    if (tabId === this.activeTabId && this.queryTabs.length > 0) {
      const newActiveIndex = Math.min(index, this.queryTabs.length - 1);
      this.switchTab(this.queryTabs[newActiveIndex].id);
    } else if (this.queryTabs.length === 0) {
      // Create a new default tab if all tabs are closed
      this.createNewTab('Main Query', this.databaseId, 'database');
      setTimeout(() => this.initMonaco(), 100);
    }

    this.activeTabId = this.queryTabs.find(t => t.isActive)?.id || null;
  }

  getActiveTab(): QueryTab | undefined {
    return this.queryTabs.find(tab => tab.isActive);
  }

  // ===================================================================
  // Tab Context Menu Methods
  // ===================================================================

  onTabContextMenu(event: MouseEvent, tabId: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuTabId = tabId;
    this.tabContextMenuPosition = { x: event.clientX, y: event.clientY };
    
    const tabIndex = this.queryTabs.findIndex(tab => tab.id === tabId);
    
    this.tabContextMenuItems = [
      {
        label: 'Close',
        icon: 'pi-times',
        command: () => this.closeTabFromContext()
      },
      {
        label: 'Close Others',
        icon: 'pi-times-circle',
        command: () => this.closeOtherTabs(),
        disabled: this.queryTabs.length <= 1
      },
      {
        label: 'Close to the Right',
        icon: 'pi-arrow-right',
        command: () => this.closeTabsToRight(),
        disabled: tabIndex === this.queryTabs.length - 1
      },
      {
        label: 'Close to the Left',
        icon: 'pi-arrow-left',
        command: () => this.closeTabsToLeft(),
        disabled: tabIndex === 0
      }
    ];

    this.showTabContextMenu = true;
  }

  closeTabContextMenu(): void {
    this.showTabContextMenu = false;
    this.contextMenuTabId = null;
  }

  closeTabFromContext(): void {
    if (!this.contextMenuTabId) return;
    this.closeTab(this.contextMenuTabId);
    this.closeTabContextMenu();
  }

  closeOtherTabs(): void {
    if (!this.contextMenuTabId) return;
    
    const tabsToClose = this.queryTabs.filter(tab => tab.id !== this.contextMenuTabId);
    
    // Dispose and remove all other tabs
    tabsToClose.forEach(tab => {
      if (tab.editor) {
        tab.editor.dispose();
      }
    });
    
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
    const tabsToClose = this.queryTabs.slice(tabIndex + 1);
    
    // Dispose editors
    tabsToClose.forEach(tab => {
      if (tab.editor) {
        tab.editor.dispose();
      }
    });
    
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
    const tabsToClose = this.queryTabs.slice(0, tabIndex);
    
    // Dispose editors
    tabsToClose.forEach(tab => {
      if (tab.editor) {
        tab.editor.dispose();
      }
    });
    
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

  // ===================================================================
  // Context Menu Methods
  // ===================================================================

  onDatabaseContextMenu(event: MouseEvent, databaseName: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatabase = databaseName;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    
    this.contextMenuItems = [
      {
        label: 'New Script',
        icon: 'pi-plus',
        command: () => this.createNewScriptFromContext(),
        disabled: this.queryTabs.length >= 10
      },
      {
        label: 'Refresh',
        icon: 'pi-refresh',
        command: () => this.refreshDatabaseFromContext()
      }
    ];

    this.showContextMenu = true;
  }

  closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuDatabase = null;
  }

  refreshDatabaseFromContext(): void {
    if (!this.contextMenuDatabase) return;

    // Collapse the database
    this.expandedDatabases[this.contextMenuDatabase] = false;

    // Collapse all schemas under this database
    Object.keys(this.expandedSchemas).forEach(key => {
      if (key.startsWith(this.contextMenuDatabase + '.')) {
        this.expandedSchemas[key] = false;
      }
    });

    // Collapse all tables under this database
    Object.keys(this.expandedTables).forEach(key => {
      if (key.startsWith(this.contextMenuDatabase + '.')) {
        this.expandedTables[key] = false;
      }
    });

    // Refresh schema
    if (this.databaseId && this.orgId) {
      this.loadDatabaseSchema();
    } else {
      this.loadDummySchema();
    }

    this.closeContextMenu();
  }

  createNewScriptFromContext(): void {
    if (!this.contextMenuDatabase) return;

    // Check maximum tab limit - silently return if limit reached
    if (this.queryTabs.length >= 10) {
      this.closeContextMenu();
      return;
    }

    const database = this.databases.find(db => db.name === this.contextMenuDatabase);
    const newTab = this.createNewTab(
      `Script ${this.tabCounter + 1}`,
      this.databaseId,
      this.contextMenuDatabase
    );

    // Initialize editor for new tab after a short delay if created
    if (newTab) {
      setTimeout(() => {
        this.initMonacoForTab(newTab);
      }, 100);
    }

    this.closeContextMenu();
  }

  private initMonacoForTab(tab: QueryTab): void {
    if (!this.editorContainer || !this.editorContainer.nativeElement) return;
    if (typeof monaco === 'undefined') return;

    try {
      // Dispose previous editor if exists
      if (tab.editor) {
        tab.editor.dispose();
      }

      // Create Monaco Editor instance for this tab
      tab.editor = monaco.editor.create(this.editorContainer.nativeElement, {
        ...MONACO_EDITOR_OPTIONS,
        value: tab.query,
        theme: this.currentTheme
      });

      // Keep reference for backward compatibility
      this.editor = tab.editor;

      // Prevent arrow keys from moving cursor when suggestions are visible
      tab.editor.onKeyDown((e: any) => {
        const suggestWidget = (tab.editor as any)._contentWidgets['editor.widget.suggestWidget'];
        const isSuggestWidgetVisible = suggestWidget && suggestWidget.widget && suggestWidget.widget._isVisible;
        
        // If suggestions are visible and arrow keys are pressed, let Monaco handle it
        if (isSuggestWidgetVisible && (e.keyCode === monaco.KeyCode.UpArrow || e.keyCode === monaco.KeyCode.DownArrow)) {
          // Monaco will handle navigation, do nothing
          return;
        }
      });

      // Focus the editor to ensure keyboard events work
      setTimeout(() => {
        if (tab.editor) {
          tab.editor.focus();
        }
      }, 100);

      // Listen to content changes
      tab.editor.onDidChangeModelContent(() => {
        tab.query = tab.editor.getValue();
      });

      // Register IntelliSense providers (only once globally)
      this.registerIntelliSenseProviders();

      // Register keyboard shortcuts
      this.monacoIntelliSenseService.registerKeyboardShortcuts(tab.editor, () => this.executeQueryForTab(tab));

      console.log(`Monaco Editor initialized for tab: ${tab.id}`);
    } catch (error) {
      console.error(`Error initializing Monaco Editor for tab ${tab.id}:`, error);
    }
  }

  private executeQueryForTab(tab: QueryTab): void {
    const query = tab.editor?.getValue() || tab.query;
    
    if (!query.trim()) {
      console.warn('No query to execute');
      return;
    }

    if (!tab.databaseId || !this.orgId) {
      console.error('Database ID or Org ID not set');
      return;
    }

    tab.isExecuting = true;
    tab.result = null;

    const startTime = Date.now();

    this.queryService.executeQuery({
      orgId: this.orgId,
      databaseId: tab.databaseId,
      query: query
    }).subscribe({
      next: (response: any) => {
        const executionTime = Date.now() - startTime;
        console.log('Query executed successfully:', response);

        tab.result = {
          columns: response.columns || (response.data && response.data.length > 0 ? Object.keys(response.data[0]) : []),
          rows: response.data || response.rows || [],
          rowCount: response.rowCount || (response.data ? response.data.length : 0),
          executionTime: executionTime
        };

        tab.isExecuting = false;
      },
      error: (error: any) => {
        const executionTime = Date.now() - startTime;
        console.error('Query execution error:', error);
        
        tab.result = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: executionTime,
          error: error.error?.message || error.message || 'Query execution failed'
        };

        tab.isExecuting = false;
      }
    });
  }

  // ===================================================================
  // Dummy Data Methods for Testing/Demo
  // ===================================================================

  private loadDummySchema(): void {
    this.databases = DummyDataHelper.getDummyDatabaseSchemas();

    // Set selected database/schema but don't auto-expand
    if (this.databases.length > 0) {
      this.selectedDatabase = this.databases[0].name;
      if (this.databases[0].schemas.length > 0) {
        this.selectedSchema = this.databases[0].schemas[0].name;
      }
    }


    // Re-register completions with dummy schema
    this.registerIntelliSenseProviders();
  }

  private loadDummyResults(): void {
    this.queryResult = DummyDataHelper.getDummyQueryResults();
  }
}
