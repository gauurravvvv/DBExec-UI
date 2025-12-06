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
import { DatabaseSchemaHelper } from '../../helpers/database-schema.helper';
import {
  DatabaseSchema,
  DummyDataHelper,
  QueryResult
} from '../../helpers/dummy-data.helper';
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
  
  // Tab Editing
  editingTabId: string | null = null;
  editingTabTitle: string = '';
  editingTabError: boolean = false;
  @ViewChild('tabTitleInput') tabTitleInput!: ElementRef;

  // IntelliSense provider disposables
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;

  get filteredDatabases(): DatabaseSchema[] {
    return DatabaseSchemaHelper.filterDatabases(
      this.databases,
      this.schemaSearchText,
      this.expandedDatabases,
      this.expandedSchemas
    );
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

    // Close context menus on click outside
    document.addEventListener('click', this.closeContextMenu.bind(this));
    document.addEventListener('click', this.closeTabContextMenu.bind(this));
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
    console.log('Save script to database:', activeTab.title);
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
    
    const key = DatabaseSchemaHelper.buildSchemaKey(dbName, schemaName);
    this.expandedSchemas[key] = !this.expandedSchemas[key];
  }

  toggleTable(dbName: string, schemaName: string, tableName: string): void {
    // Ensure parent hierarchy is expanded
    DatabaseSchemaHelper.ensureParentExpanded(
      dbName,
      this.expandedDatabases,
      this.expandedSchemas,
      this.expandedTables,
      schemaName
    );
    
    const key = DatabaseSchemaHelper.buildTableKey(dbName, schemaName, tableName);
    this.expandedTables[key] = !this.expandedTables[key];
  }

  isTableExpanded(dbName: string, schemaName: string, tableName: string): boolean {
    const key = DatabaseSchemaHelper.buildTableKey(dbName, schemaName, tableName);
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
    DatabaseSchemaHelper.ensureParentExpanded(
      dbName,
      this.expandedDatabases,
      this.expandedSchemas,
      this.expandedTables,
      schemaName,
      tableName
    );
    
    const selection = activeTab.editor.getSelection();
    const text = DatabaseSchemaHelper.generateColumnReference(schemaName, tableName, columnName);
    
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

  // ===================================================================
  // Tab Context Menu Methods
  // ===================================================================

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

  // ===================================================================
  // Context Menu Methods
  // ===================================================================

  onDatabaseContextMenu(event: MouseEvent, databaseName: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatabase = databaseName;
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

    // Collapse the database
    DatabaseSchemaHelper.collapseDatabase(
      this.contextMenuDatabase,
      this.expandedDatabases,
      this.expandedSchemas,
      this.expandedTables
    );

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
    if (TabManagementHelper.isMaxTabsReached(this.queryTabs.length)) {
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
