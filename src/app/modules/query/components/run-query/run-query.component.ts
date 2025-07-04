import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  DoCheck,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TreeNode, MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { QueryService } from '../../services/query.service';
import { Chart } from 'chart.js';
import { UIChart } from 'primeng/chart';
import {
  ALL_POSTGRES_KEYWORDS,
  ALL_POSTGRES_FUNCTIONS,
  ALL_POSTGRES_DATA_TYPES,
  ALL_POSTGRES_OPERATORS,
} from '../../constants/postgres-sql.constants';
import { parse } from 'pgsql-ast-parser';

interface QueryResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  salary: number;
  hire_date: string;
  [key: string]: any;
}

interface EditorTab {
  id: string;
  title: string;
  content: string;
  editor?: any;
  isEditing?: boolean;
  database?: any;
  isPinned?: boolean;
}

declare var monaco: any;

@Component({
  selector: 'app-run-query',
  templateUrl: './run-query.component.html',
  styleUrls: ['./run-query.component.scss'],
})
export class RunQueryComponent
  implements OnInit, AfterViewInit, OnDestroy, DoCheck
{
  @ViewChild('monacoEditor', { static: false })
  monacoEditorElement!: ElementRef;

  @ViewChild('chart') chart!: UIChart;

  @ViewChild('databaseMenu') databaseMenu!: any;

  @ViewChild('saveMenu') saveMenu!: any;

  @ViewChild('autoSaveMenu') autoSaveMenu!: any;

  // Menu hover timeout references
  private menuTimeouts: { [key: string]: any } = {};

  // Schema tree data
  schemaTree: TreeNode[] = [];

  // Editor properties
  sqlQuery: string = '';
  isExecuting: boolean = false;
  private editor: any;
  private themeObserver: MutationObserver | null = null;
  
  // Default query template
  private readonly DEFAULT_QUERY = `SELECT * FROM your_table_name LIMIT 10;`;

  // Tab management
  tabs: EditorTab[] = [];
  activeTabId: string = '';
  tabCounter: number = 1;

  // Context menu properties
  showTabContextMenu: boolean = false;
  contextMenuPosition = { x: 0, y: 0 };
  selectedTabForContext: EditorTab | null = null;
  selectedTabIndexForContext: number = -1;
  
  // Autocomplete properties
  private tableAliases: Map<string, string> = new Map();
  private schemaMetadata: Record<string, Record<string, string[]>> = {};
  private suggestionProvider: any = null;
  private suggestionCache: Map<string, any[]> = new Map();
  private frequentlyUsed: Map<string, number> = new Map();
  
  // Database context menu properties
  showDatabaseContextMenu: boolean = false;
  databaseContextMenuPosition = { x: 0, y: 0 };
  selectedDatabaseNodeForContext: TreeNode | null = null;

  // Duplicate name confirmation dialog
  showDuplicateConfirm: boolean = false;
  duplicateQueryName: string = '';
  duplicateDatabaseName: string = '';
  tabBeingEdited: EditorTab | null = null;

  // Script limit and coloring
  readonly MAX_SCRIPTS = 10;

  // Auto-save functionality
  isAutoSaveEnabled: boolean = false;
  isAutoSaveVisible: boolean = true; // Controls if auto-save button is shown
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'completed' = 'idle';
  private autoSaveTimer: any = null;
  autoSaveInterval: number = 5000; // Default 5 seconds
  readonly AUTO_SAVE_INTERVALS = [
    { label: '5 seconds', value: 5000 },
    { label: '10 seconds', value: 10000 },
    { label: '15 seconds', value: 15000 },
  ];

  // Splitter collapse properties
  isSchemaCollapsed: boolean = false;
  isResultsCollapsed: boolean = false;
  horizontalSplitterSizes: number[] = [10, 90]; // Start with schema collapsed
  verticalSplitterSizes: number[] = [60, 40]; // Start with results panel visible

  // Store previous sizes for proper expand behavior
  previousHorizontalSizes: number[] = [10, 90];
  previousVerticalSizes: number[] = [60, 40];

  // Track if splitter has been manually adjusted by user
  private splitterManuallyAdjusted: boolean = false;

  // Fullscreen mode
  isFullscreen: boolean = false;

  // Results properties
  queryResults: QueryResult[] = [];
  resultColumns: string[] = [];
  executionTime: number = 0;

  // Schema storage for autocomplete - key is databaseId
  private loadedSchemas: { [databaseId: string]: any } = {};
  
  // Current schema for autocomplete (will be populated from loadedSchemas)
  private schema: { [tableName: string]: string[] } = {};

  // Add new properties for dropdowns
  organisations: any[] = [];
  databases: any[] = [];
  selectedOrg: any = {};
  selectedDatabase: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  // Loading states
  isDatabasesLoading: boolean = false;
  isSchemaLoading: boolean = false;
  private isInitialOrgLoad: boolean = true;
  private loadingSchemas: Set<string> = new Set(); // Track schemas being loaded

  // Database tree for unified view
  databaseTree: TreeNode[] = [];

  // Split button menu items for databases
  databaseMenuItems: MenuItem[] = [];

  // Split button menu items for save actions
  saveMenuItems: MenuItem[] = [];

  // Split button menu items for auto-save options
  autoSaveMenuItems: MenuItem[] = [];

  // View mode properties
  viewMode: 'table' | 'graph' = 'table';
  selectedXAxis: any = null;
  selectedYAxis: any = null;
  selectedChartType: string = 'bar';

  columnOptions: any[] = [
    { id: 1, label: 'id', value: 'id' },
    { id: 2, label: 'first_name', value: 'first_name' },
    { id: 3, label: 'last_name', value: 'last_name' },
    { id: 4, label: 'email', value: 'email' },
    { id: 5, label: 'department', value: 'department' },
    { id: 6, label: 'salary', value: 'salary' },
    { id: 7, label: 'hire_date', value: 'hire_date' },
  ];
  chartTypes = [
    { label: 'Bar Chart', value: 'bar', icon: 'pi pi-chart-bar' },
    { label: 'Line Chart', value: 'line', icon: 'pi pi-chart-line' },
    { label: 'Pie Chart', value: 'pie', icon: 'pi pi-chart-pie' },
    { label: 'Scatter Plot', value: 'scatter', icon: 'pi pi-chart-scatter' },
  ];
  chartData: any = {};
  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--text-color'
          ),
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--text-color'
          ),
        },
        grid: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--border-color'
          ),
        },
      },
      y: {
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--text-color'
          ),
        },
        grid: {
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--border-color'
          ),
        },
      },
    },
  };

  // Chart generation properties
  isGeneratingChart: boolean = false;
  showChart: boolean = false;

  // Form group
  chartForm: FormGroup;

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private fb: FormBuilder,
    private httpClientService: HttpClientService,
    private queryService: QueryService
  ) {
    // Initialize form
    this.chartForm = this.fb.group({
      xAxis: [null],
      yAxis: [null],
      chartType: ['bar'],
    });

    // Subscribe to form value changes
    this.chartForm.valueChanges.subscribe(() => {
      this.onFormChange();
    });
  }

  ngOnInit(): void {
    // Set default query
    this.sqlQuery = this.DEFAULT_QUERY;
    
    // Add organization and database loading
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
    }

    this.initializeSchemaTree();
    // this.loadDummyData(); // Not needed anymore, using DEFAULT_QUERY
    // Initialize database menu items (fallback)
    this.updateDatabaseMenuItems();
    // Initialize save menu items
    this.updateSaveMenuItems();
    // Initialize auto-save menu items
    this.updateAutoSaveMenuItems();

    // Add ESC key handler for query editor fullscreen
    this.setupEscapeKeyHandler();
  }

  private setupEscapeKeyHandler(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.isFullscreen) {
        // Only exit query editor fullscreen if it's active
        // Don't interfere with app fullscreen
        event.stopPropagation();
        this.isFullscreen = false;

        // Ensure Monaco editor resizes properly
        if (this.editor) {
          setTimeout(() => {
            this.editor.layout();
          }, 300);
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // Wait for Monaco to be available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait

    const checkMonaco = setInterval(() => {
      attempts++;

      if (typeof monaco !== 'undefined') {
        clearInterval(checkMonaco);
        setTimeout(() => {
          this.initializeEditor();
          this.setupThemeObserver();
          this.setupSplitterDoubleClick();
          this.setupFullscreenListener();
        }, 100); // Small delay to ensure DOM is ready
      } else if (attempts >= maxAttempts) {
        clearInterval(checkMonaco);
      }
    }, 100);
  }


  private initializeEditor(): void {
    if (!monaco) {
      console.error('Monaco is not defined');
      return;
    }

    // Don't initialize editor if there are no tabs
    if (this.tabs.length === 0) {
      return;
    }

    if (!this.monacoEditorElement || !this.monacoEditorElement.nativeElement) {
      console.error('Editor element not found');
      return;
    }

    // Check if dark theme is active
    const isDarkTheme = document.body.classList.contains('dark-theme');

    try {
      // Create editor
      this.editor = monaco.editor.create(
        this.monacoEditorElement.nativeElement,
        {
          value: this.sqlQuery,
          language: 'sql',
          theme: isDarkTheme ? 'vs-dark' : 'vs',
          automaticLayout: true,
          minimap: {
            enabled: true,
          },
          fontSize: 14,
          wordWrap: 'off',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          renderLineHighlight: 'all',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: true,
          formatOnPaste: true,
          formatOnType: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          wordBasedSuggestions: true,
          suggestSelection: 'first',
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          parameterHints: {
            enabled: true,
          },
          contextmenu: true,
          mouseWheelZoom: false, // Disable zoom with mouse wheel
          bracketPairColorization: {
            enabled: true,
          },
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 4,
            horizontalScrollbarSize: 4,
            arrowSize: 10,
          },
        }
      );

      // Add custom keybindings
      this.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          this.executeQuery();
        }
      );

      // Disable zoom shortcuts
      this.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal,
        () => {
          // Do nothing - disable zoom in
        }
      );
      this.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus,
        () => {
          // Do nothing - disable zoom out
        }
      );
      this.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0,
        () => {
          // Do nothing - disable reset zoom
        }
      );

      // Add custom context menu actions
      this.editor.addAction({
        id: 'run-selected-query',
        label: 'Run Selected Query',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 0,
        run: () => {
          const selection = this.editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = this.editor
              .getModel()
              .getValueInRange(selection);
            this.sqlQuery = selectedText;
            this.executeQuery();
          }
        },
      });

      this.editor.addAction({
        id: 'format-sql',
        label: 'Format SQL',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1,
        run: () => {
          this.editor.getAction('editor.action.formatDocument').run();
        },
      });

      this.editor.addAction({
        id: 'comment-line',
        label: 'Comment/Uncomment Line',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 2,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
        run: () => {
          this.editor.getAction('editor.action.commentLine').run();
        },
      });

      this.editor.addAction({
        id: 'copy-as-sql',
        label: 'Copy as SQL String',
        contextMenuGroupId: '9_cutcopypaste',
        contextMenuOrder: 3,
        run: () => {
          const selection = this.editor.getSelection();
          if (selection) {
            const text = this.editor.getModel().getValueInRange(selection);
            const sqlString = text.replace(/'/g, "''").replace(/\n/g, ' ');
            navigator.clipboard.writeText(`'${sqlString}'`);
          }
        },
      });

      // Update sqlQuery on content change
      this.editor.onDidChangeModelContent(() => {
        this.sqlQuery = this.editor.getValue();

        // Update active tab content
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab) {
          activeTab.content = this.sqlQuery;
        }

        // Check if schema needs to be loaded for autocomplete
        this.checkAndLoadSchemaForAutocomplete();

        // Trigger auto-save if enabled
        this.triggerAutoSave();
      });

      // Setup autocomplete
      this.setupAutoComplete();

      // Focus the editor
      this.editor.focus();
    } catch (error) {}
  }

  private setupAutoComplete(): void {
    if (!monaco) return;

    // Dispose previous provider if exists
    if (this.suggestionProvider) {
      this.suggestionProvider.dispose();
    }

    // Build schema metadata from current schema
    this.buildSchemaMetadata();

    // Register enhanced completion provider for SQL
    this.suggestionProvider = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', '(', ',', '*'],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const line = model.getLineContent(position.lineNumber);
        const lineBeforeCursor = line.substring(0, position.column - 1);
        const fullQuery = model.getValue();
        
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        
        // Extract table aliases using SQL parser
        this.extractTableAliases(fullQuery);
        
        // Get context-aware suggestions
        const context = this.getAdvancedQueryContext(lineBeforeCursor, fullQuery, position);
        
        // Debug logging
        console.log('Autocomplete Debug:', {
          lineBeforeCursor,
          word: word.word,
          context,
          schemaMetadata: Object.keys(this.schemaMetadata),
          currentLine: model.getLineContent(position.lineNumber)
        });
        
        if (context.afterDot) {
          console.log('Processing dot notation for:', context.beforeDot);
          this.addDotNotationSuggestions(suggestions, range, word.word, context.beforeDot, fullQuery);
        } else if (context.expectingTable) {
          this.addTableSuggestions(suggestions, range, word.word);
        } else if (context.expectingColumn) {
          this.addColumnSuggestions(suggestions, range, word.word, context.availableTables, fullQuery);
        } else {
          this.addGeneralSuggestions(suggestions, range, word.word, context);
        }

        // Remove duplicates and sort suggestions by relevance
        const uniqueSuggestions = this.removeDuplicateSuggestions(suggestions);
        
        uniqueSuggestions.forEach(suggestion => {
          suggestion.score = this.calculateSuggestionScore(suggestion.label, word.word);
        });
        
        uniqueSuggestions.sort((a, b) => {
          // Primary sort by score (descending)
          if (a.score !== b.score) {
            return b.score - a.score;
          }
          
          // Secondary sort by category (using sortText)
          if (a.sortText && b.sortText && a.sortText !== b.sortText) {
            return a.sortText.localeCompare(b.sortText);
          }
          
          // Tertiary sort by label length (shorter first)
          if (a.label.length !== b.label.length) {
            return a.label.length - b.label.length;
          }
          
          // Final sort by alphabetical
          return a.label.localeCompare(b.label);
        });

        return {
          suggestions: uniqueSuggestions,
          incomplete: false
        };
      },
    });
  }

  private extractTableAliases(sql: string): void {
    this.tableAliases.clear();
    try {
      const ast = parse(sql);
      
      for (const stmt of ast) {
        if (stmt.type === 'select') {
          this.processSelectStatement(stmt);
        }
      }
    } catch (error) {
      // If parsing fails, try regex fallback
      this.extractAliasesWithRegex(sql);
    }
  }

  private processSelectStatement(stmt: any): void {
    if (stmt.from) {
      for (const from of stmt.from) {
        if (from.type === 'table') {
          const tableName = from.name?.name || from.name;
          const alias = from.alias?.name || tableName;
          if (tableName && alias) {
            this.tableAliases.set(alias, tableName);
          }
        } else if (from.type === 'table ref' && from.table) {
          const tableName = from.table.name;
          const alias = from.alias?.name || tableName;
          if (tableName && alias) {
            this.tableAliases.set(alias, tableName);
          }
        }
      }
    }

    // Process joins
    if (stmt.join) {
      for (const join of stmt.join) {
        if (join.from?.type === 'table') {
          const tableName = join.from.name?.name || join.from.name;
          const alias = join.from.alias?.name || tableName;
          if (tableName && alias) {
            this.tableAliases.set(alias, tableName);
          }
        }
      }
    }
  }

  private extractAliasesWithRegex(sql: string): void {
    // Regex fallback for alias extraction
    const fromRegex = /from\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi;
    const joinRegex = /join\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi;
    
    let match;
    
    // Extract FROM aliases
    while ((match = fromRegex.exec(sql)) !== null) {
      const tableName = match[1];
      const alias = match[2] || tableName.split('.').pop() || tableName;
      if (alias && tableName) {
        this.tableAliases.set(alias, tableName);
      }
    }
    
    // Extract JOIN aliases
    while ((match = joinRegex.exec(sql)) !== null) {
      const tableName = match[1];
      const alias = match[2] || tableName.split('.').pop() || tableName;
      if (alias && tableName) {
        this.tableAliases.set(alias, tableName);
      }
    }
  }

  private getAdvancedQueryContext(lineBeforeCursor: string, fullQuery: string, position: any): any {
    const line = lineBeforeCursor.toLowerCase().trim();
    
    // Enhanced dot notation detection with multiple patterns
    const dotPatterns = [
      /(\w+)\.$/,           // word.
      /(\w+)\.\s*$/,        // word. (with spaces)
      /(\w+)\.(\w*)$/       // word.partial
    ];
    
    let dotMatch = null;
    let beforeDot = null;
    
    for (const pattern of dotPatterns) {
      dotMatch = lineBeforeCursor.match(pattern);
      if (dotMatch) {
        beforeDot = dotMatch[1];
        break;
      }
    }
    
    const justTypedDot = lineBeforeCursor.endsWith('.') || lineBeforeCursor.match(/\.\s*$/);
    
    console.log('Dot detection:', {
      lineBeforeCursor,
      dotMatch,
      beforeDot,
      justTypedDot,
      line
    });
    
    if (dotMatch || justTypedDot) {
      if (!beforeDot && justTypedDot) {
        // Extract the word before the dot
        const wordBeforeDot = lineBeforeCursor.match(/(\w+)\.\s*$/);
        beforeDot = wordBeforeDot ? wordBeforeDot[1] : null;
      }
      
      if (beforeDot) {
        const isSchema = this.isSchemaName(beforeDot);
        const isTableOrAlias = this.isTableOrAlias(beforeDot);
        
        console.log('Found dot notation:', {
          beforeDot,
          isSchema,
          isTableOrAlias,
          availableSchemas: Object.keys(this.schemaMetadata),
          availableTables: Object.keys(this.schema)
        });
        
        return {
          afterDot: true,
          beforeDot: beforeDot,
          expectingColumn: isTableOrAlias,
          expectingTable: isSchema,
          isSchema: isSchema,
          isTableOrAlias: isTableOrAlias
        };
      }
    }

    const context = {
      expectingTable: false,
      expectingColumn: false,
      afterDot: false,
      availableTables: this.getAvailableTablesInContext(fullQuery),
      inSelectClause: false,
      inFromClause: false,
      inWhereClause: false,
      inJoinClause: false
    };

    // Enhanced context detection with more precise patterns
    const patterns = {
      expectingTable: [
        /(^|\s)(from|join|update|into)\s+$/i,
        /(^|\s)(from|join)\s+\w*$/i,
        /(inner|left|right|outer|cross)\s+(join)\s+$/i,
        /(insert\s+into)\s+$/i
      ],
      expectingColumn: [
        /(^|\s)select\s+$/i,
        /(^|\s)select\s+\*?\s*$/i, // Handle SELECT * or SELECT with optional *
        /(^|\s)select\s+\w*$/i,
        /,\s*$/i,
        /,\s*\w*$/i,
        /(^|\s)(where|having|and|or)\s+$/i,
        /(^|\s)(where|having|and|or)\s+\w*$/i,
        /(^|\s)(order\s+by|group\s+by)\s+$/i,
        /(^|\s)(order\s+by|group\s+by)\s+\w*$/i,
        /\(\s*$/i, // After opening parenthesis
        /=\s*$/i,  // After equals sign
        />\s*$/i,  // After greater than
        /<\s*$/i,  // After less than
        // Special case: after removing * from SELECT
        /(^|\s)select\s+from\s+\w+/i // This pattern shouldn't match for expectingColumn
      ],
      expectingJoinCondition: [
        /(^|\s)on\s+$/i,
        /(^|\s)on\s+\w*$/i
      ]
    };

    // Special handling for SELECT clause context
    const selectFromMatch = line.match(/(^|\s)select\s+(.*?)\s+from\s+(\w+)/i);
    if (selectFromMatch) {
      const selectPart = selectFromMatch[2].trim();
      const tableName = selectFromMatch[3];
      
      // If cursor is in the SELECT part (between SELECT and FROM)
      const selectEndPos = line.indexOf(' from');
      const cursorInSelect = lineBeforeCursor.length <= selectEndPos;
      
      if (cursorInSelect && (selectPart === '*' || selectPart === '')) {
        return {
          expectingTable: false,
          expectingColumn: true,
          afterDot: false,
          availableTables: [tableName],
          inSelectClause: true,
          inFromClause: false,
          inWhereClause: false,
          inJoinClause: false,
          contextTable: tableName
        };
      }
    }

    // Check table patterns
    if (patterns.expectingTable.some(pattern => pattern.test(line))) {
      context.expectingTable = true;
      context.inFromClause = true;
    }
    
    // Check column patterns
    else if (patterns.expectingColumn.some(pattern => pattern.test(line))) {
      context.expectingColumn = true;
      
      // Determine specific clause context
      if (/(^|\s)select/i.test(line)) {
        context.inSelectClause = true;
      } else if (/(^|\s)(where|having|and|or)/i.test(line)) {
        context.inWhereClause = true;
      } else if (/(^|\s)(order\s+by|group\s+by)/i.test(line)) {
        context.inSelectClause = true; // For ordering/grouping
      }
    }
    
    // Check join condition patterns
    else if (patterns.expectingJoinCondition.some(pattern => pattern.test(line))) {
      context.expectingColumn = true;
      context.inJoinClause = true;
    }

    return context;
  }

  private buildSchemaMetadata(): void {
    this.schemaMetadata = {};
    
    console.log('Building schema metadata from:', this.schema);
    
    Object.entries(this.schema).forEach(([fullTableName, columns]) => {
      const parts = fullTableName.split('.');
      const schema = parts.length > 1 ? parts[0] : 'public';
      const tableName = parts[parts.length - 1];
      
      if (!this.schemaMetadata[schema]) {
        this.schemaMetadata[schema] = {};
      }
      
      this.schemaMetadata[schema][tableName] = columns;
    });
    
    console.log('Built schema metadata:', this.schemaMetadata);
  }

  private getAvailableTablesInContext(sql: string): string[] {
    const tables: string[] = [];
    
    // Add all aliased tables
    this.tableAliases.forEach((tableName, alias) => {
      tables.push(alias);
      tables.push(tableName);
    });
    
    // Add all schema tables
    Object.keys(this.schema).forEach(fullTableName => {
      const tableName = fullTableName.split('.').pop();
      if (tableName && !tables.includes(tableName)) {
        tables.push(tableName);
      }
    });
    
    return tables;
  }

  private isTableOrAlias(name: string): boolean {
    return this.tableAliases.has(name) || this.isTableName(name);
  }

  private isSchemaName(name: string): boolean {
    return Object.keys(this.schemaMetadata).includes(name);
  }

  private addTableSuggestions(suggestions: any[], range: any, currentWord: string): void {
    // Get unique schema names
    const schemas = new Set<string>();
    const tables = new Map<string, string[]>();
    
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      if (parts.length > 1) {
        const schemaName = parts[0];
        const tableName = parts[1];
        schemas.add(schemaName);
        
        if (!tables.has(schemaName)) {
          tables.set(schemaName, []);
        }
        tables.get(schemaName)!.push(tableName);
      } else {
        // Table without schema (assume public)
        schemas.add('public');
        if (!tables.has('public')) {
          tables.set('public', []);
        }
        tables.get('public')!.push(fullTableName);
      }
    });

    // Add schema suggestions
    schemas.forEach(schemaName => {
      if (this.matchesInput(schemaName, currentWord)) {
        const tableCount = tables.get(schemaName)?.length || 0;
        suggestions.push({
          label: schemaName,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schemaName,
          range: range,
          detail: `📁 Schema (${tableCount} tables)`,
          documentation: `Schema: ${schemaName}\nTables: ${tables.get(schemaName)?.join(', ')}\nType: Database Schema`,
          sortText: `0_${schemaName}`
        });
      }
    });

    // Also add direct table names for convenience
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      const tableOnly = parts[parts.length - 1];
      
      if (this.matchesInput(tableOnly, currentWord)) {
        const schemaOnly = parts.length > 1 ? parts[0] : 'public';
        
        suggestions.push({
          label: tableOnly,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: tableOnly,
          range: range,
          detail: `📋 Table in ${schemaOnly}`,
          documentation: `Table: ${tableOnly}\nSchema: ${schemaOnly}\nColumns: ${this.schema[fullTableName].join(', ')}\nType: Database Table`,
          sortText: `1_${tableOnly}`
        });
      }
    });
  }

  private addColumnSuggestions(suggestions: any[], range: any, currentWord: string, availableTables: string[], fullQuery: string): void {
    const addedColumns = new Set<string>();
    
    // Prioritize columns from tables in current query context
    availableTables.forEach(tableName => {
      const fullTableName = this.resolveFullTableName(tableName);
      if (fullTableName && this.schema[fullTableName]) {
        this.schema[fullTableName].forEach(column => {
          if (this.matchesInput(column, currentWord) && !addedColumns.has(column)) {
            addedColumns.add(column);
            const isAlias = this.tableAliases.has(tableName);
            const displayTable = isAlias ? `${tableName} (${this.tableAliases.get(tableName)})` : tableName;
            
            suggestions.push({
              label: column,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: column,
              range: range,
              detail: `🔹 Column in ${displayTable}`,
              documentation: `Column: ${column}\nTable: ${fullTableName}\nContext: Available in current query\nType: Table Column`,
              sortText: `1_${column}`
            });
          }
        });
      }
    });
    
    // Add columns from all other tables with lower priority
    Object.entries(this.schema).forEach(([tableName, columns]) => {
      columns.forEach(column => {
        if (this.matchesInput(column, currentWord) && !addedColumns.has(column)) {
          addedColumns.add(column);
          suggestions.push({
            label: column,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: column,
            range: range,
            detail: `🔸 Column in ${tableName}`,
            documentation: `Column: ${column}\nTable: ${tableName}\nContext: Available globally\nType: Table Column`,
            sortText: `3_${column}`
          });
        }
      });
    });
  }
  
  private resolveFullTableName(tableName: string): string | null {
    // Check if it's an alias
    if (this.tableAliases.has(tableName)) {
      return this.tableAliases.get(tableName)!;
    }
    
    // Check if it's a direct table name
    return Object.keys(this.schema).find(name => 
      name === tableName || name.endsWith('.' + tableName)
    ) || null;
  }

  private addDotNotationSuggestions(suggestions: any[], range: any, currentWord: string, beforeDot: string, fullQuery: string): void {
    console.log('Adding dot notation suggestions for:', beforeDot, 'currentWord:', currentWord);
    console.log('Available schema metadata:', this.schemaMetadata);
    console.log('Available table aliases:', Array.from(this.tableAliases.entries()));
    
    // Check if beforeDot is a table alias
    if (this.tableAliases.has(beforeDot)) {
      console.log('Found table alias:', beforeDot, '->', this.tableAliases.get(beforeDot));
      const actualTableName = this.tableAliases.get(beforeDot)!;
      this.addColumnsForTable(suggestions, range, currentWord, actualTableName, `Alias: ${beforeDot} → ${actualTableName}`);
      return;
    }
    
    // Check if beforeDot is a schema name
    if (this.schemaMetadata[beforeDot]) {
      console.log('Found schema:', beforeDot, 'with tables:', Object.keys(this.schemaMetadata[beforeDot]));
      const tables = this.schemaMetadata[beforeDot];
      Object.keys(tables).forEach(tableName => {
        if (this.matchesInput(tableName, currentWord)) {
          const columns = tables[tableName];
          console.log('Adding table suggestion:', tableName);
          suggestions.push({
            label: tableName,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: tableName,
            range: range,
            detail: `📋 Table in ${beforeDot} schema`,
            documentation: `Table: ${beforeDot}.${tableName}\nColumns: ${columns.join(', ')}`,
            sortText: `0_${tableName}`
          });
        }
      });
      return;
    }
    
    // Check if beforeDot is a direct table name
    if (this.isTableName(beforeDot)) {
      console.log('Found direct table name:', beforeDot);
      this.addColumnsForTable(suggestions, range, currentWord, beforeDot, `📋 Table: ${beforeDot}`);
    } else {
      console.log('No match found for beforeDot:', beforeDot);
      console.log('Available schemas:', Object.keys(this.schemaMetadata));
      console.log('Available tables:', Object.keys(this.schema));
    }
  }
  
  private addColumnsForTable(suggestions: any[], range: any, currentWord: string, tableName: string, detail: string): void {
    // Find the full table name (with schema)
    const fullTableName = Object.keys(this.schema).find(name => 
      name === tableName || name.endsWith('.' + tableName)
    );
    
    if (fullTableName && this.schema[fullTableName]) {
      this.schema[fullTableName].forEach(column => {
        if (this.matchesInput(column, currentWord)) {
          suggestions.push({
            label: column,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: column,
            range: range,
            detail: `🔹 ${detail}`,
            documentation: `Column: ${column}\nTable: ${fullTableName}\nType: Field`,
            sortText: `1_${column}`
          });
        }
      });
    }
  }

  private addGeneralSuggestions(suggestions: any[], range: any, currentWord: string, context: any): void {
    // Add SQL keywords with context awareness
    ALL_POSTGRES_KEYWORDS.forEach((keyword: string) => {
      if (this.matchesInput(keyword, currentWord)) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range: range,
          detail: `🔤 SQL Keyword`,
          documentation: `SQL Keyword: ${keyword.toUpperCase()}\nType: PostgreSQL Reserved Word`,
          sortText: `4_${keyword}`
        });
      }
    });

    // Add schema names and table names separately
    const schemas = new Set<string>();
    const tables = new Map<string, string[]>();
    
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      if (parts.length > 1) {
        const schemaName = parts[0];
        const tableName = parts[1];
        schemas.add(schemaName);
        
        if (!tables.has(schemaName)) {
          tables.set(schemaName, []);
        }
        tables.get(schemaName)!.push(tableName);
      } else {
        schemas.add('public');
        if (!tables.has('public')) {
          tables.set('public', []);
        }
        tables.get('public')!.push(fullTableName);
      }
    });

    // Add schema suggestions
    schemas.forEach(schemaName => {
      if (this.matchesInput(schemaName, currentWord)) {
        const tableCount = tables.get(schemaName)?.length || 0;
        suggestions.push({
          label: schemaName,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schemaName,
          range: range,
          detail: `Schema (${tableCount} tables)`,
          documentation: `Schema: ${schemaName}\nTables: ${tables.get(schemaName)?.join(', ')}`,
          sortText: `1_${schemaName}`
        });
      }
    });

    // Add table names
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      const tableOnly = parts[parts.length - 1];
      
      if (this.matchesInput(tableOnly, currentWord)) {
        const schemaOnly = parts.length > 1 ? parts[0] : 'public';
        
        suggestions.push({
          label: tableOnly,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: tableOnly,
          range: range,
          detail: `Table in ${schemaOnly}`,
          documentation: `Table: ${tableOnly}\nColumns: ${this.schema[fullTableName].join(', ')}`,
          sortText: `2_${tableOnly}`
        });
      }
    });

    // Add columns from all tables
    Object.entries(this.schema).forEach(([tableName, columns]) => {
      columns.forEach(column => {
        if (this.matchesInput(column, currentWord)) {
          suggestions.push({
            label: `${column}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: column,
            range: range,
            detail: `Column in ${tableName}`,
            documentation: `Column: ${column} from table ${tableName}`,
            sortText: `4_${column}`
          });
        }
      });
    });

    // Add PostgreSQL functions
    ALL_POSTGRES_FUNCTIONS.forEach((func: string) => {
      if (this.matchesInput(func, currentWord)) {
        const insertText = func.includes('(') ? func : `${func}()`;
        suggestions.push({
          label: func,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: insertText,
          range: range,
          detail: `⚡ PostgreSQL Function`,
          documentation: `Function: ${func}\nType: Built-in PostgreSQL Function\nUsage: ${insertText}`,
          sortText: `5_${func}`
        });
      }
    });
  }

  private matchesInput(suggestion: string, input: string): boolean {
    if (!input) return true;
    
    const suggestionLower = suggestion.toLowerCase();
    const inputLower = input.toLowerCase();
    
    // Exact match (highest priority)
    if (suggestionLower === inputLower) return true;
    
    // Starts with match (high priority)
    if (suggestionLower.startsWith(inputLower)) return true;
    
    // Contains match (medium priority)
    if (suggestionLower.includes(inputLower)) return true;
    
    // Fuzzy match for common typos and partial matches
    return this.fuzzyMatch(suggestionLower, inputLower);
  }

  private fuzzyMatch(text: string, pattern: string): boolean {
    let textIndex = 0;
    let patternIndex = 0;
    
    while (textIndex < text.length && patternIndex < pattern.length) {
      if (text[textIndex] === pattern[patternIndex]) {
        patternIndex++;
      }
      textIndex++;
    }
    
    return patternIndex === pattern.length;
  }

  private calculateSuggestionScore(suggestion: string, input: string): number {
    let baseScore = 0;
    
    if (!input) {
      baseScore = 1;
    } else {
      const suggestionLower = suggestion.toLowerCase();
      const inputLower = input.toLowerCase();
      
      // Exact match
      if (suggestionLower === inputLower) {
        baseScore = 100;
      }
      // Starts with
      else if (suggestionLower.startsWith(inputLower)) {
        baseScore = 90 - (suggestion.length - input.length);
      }
      // Contains at beginning of word
      else {
        const words = suggestionLower.split(/[_\s]/);
        let foundWordMatch = false;
        for (const word of words) {
          if (word.startsWith(inputLower)) {
            baseScore = 80 - (suggestion.length - input.length);
            foundWordMatch = true;
            break;
          }
        }
        
        if (!foundWordMatch) {
          // Contains anywhere
          if (suggestionLower.includes(inputLower)) {
            baseScore = 70 - (suggestion.length - input.length);
          }
          // Fuzzy match
          else if (this.fuzzyMatch(suggestionLower, inputLower)) {
            baseScore = 50 - (suggestion.length - input.length);
          }
        }
      }
    }
    
    // Add frequency bonus (up to 20 points)
    const frequency = this.frequentlyUsed.get(suggestion.toLowerCase()) || 0;
    const frequencyBonus = Math.min(20, frequency * 2);
    
    return Math.max(0, baseScore + frequencyBonus);
  }

  private trackSuggestionUsage(suggestion: string): void {
    const key = suggestion.toLowerCase();
    const currentCount = this.frequentlyUsed.get(key) || 0;
    this.frequentlyUsed.set(key, currentCount + 1);
    
    // Keep cache size manageable
    if (this.frequentlyUsed.size > 200) {
      const entries = Array.from(this.frequentlyUsed.entries());
      entries.sort((a, b) => b[1] - a[1]);
      this.frequentlyUsed.clear();
      
      // Keep top 100 most frequently used
      entries.slice(0, 100).forEach(([key, count]) => {
        this.frequentlyUsed.set(key, count);
      });
    }
  }

  private removeDuplicateSuggestions(suggestions: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];
    
    for (const suggestion of suggestions) {
      const key = `${suggestion.label.toLowerCase()}_${suggestion.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }
    
    return unique;
  }

  private isTableName(name: string): boolean {
    return Object.keys(this.schema).some(table => 
      table === name || table.endsWith('.' + name)
    );
  }

  initializeSchemaTree(): void {
    this.schemaTree = [
      {
        label: 'postgres_db',
        expandedIcon: 'pi pi-database',
        collapsedIcon: 'pi pi-database',
        expanded: false,
        children: [
          {
            label: 'public',
            expandedIcon: 'pi pi-folder-open',
            collapsedIcon: 'pi pi-folder',
            expanded: false,
            children: [
              {
                label: 'employees',
                icon: 'pi pi-table',
                data: { type: 'table' },
                expanded: false,
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'first_name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'last_name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'email',
                    icon: 'pi pi-at',
                    data: { type: 'VARCHAR(100)' },
                  },
                  {
                    label: 'department',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'salary',
                    icon: 'pi pi-dollar',
                    data: { type: 'DECIMAL(10,2)' },
                  },
                  {
                    label: 'hire_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                ],
              },
              {
                label: 'departments',
                icon: 'pi pi-table',
                data: { type: 'table' },
                expanded: false,
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'manager_id',
                    icon: 'pi pi-user',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'budget',
                    icon: 'pi pi-dollar',
                    data: { type: 'DECIMAL(12,2)' },
                  },
                ],
              },
              {
                label: 'projects',
                icon: 'pi pi-table',
                data: { type: 'table' },
                expanded: false,
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(100)' },
                  },
                  {
                    label: 'department_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'start_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                  {
                    label: 'end_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                  {
                    label: 'status',
                    icon: 'pi pi-info-circle',
                    data: { type: 'VARCHAR(20)' },
                  },
                ],
              },
              {
                label: 'employee_projects',
                icon: 'pi pi-table',
                data: { type: 'table' },
                expanded: false,
                children: [
                  {
                    label: 'employee_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'project_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'role',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'hours_allocated',
                    icon: 'pi pi-clock',
                    data: { type: 'INTEGER' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  loadDummyData(): void {
    // Use the consistent default query
    this.sqlQuery = this.DEFAULT_QUERY;

    // If we have tabs, set the content to the first tab
    if (this.tabs.length > 0) {
      this.tabs[0].content = this.sqlQuery;
    }

    // If editor is already initialized, update its value
    if (this.editor) {
      this.editor.setValue(this.sqlQuery);
    }
  }

  executeQuery(): void {
    const query = this.sqlQuery.trim();
    if (!query) return;

    // Validate required data
    if (!this.selectedDatabase?.id) {
      console.error('No database selected');
      return;
    }

    if (!this.selectedOrg?.id) {
      console.error('No organization selected');
      return;
    }

    this.isExecuting = true;
    const startTime = Date.now();

    // Prepare request body
    const requestBody = {
      query: query,
      databaseId: this.selectedDatabase.id.toString(),
      orgId: this.selectedOrg.id.toString()
    };

    // Call query server API
    this.httpClientService.queryPost('/query/execute', requestBody)
      .toPromise()
      .then((response: any) => {
        // Handle successful response
        const result = JSON.parse(JSON.stringify(response));
        
        if (result && result.data) {
          this.queryResults = result.data;
          this.resultColumns = this.queryResults.length > 0 ? Object.keys(this.queryResults[0]) : [];
        } else {
          this.queryResults = [];
          this.resultColumns = [];
        }

        this.executionTime = Date.now() - startTime;
        this.isExecuting = false;

        // Fix layout after results load - defer to avoid splitter interference
        setTimeout(() => {
          if (this.editor) {
            this.editor.layout();
          }
        }, 300);
      })
      .catch((error: any) => {
        // Handle error response
        console.error('Query execution error:', error);
        this.queryResults = [];
        this.resultColumns = [];
        this.executionTime = Date.now() - startTime;
        this.isExecuting = false;

        // Show error message to user (you can customize this based on your error handling approach)
        if (error.error && error.error.message) {
          console.error('API Error:', error.error.message);
        }

        // Fix layout even after error
        setTimeout(() => {
          if (this.editor) {
            this.editor.layout();
          }
        }, 300);
      });
  }

  clearEditor(): void {
    this.sqlQuery = '';
    if (this.editor) {
      this.editor.setValue('');
      this.editor.focus();
    }
    this.queryResults = [];
    this.resultColumns = [];
    this.executionTime = 0;
  }

  private generateDummyResults(): QueryResult[] {
    const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
    const firstNames = [
      'John',
      'Jane',
      'Michael',
      'Sarah',
      'David',
      'Emma',
      'Robert',
      'Lisa',
      'James',
      'Mary',
    ];
    const lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
    ];

    const results: QueryResult[] = [];
    const numResults = Math.floor(Math.random() * 20) + 10;

    for (let i = 1; i <= numResults; i++) {
      const firstName =
        firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

      results.push({
        id: i,
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
        department: departments[Math.floor(Math.random() * departments.length)],
        salary: Math.floor(Math.random() * 80000) + 50000,
        hire_date: this.generateRandomDate(),
      });
    }

    return results;
  }

  private generateRandomDate(): string {
    const start = new Date(2018, 0, 1);
    const end = new Date();
    const date = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    );
    return date.toISOString().split('T')[0];
  }

  // Check if maximum scripts limit is reached
  get isMaxScriptsReached(): boolean {
    return this.tabs.length >= this.MAX_SCRIPTS;
  }


  // Tab management methods
  addNewTab(database?: any): void {
    // Don't create new tab if maximum limit is reached
    if (this.isMaxScriptsReached) {
      return;
    }

    const tabId = `tab-${this.tabCounter}`;
    // Use the first database from the databases array if no database is specified
    const targetDatabase =
      database ||
      (this.databases.length > 0 ? this.databases[0] : this.selectedDatabase);
    const dbName = targetDatabase?.name || 'Default';

    const newTab: EditorTab = {
      id: tabId,
      title: `${dbName} - Query ${this.tabCounter}`,
      content: this.DEFAULT_QUERY,
      database: targetDatabase,
    };

    // Add new tab at the end to maintain ascending order
    this.tabs.push(newTab);

    // Reorganize tabs: pinned tabs first, then unpinned tabs in order
    this.reorganizeTabs();

    this.activeTabId = tabId;
    this.tabCounter++;

    // Update selectedDatabase to match the new tab's database
    this.selectedDatabase = targetDatabase;

    // Initialize editor if this is the first tab
    if (this.tabs.length === 1 && !this.editor) {
      // Wait for DOM update before initializing editor
      setTimeout(() => {
        this.initializeEditor();
        // Set the content after editor is initialized
        if (this.editor && this.tabs.length > 0) {
          const activeTab = this.tabs.find(t => t.id === this.activeTabId);
          if (activeTab) {
            this.editor.setValue(activeTab.content || this.DEFAULT_QUERY);
          }
        }
      }, 100);
    } else if (this.editor) {
      // Update the current editor content with default query
      this.editor.setValue(this.DEFAULT_QUERY);
    }

    // Set schema for the new tab's database
    if (targetDatabase?.id) {
      this.setSchemaForDatabase(targetDatabase.id.toString());
    }

    // Auto-scroll to the newly created tab
    this.scrollToNewTab(tabId);
  }

  private scrollToNewTab(tabId: string): void {
    // Use setTimeout to ensure the DOM is updated with the new tab
    setTimeout(() => {
      const tabsContainer = document.querySelector('.tabs-container');
      const newTabElement = document.querySelector(`[data-tab-id="${tabId}"]`);

      if (tabsContainer && newTabElement) {
        // Get the new tab's position
        const newTabOffsetLeft = (newTabElement as HTMLElement).offsetLeft;
        const newTabWidth = (newTabElement as HTMLElement).offsetWidth;
        const containerWidth = tabsContainer.clientWidth;
        const currentScrollLeft = tabsContainer.scrollLeft;

        // Check if the new tab is visible in the current view
        const tabStartPos = newTabOffsetLeft;
        const tabEndPos = newTabOffsetLeft + newTabWidth;
        const viewStartPos = currentScrollLeft;
        const viewEndPos = currentScrollLeft + containerWidth;

        // If the tab is not fully visible, scroll to show it
        if (tabEndPos > viewEndPos) {
          // Tab is cut off on the right, scroll right to show it
          const targetScrollLeft = tabEndPos - containerWidth + 20; // 20px padding
          tabsContainer.scrollTo({
            left: targetScrollLeft,
            behavior: 'smooth',
          });
        } else if (tabStartPos < viewStartPos) {
          // Tab is cut off on the left, scroll left to show it
          const targetScrollLeft = tabStartPos - 20; // 20px padding
          tabsContainer.scrollTo({
            left: Math.max(0, targetScrollLeft),
            behavior: 'smooth',
          });
        }
        // If tab is already fully visible, no scrolling needed
      }
    }, 150); // Slightly longer delay to ensure DOM update
  }

  switchTab(tabId: string): void {
    // Save current tab content
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Switch to new tab
    this.activeTabId = tabId;
    const newTab = this.tabs.find(t => t.id === tabId);

    if (newTab && this.editor) {
      this.editor.setValue(newTab.content || '');
      
      // Update selectedDatabase to match the new tab's database
      this.selectedDatabase = newTab.database;
      
      // Set schema for the new tab's database
      if (newTab.database?.id) {
        this.setSchemaForDatabase(newTab.database.id.toString());
      }
    }
  }

  closeTab(tabId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index !== -1) {
      this.tabs.splice(index, 1);

      // If this was the last tab, dispose the editor
      if (this.tabs.length === 0) {
        if (this.editor) {
          this.editor.dispose();
          this.editor = null;
        }
        this.activeTabId = '';
        this.sqlQuery = this.DEFAULT_QUERY; // Reset to default query
        this.selectedDatabase = {}; // Reset selected database
      } else if (this.activeTabId === tabId) {
        // If closing active tab, switch to another
        const newIndex = Math.min(index, this.tabs.length - 1);
        this.activeTabId = this.tabs[newIndex].id;

        // Update selectedDatabase to match the new active tab's database
        this.selectedDatabase = this.tabs[newIndex].database;

        if (this.editor) {
          this.editor.setValue(this.tabs[newIndex].content || '');
        }
      }
    }
  }

  // Tab editing methods
  startEditingTab(tab: EditorTab, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    tab.isEditing = true;

    // Focus the input after Angular updates the view
    setTimeout(() => {
      const input = document.querySelector(
        `input[data-tab-id="${tab.id}"]`
      ) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  finishEditingTab(tab: EditorTab, newQueryNumber: string): void {
    const trimmedQueryNumber = newQueryNumber.trim();
    if (trimmedQueryNumber) {
      const dbName = tab.database?.name || 'Default';
      const proposedTitle = `${dbName} - ${trimmedQueryNumber}`;

      // Check for duplicates (excluding the current tab)
      const isDuplicate = this.tabs.some(
        t => t.id !== tab.id && t.title === proposedTitle
      );

      if (isDuplicate) {
        // Show custom confirmation dialog
        this.duplicateQueryName = trimmedQueryNumber;
        this.duplicateDatabaseName = dbName;
        this.tabBeingEdited = tab;
        this.showDuplicateConfirm = true;
        // Don't exit editing mode yet
        return;
      } else {
        tab.title = proposedTitle;
      }
    }
    tab.isEditing = false;
  }

  cancelDuplicate(): void {
    this.showDuplicateConfirm = false;
    this.duplicateQueryName = '';
    this.duplicateDatabaseName = '';
    if (this.tabBeingEdited) {
      this.tabBeingEdited.isEditing = false;
      this.tabBeingEdited = null;
    }
  }

  getQueryNumberFromTitle(title: string): string {
    // Extract the query number/name part after " - "
    const parts = title.split(' - ');
    return parts.length > 1 ? parts.slice(1).join(' - ') : title;
  }

  cancelEditingTab(tab: EditorTab): void {
    tab.isEditing = false;
  }

  onTabInputKeydown(
    event: KeyboardEvent,
    tab: EditorTab,
    inputElement: HTMLInputElement
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.finishEditingTab(tab, inputElement.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      inputElement.value = this.getQueryNumberFromTitle(tab.title);
      this.cancelEditingTab(tab);
    }
  }

  // Context menu methods
  onTabRightClick(event: MouseEvent, tab: EditorTab, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    // Close other menus first
    if (this.databaseMenu) {
      this.databaseMenu.hide();
    }
    if (this.saveMenu) {
      this.saveMenu.hide();
    }
    if (this.autoSaveMenu) {
      this.autoSaveMenu.hide();
    }

    this.selectedTabForContext = tab;
    this.selectedTabIndexForContext = index;
    this.contextMenuPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    this.showTabContextMenu = true;

    // Close context menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', this.onDocumentClick.bind(this), {
        once: true,
      });
    }, 0);
  }

  private onDocumentClick(): void {
    this.hideTabContextMenu();
    this.hideDatabaseContextMenu();
  }

  hideTabContextMenu(): void {
    this.showTabContextMenu = false;
    this.selectedTabForContext = null;
    this.selectedTabIndexForContext = -1;
  }

  // Database context menu methods
  onDatabaseNodeRightClick(event: MouseEvent, node: TreeNode): void {
    console.log('Right click on node:', node.data?.type, node.label); // Debug log
    event.preventDefault();
    event.stopPropagation();
    
    // Only show context menu for database nodes
    if (node.data?.type !== 'Database') {
      console.log('Not a database node, ignoring'); // Debug log
      return;
    }
    
    console.log('Showing database context menu'); // Debug log
    this.selectedDatabaseNodeForContext = node;
    this.databaseContextMenuPosition = {
      x: event.clientX,
      y: event.clientY
    };
    this.showDatabaseContextMenu = true;
    
    // Hide any other context menus
    this.hideTabContextMenu();
  }

  hideDatabaseContextMenu(): void {
    this.showDatabaseContextMenu = false;
    this.selectedDatabaseNodeForContext = null;
  }

  addNewScriptFromContextMenu(): void {
    if (this.selectedDatabaseNodeForContext?.data?.database) {
      this.addNewTab(this.selectedDatabaseNodeForContext.data.database);
      this.hideDatabaseContextMenu();
    }
  }

  refreshDatabaseFromContextMenu(): void {
    if (this.selectedDatabaseNodeForContext) {
      const node = this.selectedDatabaseNodeForContext;
      
      // Clear existing children and structure data
      node.children = [];
      node.data.hasStructure = false;
      node.data.structureData = null;
      
      // Clear loaded schema for this database
      if (node.data.database?.id) {
        const databaseId = node.data.database.id.toString();
        delete this.loadedSchemas[databaseId];
        this.loadingSchemas.delete(databaseId);
      }
      
      // Collapse and re-expand to trigger reload
      node.expanded = false;
      setTimeout(() => {
        node.expanded = true;
        this.onDatabaseNodeExpand({ node });
      }, 100);
      
      this.hideDatabaseContextMenu();
    }
  }

  renameTabFromContextMenu(): void {
    if (this.selectedTabForContext) {
      this.startEditingTab(this.selectedTabForContext);
      this.hideTabContextMenu();
    }
  }

  togglePinTabFromContextMenu(): void {
    if (this.selectedTabForContext) {
      this.togglePinTab(this.selectedTabForContext);
      this.hideTabContextMenu();
    }
  }

  togglePinTab(tab: EditorTab): void {
    // Toggle pin status
    tab.isPinned = !tab.isPinned;

    if (tab.isPinned) {
      // When pinning, move the tab to the very first position
      const tabIndex = this.tabs.findIndex((t: EditorTab) => t.id === tab.id);
      if (tabIndex > 0) {
        // Remove tab from current position
        const [pinnedTab] = this.tabs.splice(tabIndex, 1);
        // Insert at the very beginning (first position)
        this.tabs.unshift(pinnedTab);
      }
    } else {
      // When unpinning, reorganize to maintain order
      this.reorganizeTabs();
    }
  }

  reorganizeTabs(): void {
    // Separate pinned and unpinned tabs while preserving their individual order
    const pinnedTabs = this.tabs.filter((tab: EditorTab) => tab.isPinned);
    const unpinnedTabs = this.tabs.filter((tab: EditorTab) => !tab.isPinned);

    // Recombine: pinned tabs first, then unpinned tabs
    this.tabs = [...pinnedTabs, ...unpinnedTabs];
  }

  generateDummySchemaForDatabase(database: any): TreeNode[] {
    const databaseTypes = [
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'SQLite',
      'Oracle',
    ];
    const dbType =
      database.type ||
      databaseTypes[Math.floor(Math.random() * databaseTypes.length)];

    // Different dummy data based on database name/type
    switch (dbType.toLowerCase()) {
      case 'postgresql':
      case 'postgres':
        return this.generatePostgreSQLDummyData(database.name);
      case 'mysql':
        return this.generateMySQLDummyData(database.name);
      case 'mongodb':
        return this.generateMongoDummyData(database.name);
      case 'sqlite':
        return this.generateSQLiteDummyData(database.name);
      default:
        return this.generateGenericDummyData(database.name);
    }
  }

  generatePostgreSQLDummyData(dbName: string): TreeNode[] {
    return [
      {
        label: dbName,
        expanded: true,
        data: { type: 'Database', level: 0 },
        children: [
          {
            label: 'public',
            expanded: true,
            data: { type: 'Schema', level: 1 },
            children: [
              {
                label: 'Tables',
                expanded: true,
                data: { type: 'Tables', level: 2 },
                children: [
                  {
                    label: 'users',
                    data: { type: 'Table', level: 3 },
                    children: [
                      {
                        label: 'id (SERIAL PRIMARY KEY)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'username (VARCHAR(50))',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'email (VARCHAR(100))',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'created_at (TIMESTAMP)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                    ],
                  },
                  {
                    label: 'products',
                    data: { type: 'Table', level: 3 },
                    children: [
                      {
                        label: 'id (SERIAL PRIMARY KEY)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'name (VARCHAR(200))',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'price (DECIMAL(10,2))',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'category_id (INTEGER)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                    ],
                  },
                  {
                    label: 'orders',
                    data: { type: 'Table', level: 3 },
                    children: [
                      {
                        label: 'id (SERIAL PRIMARY KEY)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'user_id (INTEGER)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'total_amount (DECIMAL(10,2))',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                      {
                        label: 'order_date (TIMESTAMP)',
                        data: { type: 'Column', level: 4 },
                        leaf: true
                      },
                    ],
                  },
                ],
              },
              {
                label: 'Views',
                data: { type: 'Views', level: 2 },
                children: [
                  {
                    label: 'user_orders_view',
                    data: { type: 'View', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'product_sales_view',
                    data: { type: 'View', level: 3 },
                    leaf: true
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  generateMySQLDummyData(dbName: string): TreeNode[] {
    return [
      {
        label: dbName,
        expanded: true,
        data: { type: 'Database', level: 0 },
        children: [
          {
            label: 'Tables',
            expanded: true,
            data: { type: 'Tables', level: 1 },
            children: [
              {
                label: 'customers',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'customer_id (INT AUTO_INCREMENT PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'first_name (VARCHAR(50))',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'last_name (VARCHAR(50))',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'phone (VARCHAR(20))',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
              {
                label: 'inventory',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'item_id (INT AUTO_INCREMENT PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'item_name (VARCHAR(100))',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'quantity (INT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'unit_price (DECIMAL(8,2))',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  generateMongoDummyData(dbName: string): TreeNode[] {
    return [
      {
        label: dbName,
        expanded: true,
        data: { type: 'Database', level: 0 },
        children: [
          {
            label: 'Collections',
            expanded: true,
            data: { type: 'Collections', level: 1 },
            children: [
              {
                label: 'posts',
                data: { type: 'Collection', level: 2 },
                children: [
                  {
                    label: '_id (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'title (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'content (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'author (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'createdAt (Date)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                ],
              },
              {
                label: 'comments',
                data: { type: 'Collection', level: 2 },
                children: [
                  {
                    label: '_id (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'postId (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'message (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'userId (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  generateSQLiteDummyData(dbName: string): TreeNode[] {
    return [
      {
        label: dbName,
        expanded: true,
        data: { type: 'Database', level: 0 },
        children: [
          {
            label: 'Tables',
            expanded: true,
            data: { type: 'Tables', level: 1 },
            children: [
              {
                label: 'contacts',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'id (INTEGER PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'name (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'email (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'phone (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
              {
                label: 'notes',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'id (INTEGER PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'contact_id (INTEGER)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'note_text (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'created_date (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  generateGenericDummyData(dbName: string): TreeNode[] {
    return [
      {
        label: dbName,
        expanded: true,
        data: { type: 'Database', level: 0 },
        children: [
          {
            label: 'dbo',
            expanded: true,
            data: { type: 'Schema', level: 1 },
            children: [
              {
                label: 'employees',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'emp_id (PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'emp_name (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'department (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'salary (DECIMAL)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
              {
                label: 'departments',
                data: { type: 'Table', level: 2 },
                children: [
                  {
                    label: 'dept_id (PRIMARY KEY)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'dept_name (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                  {
                    label: 'manager_id (INTEGER)',
                    data: { type: 'Column', level: 3 },
                    leaf: true
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  createDatabaseTreeNodes(databases: any[]): TreeNode[] {
    return databases.map((database: any) => ({
      label: database.name,
      expanded: false,
      leaf: false, // Important: this makes the node expandable
      data: {
        type: 'Database',
        id: database.id,
        database: database,
        loading: false,
        level: 0,
        structureData: null, // Store raw API response data
        hasStructure: false // Track if structure has been loaded
      },
      children: [], // Empty array initially, populated on expand
    }));
  }

  onDatabaseNodeExpand(event: any): void {
    const node = event.node;
    if (
      node.data?.type === 'Database' &&
      (!node.children || node.children.length === 0)
    ) {
      // Validate required data
      if (!node.data.database?.id) {
        console.error('Database ID not found in node data');
        return;
      }

      if (!this.selectedOrg?.id) {
        console.error('No organization selected');
        return;
      }

      // Set loading state for this specific node
      node.data.loading = true;

      // Call API to get database structure
      this.queryService.getDatabaseStructure(
        node.data.database.id,
        this.selectedOrg.id
      ).toPromise()
        .then((response: any) => {
          // Handle successful response
          const result = JSON.parse(JSON.stringify(response));
          
          if (result && result.data) {
            // Store raw structure data in node
            node.data.structureData = result.data;
            node.data.hasStructure = true;
            
            // Transform API response to tree node structure and store schema for autocomplete
            node.children = this.transformDatabaseStructureToTreeNodes(result.data, node.data.database.id.toString());
            
            // If this database is currently active in editor, update schema immediately
            if (this.selectedDatabase?.id === node.data.database.id) {
              this.updateActiveSchema(node.data.database.id.toString());
            }
          } else {
            // Fallback to dummy data if API response is empty
            const schemaData = this.generateDummySchemaForDatabase(node.data.database);
            node.children = schemaData[0]?.children || [];
          }
          
          node.data.loading = false;
        })
        .catch((error: any) => {
          // Handle error response
          console.error('Error loading database structure:', error);
          
          // Fallback to dummy data on error
          const schemaData = this.generateDummySchemaForDatabase(node.data.database);
          node.children = schemaData[0]?.children || [];
          
          node.data.loading = false;
          node.data.hasStructure = false;

          // Show error message to user (you can customize this based on your error handling approach)
          if (error.error && error.error.message) {
            console.error('API Error:', error.error.message);
          }
        });
    }
  }

  // Transform API response to tree node structure
  transformDatabaseStructureToTreeNodes(structureData: any, databaseId?: string): TreeNode[] {
    // API returns structure like:
    // { schemas: [{ schema: 'schema_name', tables: [{ table: 'table_name', columns: [...] }] }] }
    
    if (!structureData || !structureData.schemas) {
      return [];
    }
    
    // Build schema for autocomplete if databaseId is provided
    if (databaseId) {
      const schemaForAutocomplete: { [tableName: string]: string[] } = {};
      
      structureData.schemas.forEach((schemaItem: any) => {
        if (schemaItem.tables) {
          schemaItem.tables.forEach((tableItem: any) => {
            const tableName = `${schemaItem.schema}.${tableItem.table}`;
            const columns: string[] = [];
            
            if (tableItem.columns) {
              tableItem.columns.forEach((column: any) => {
                columns.push(column.name);
              });
            }
            
            schemaForAutocomplete[tableName] = columns;
            // Also add without schema prefix for convenience
            schemaForAutocomplete[tableItem.table] = columns;
          });
        }
      });
      
      // Store in loaded schemas
      this.loadedSchemas[databaseId] = schemaForAutocomplete;
      
      // Update active schema if this is the current database
      if (this.selectedDatabase && this.selectedDatabase.id === databaseId) {
        this.schema = schemaForAutocomplete;
        // Rebuild schema metadata after loading schema
        this.buildSchemaMetadata();
      }
    }

    return structureData.schemas.map((schemaItem: any) => ({
      label: schemaItem.schema,
      data: {
        type: 'Schema',
        level: 1,
        schema: schemaItem
      },
      expandedIcon: 'pi pi-sitemap',
      collapsedIcon: 'pi pi-sitemap',
      children: schemaItem.tables && schemaItem.tables.length > 0 ? schemaItem.tables.map((tableItem: any) => ({
        label: tableItem.table,
        data: {
          type: 'Table',
          level: 2,
          table: tableItem
        },
        expandedIcon: 'pi pi-table',
        collapsedIcon: 'pi pi-table',
        children: tableItem.columns && tableItem.columns.length > 0 ? tableItem.columns.map((column: any) => {
          // Format column display with only name and type
          let columnLabel = `${column.name}`;
          if (column.type) {
            if (column.maxLength) {
              columnLabel += ` (${column.type}(${column.maxLength}))`;
            } else {
              columnLabel += ` (${column.type})`;
            }
          }
          
          return {
            label: columnLabel,
            data: {
              type: 'Column',
              level: 3,
              column: column
            },
            icon: 'pi pi-minus',
            leaf: true
          };
        }) : []
      })) : [{
        label: 'No tables found',
        data: {
          type: 'EmptyState',
          level: 2
        },
        icon: 'pi pi-info-circle',
        leaf: true,
        styleClass: 'empty-state-node'
      }]
    }));
  }

  getNodeIcon(nodeType: string): string {
    switch (nodeType) {
      case 'Database':
        return 'pi pi-database database-icon';
      case 'Schema':
        return 'pi pi-sitemap schema-icon';
      case 'Table':
        return 'pi pi-list table-icon';
      case 'Collection':
        return 'pi pi-file collection-icon';
      case 'Column':
      case 'Field':
        return 'pi pi-minus column-icon';
      case 'Tables':
      case 'Collections':
        return 'pi pi-list tables-icon';
      case 'View':
      case 'Views':
        return 'pi pi-eye view-icon';
      default:
        return 'pi pi-circle-fill default-icon';
    }
  }

  getNodeTypeIcon(node: any): string {
    if (!node.data?.type) return 'pi pi-file';
    
    switch (node.data.type) {
      case 'Database':
      case 'MySQL Database':
      case 'PostgreSQL Database':
      case 'MongoDB Database':
      case 'SQLite Database':
        return 'pi-database';
      
      case 'Schema':
      case 'Collections':
        return 'pi-folder';
      
      case 'Tables':
      case 'Views':
        return 'pi-table';
      
      case 'Table':
      case 'Collection':
        return 'pi-list';
      
      case 'View':
        return 'pi-eye';
      
      case 'Column':
      case 'Field':
        return 'pi-minus';
      
      default:
        return 'pi-file';
    }
  }

  closeTabFromContext(tabId: string): void {
    this.closeTab(tabId);
    this.hideTabContextMenu();
  }

  closeOtherTabs(keepTabId: string): void {
    if (this.tabs.length <= 1) {
      this.hideTabContextMenu();
      return;
    }

    // Save the content of the current tab before closing others
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Keep only the specified tab
    this.tabs = this.tabs.filter(tab => tab.id === keepTabId);

    // Switch to the kept tab if it's not already active
    if (this.activeTabId !== keepTabId) {
      this.activeTabId = keepTabId;
      const newTab = this.tabs.find(t => t.id === keepTabId);
      if (newTab && this.editor) {
        this.editor.setValue(newTab.content || '');
      }
    }

    this.hideTabContextMenu();
  }

  closeTabsToRight(fromIndex: number): void {
    if (fromIndex >= this.tabs.length - 1) {
      this.hideTabContextMenu();
      return;
    }

    // Save current tab content
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Remove tabs to the right
    const tabsToRemove = this.tabs.slice(fromIndex + 1);
    this.tabs = this.tabs.slice(0, fromIndex + 1);

    // If the active tab was removed, switch to the rightmost remaining tab
    if (tabsToRemove.some(tab => tab.id === this.activeTabId)) {
      const newActiveTab = this.tabs[this.tabs.length - 1];
      this.activeTabId = newActiveTab.id;
      if (this.editor) {
        this.editor.setValue(newActiveTab.content || '');
      }
    }

    this.hideTabContextMenu();
  }

  closeTabsToLeft(fromIndex: number): void {
    if (fromIndex <= 0) {
      this.hideTabContextMenu();
      return;
    }

    // Save current tab content
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Remove tabs to the left
    const tabsToRemove = this.tabs.slice(0, fromIndex);
    this.tabs = this.tabs.slice(fromIndex);

    // If the active tab was removed, switch to the leftmost remaining tab
    if (tabsToRemove.some(tab => tab.id === this.activeTabId)) {
      const newActiveTab = this.tabs[0];
      this.activeTabId = newActiveTab.id;
      if (this.editor) {
        this.editor.setValue(newActiveTab.content || '');
      }
    }

    this.hideTabContextMenu();
  }

  hasTabsToRight(index: number): boolean {
    return index < this.tabs.length - 1;
  }

  hasTabsToLeft(index: number): boolean {
    return index > 0;
  }

  closeAllTabs(): void {
    // Keep only one tab (create a new one if needed)
    if (this.tabs.length <= 1) {
      this.hideTabContextMenu();
      return;
    }

    // Save current tab content before closing all
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Keep only the first tab and clear its content
    const firstTab = this.tabs[0];
    this.tabs = [firstTab];
    this.activeTabId = firstTab.id;

    // Clear the content of the remaining tab
    firstTab.content = '';
    const dbName =
      firstTab.database?.name || this.selectedDatabase?.name || 'Default';
    firstTab.title = `${dbName} - Query 1`;

    // Clear the editor
    if (this.editor) {
      this.editor.setValue('');
    }

    // Reset counter
    this.tabCounter = 2;

    this.hideTabContextMenu();
  }

  // Close all menus helper method
  private closeAllMenus(): void {
    if (this.databaseMenu) {
      this.databaseMenu.hide();
    }
    if (this.saveMenu) {
      this.saveMenu.hide();
    }
    if (this.autoSaveMenu) {
      this.autoSaveMenu.hide();
    }
    // Close tab context menu
    this.hideTabContextMenu();
  }

  // Common menu hover functionality
  showMenu(event: Event, menuType: 'database' | 'save' | 'autoSave'): void {
    event.stopPropagation();
    event.preventDefault();
    this.cancelMenuHide(menuType);
    
    // Close all other menus first
    this.closeAllMenusExcept(menuType);
    
    // Show the specific menu
    const menu = this.getMenuByType(menuType);
    if (menu) {
      // Special handling for auto-save menu
      if (menuType === 'autoSave') {
        this.updateAutoSaveMenuItems();
      }
      menu.show(event);
    }
  }

  hideMenuDelayed(menuType: 'database' | 'save' | 'autoSave'): void {
    this.menuTimeouts[menuType] = setTimeout(() => {
      const menu = this.getMenuByType(menuType);
      if (menu) {
        menu.hide();
      }
    }, 200);
  }

  cancelMenuHide(menuType: 'database' | 'save' | 'autoSave'): void {
    if (this.menuTimeouts[menuType]) {
      clearTimeout(this.menuTimeouts[menuType]);
      this.menuTimeouts[menuType] = null;
    }
  }

  private getMenuByType(menuType: 'database' | 'save' | 'autoSave'): any {
    switch (menuType) {
      case 'database':
        return this.databaseMenu;
      case 'save':
        return this.saveMenu;
      case 'autoSave':
        return this.autoSaveMenu;
      default:
        return null;
    }
  }

  private closeAllMenusExcept(exceptType: 'database' | 'save' | 'autoSave'): void {
    const menuTypes: ('database' | 'save' | 'autoSave')[] = ['database', 'save', 'autoSave'];
    
    menuTypes.forEach(type => {
      if (type !== exceptType) {
        const menu = this.getMenuByType(type);
        if (menu) {
          menu.hide();
        }
      }
    });
    
    // Also close tab context menu
    this.hideTabContextMenu();
  }

  // Wrapper methods for template compatibility
  showDatabaseMenu(event: Event): void {
    this.showMenu(event, 'database');
  }

  hideDatabaseMenuDelayed(): void {
    this.hideMenuDelayed('database');
  }

  showSaveMenu(event: Event): void {
    this.showMenu(event, 'save');
  }

  hideSaveMenuDelayed(): void {
    this.hideMenuDelayed('save');
  }

  showAutoSaveMenu(event: Event): void {
    this.showMenu(event, 'autoSave');
  }

  hideAutoSaveMenuDelayed(): void {
    this.hideMenuDelayed('autoSave');
  }

  // Database menu toggle method
  toggleDatabaseMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    
    // Close other menus first
    if (this.saveMenu) {
      this.saveMenu.hide();
    }
    if (this.autoSaveMenu) {
      this.autoSaveMenu.hide();
    }
    this.hideTabContextMenu();
    
    if (this.databaseMenu) {
      this.databaseMenu.toggle(event);
    }
  }

  // Splitter collapse methods with max/min expansion
  toggleSchemaPanel(): void {
    const currentSchemaSize = this.horizontalSplitterSizes[0];

    if (currentSchemaSize <= 12) {
      // Panel is collapsed, expand to maximum allowed (40%)
      this.horizontalSplitterSizes = [40, 60];
      this.isSchemaCollapsed = false;
    } else if (currentSchemaSize >= 35) {
      // Panel is at or near maximum, collapse to a more visible minimum (10%)
      this.horizontalSplitterSizes = [10, 90];
      this.isSchemaCollapsed = false; // Keep false as it's still visible
    } else {
      // Panel is in between, expand to maximum
      this.horizontalSplitterSizes = [40, 60];
      this.isSchemaCollapsed = false;
    }

    // Update previous sizes for resize events
    this.previousHorizontalSizes = [...this.horizontalSplitterSizes];
  }

  toggleResultsPanel(): void {
    const currentResultsSize = this.verticalSplitterSizes[1];

    if (currentResultsSize <= 10) {
      // Panel is collapsed, expand to maximum allowed (70%)
      this.verticalSplitterSizes = [30, 70];
      this.isResultsCollapsed = false;
    } else if (currentResultsSize >= 60) {
      // Panel is at or near maximum, collapse to a more visible minimum (15%)
      this.verticalSplitterSizes = [85, 15];
      this.isResultsCollapsed = false; // Keep false as it's still visible
    } else {
      // Panel is in between, expand to maximum
      this.verticalSplitterSizes = [30, 70];
      this.isResultsCollapsed = false;
    }

    // Update previous sizes for resize events
    this.previousVerticalSizes = [...this.verticalSplitterSizes];
  }

  // Splitter resize event handlers
  onHorizontalSplitterResize(event: any): void {
    let leftSize = event.sizes[0];
    let rightSize = event.sizes[1];

    // Mark splitter as manually adjusted
    this.splitterManuallyAdjusted = true;

    // Enforce absolute maximum 40% for schema panel
    if (leftSize > 40) {
      leftSize = 40;
      rightSize = 60;
      this.horizontalSplitterSizes = [leftSize, rightSize];
      return;
    }

    // Enforce absolute minimum 10% for schema panel (no complete hiding)
    if (leftSize < 10) {
      leftSize = 10;
      rightSize = 90;
      this.horizontalSplitterSizes = [leftSize, rightSize];
      return;
    }

    // Enforce minimum 60% for main content area
    if (rightSize < 60) {
      leftSize = 40;
      rightSize = 60;
      this.horizontalSplitterSizes = [leftSize, rightSize];
      return;
    }

    // Update the sizes when user manually resizes
    this.horizontalSplitterSizes = event.sizes;
    this.previousHorizontalSizes = [...event.sizes];

    // Update collapsed state based on size
    this.isSchemaCollapsed = event.sizes[0] <= 10;
  }

  onVerticalSplitterResize(event: any): void {
    let topSize = event.sizes[0];
    let bottomSize = event.sizes[1];

    // Enforce absolute minimum 30% for editor panel
    if (topSize < 30) {
      topSize = 30;
      bottomSize = 70;
      this.verticalSplitterSizes = [topSize, bottomSize];
      return;
    }

    // Enforce absolute maximum 85% for editor panel
    if (topSize > 85) {
      topSize = 85;
      bottomSize = 15;
      this.verticalSplitterSizes = [topSize, bottomSize];
      return;
    }

    // Enforce absolute minimum 15% for results panel (no complete hiding)
    if (bottomSize < 15) {
      topSize = 85;
      bottomSize = 15;
      this.verticalSplitterSizes = [topSize, bottomSize];
      return;
    }

    // Update the sizes when user manually resizes
    this.verticalSplitterSizes = event.sizes;
    this.previousVerticalSizes = [...event.sizes];

    // Update collapsed state based on size
    this.isResultsCollapsed = event.sizes[1] <= 15;
  }

  // Setup double-click listeners on splitter gutters
  setupSplitterDoubleClick(): void {
    setTimeout(() => {
      // Horizontal splitter gutter
      const horizontalGutter = document.querySelector(
        '.main-horizontal-splitter .p-splitter-gutter'
      );
      if (horizontalGutter) {
        horizontalGutter.addEventListener('dblclick', () => {
          this.toggleSchemaPanel();
        });

        // Add visual indicator
        horizontalGutter.setAttribute(
          'title',
          'Double-click to collapse/expand schema panel'
        );
      }

      // Vertical splitter gutter
      const verticalGutter = document.querySelector(
        '.editor-results-splitter .p-splitter-gutter'
      );
      if (verticalGutter) {
        verticalGutter.addEventListener('dblclick', () => {
          this.toggleResultsPanel();
        });

        // Add visual indicator
        verticalGutter.setAttribute(
          'title',
          'Double-click to collapse/expand results panel'
        );
      }
    }, 200); // Wait for PrimeNG to render the gutters
  }

  // Fullscreen toggle method - Only for query editor area
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;

    // Just toggle the CSS class, don't use native fullscreen API
    // This allows the header's fullscreen to work independently

    // If in fullscreen mode, ensure Monaco editor resizes properly
    if (this.editor) {
      setTimeout(() => {
        this.editor.layout();
      }, 300); // Wait for CSS transition
    }
  }

  private setupFullscreenListener(): void {
    // Empty method kept for compatibility
    // We're not using native fullscreen API anymore
  }

  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          const isDarkTheme = document.body.classList.contains('dark-theme');
          if (this.editor) {
            monaco.editor.setTheme(isDarkTheme ? 'vs-dark' : 'vs');
          }
          // Update chart if it's visible
          if (this.showChart) {
            this.updateChartData();
          }
        }
      });
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // Add methods for organization and database handling
  loadOrganisations() {
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
        }
      }
    });
  }

  onOrgChange(event: any) {
    // Skip if this is triggered by initial load
    if (this.isInitialOrgLoad) {
      this.isInitialOrgLoad = false;
      return;
    }
    this.selectedOrg = event.value;
    this.loadDatabases();
  }

  onDBChange(event: any) {
    this.selectedDatabase = event.value;
    
    // Update the active schema for autocomplete
    if (this.selectedDatabase && this.selectedDatabase.id) {
      this.setSchemaForDatabase(this.selectedDatabase.id.toString());
    }
  }
  
  // Update the active schema for autocomplete
  private updateActiveSchema(databaseId: string): void {
    if (this.loadedSchemas[databaseId]) {
      // Use cached schema
      this.schema = this.loadedSchemas[databaseId];
      // Rebuild schema metadata after loading cached schema
      this.buildSchemaMetadata();
    } else {
      // Schema not loaded yet, will be loaded on first keystroke
      this.schema = {};
    }
  }

  // Check if schema is loaded for current database, load if needed
  private checkAndLoadSchemaForAutocomplete(): void {
    // Only load if we have a selected database and organization
    if (!this.selectedDatabase?.id || !this.selectedOrg?.id) {
      return;
    }

    const databaseId = this.selectedDatabase.id.toString();
    
    // If schema is already loaded, no need to reload
    if (this.loadedSchemas[databaseId]) {
      return;
    }

    // Load schema in background for autocomplete
    this.loadSchemaForDatabase(databaseId);
  }

  // Find database tree node by database ID
  private findDatabaseTreeNode(databaseId: string): TreeNode | null {
    for (const node of this.databaseTree) {
      if (node.data?.database?.id?.toString() === databaseId) {
        return node;
      }
    }
    return null;
  }

  // Set schema for a specific database (use tree data if available, otherwise load from API)
  private setSchemaForDatabase(databaseId: string): void {
    // First check if tree node has structure data
    const treeNode = this.findDatabaseTreeNode(databaseId);
    
    if (treeNode?.data?.hasStructure && treeNode.data.structureData) {
      // Use existing tree node data
      this.transformDatabaseStructureToTreeNodes(treeNode.data.structureData, databaseId);
      this.updateActiveSchema(databaseId);
    } else if (this.loadedSchemas[databaseId]) {
      // Use cached schema
      this.updateActiveSchema(databaseId);
    } else {
      // Load schema from API
      this.loadSchemaForDatabase(databaseId);
    }
  }

  // Load schema for a specific database for autocomplete
  private loadSchemaForDatabase(databaseId: string): void {
    if (!this.selectedOrg?.id) {
      return;
    }

    // Check if already loading or loaded
    if (this.loadingSchemas.has(databaseId) || this.loadedSchemas[databaseId]) {
      return;
    }

    // Mark as loading
    this.loadingSchemas.add(databaseId);

    // Call API to get database structure for autocomplete
    this.queryService.getDatabaseStructure(
      parseInt(databaseId),
      this.selectedOrg.id
    ).toPromise()
      .then((response: any) => {
        // Handle successful response
        const result = JSON.parse(JSON.stringify(response));
        
        if (result && result.data) {
          // Transform API response and store schema for autocomplete
          this.transformDatabaseStructureToTreeNodes(result.data, databaseId);
          
          // Update tree node with structure data if it exists
          const treeNode = this.findDatabaseTreeNode(databaseId);
          if (treeNode) {
            treeNode.data.structureData = result.data;
            treeNode.data.hasStructure = true;
            
            // Update tree children if not already expanded
            if (!treeNode.children || treeNode.children.length === 0) {
              treeNode.children = this.transformDatabaseStructureToTreeNodes(result.data, databaseId);
            }
          }
          
          // Update active schema
          this.updateActiveSchema(databaseId);
        }
      })
      .catch((error: any) => {
        // Handle error silently for background loading
        console.warn('Could not load schema for autocomplete:', error);
      })
      .finally(() => {
        // Remove from loading set
        this.loadingSchemas.delete(databaseId);
      });
  }

  loadDatabases() {
    if (!this.selectedOrg) return;

    // Set loading state to true when starting the request
    this.isDatabasesLoading = true;

    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService
      .listDatabase(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.databases = [...response.data];

          // Create database tree nodes
          this.databaseTree = this.createDatabaseTreeNodes(this.databases);

          if (this.databases.length > 0) {
            this.selectedDatabase = this.databases[0];
          }
          this.updateDatabaseMenuItems();
        }
      })
      .catch(error => {
        // Handle error case
        console.error('Error loading databases:', error);
        this.databases = [];
        this.selectedDatabase = {};
        this.databaseTree = [];
        this.updateDatabaseMenuItems();
      })
      .finally(() => {
        // Always set loading state to false when request completes
        this.isDatabasesLoading = false;
      });
  }

  updateDatabaseMenuItems(): void {
    if (this.databases && this.databases.length > 0) {
      this.databaseMenuItems = this.databases.map(database => ({
        label: database.name,
        icon: 'pi pi-database',
        command: () => {
          this.addNewTab(database);
        },
      }));
    } else {
      // Fallback when no databases are available
      this.databaseMenuItems = [
        {
          label: 'No databases available',
          icon: 'pi pi-info-circle',
          disabled: true,
        },
        {
          label: 'Test Database 1',
          icon: 'pi pi-database',
          command: () => {
            this.addNewTab({ name: 'Test Database 1', id: 'test1' });
          },
        },
        {
          label: 'Test Database 2',
          icon: 'pi pi-database',
          command: () => {
            this.addNewTab({ name: 'Test Database 2', id: 'test2' });
          },
        },
      ];
    }
  }

  updateSaveMenuItems(): void {
    this.saveMenuItems = [
      {
        label: 'Save Current Script',
        icon: 'pi pi-save',
        command: () => {
          this.saveCurrentScript();
        },
      },
      {
        label: 'Save All Scripts',
        icon: 'pi pi-save',
        command: () => {
          this.saveAllScripts();
        },
      },
    ];
  }

  toggleSaveMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    
    // Close other menus first
    if (this.databaseMenu) {
      this.databaseMenu.hide();
    }
    if (this.autoSaveMenu) {
      this.autoSaveMenu.hide();
    }
    this.hideTabContextMenu();
    
    if (this.saveMenu) {
      this.saveMenu.toggle(event);
    } else {
      console.error('Save menu not initialized');
    }
  }

  updateAutoSaveMenuItems(): void {
    this.autoSaveMenuItems = [
      ...this.AUTO_SAVE_INTERVALS.map(interval => ({
        label: interval.label,
        icon:
          this.autoSaveInterval === interval.value
            ? 'pi pi-check'
            : 'pi pi-circle',
        command: () => {
          this.setAutoSaveInterval(interval.value);
        },
      })),
      {
        separator: true,
      },
      {
        label: this.isAutoSaveEnabled
          ? 'Disable Auto-Save'
          : 'Enable Auto-Save',
        icon: this.isAutoSaveEnabled ? 'pi pi-pause' : 'pi pi-play',
        command: () => {
          this.toggleAutoSave();
          this.updateAutoSaveMenuItems(); // Refresh menu items
        },
      },
    ];
  }

  toggleAutoSaveMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    
    // Close other menus first
    if (this.databaseMenu) {
      this.databaseMenu.hide();
    }
    if (this.saveMenu) {
      this.saveMenu.hide();
    }
    this.hideTabContextMenu();
    
    this.updateAutoSaveMenuItems(); // Refresh menu before showing
    if (this.autoSaveMenu) {
      this.autoSaveMenu.toggle(event);
    } else {
      console.error('Auto-save menu not initialized');
    }
  }

  setAutoSaveInterval(interval: number): void {
    this.autoSaveInterval = interval;

    // Enable auto-save and start with the new interval
    this.isAutoSaveEnabled = true;
    this.stopAutoSave();
    this.startAutoSave();

    // Update menu items to reflect the change
    this.updateAutoSaveMenuItems();
  }

  getAutoSaveTooltip(): string {
    if (this.isAutoSaveEnabled) {
      const seconds = this.autoSaveInterval / 1000;
      return `Auto-save enabled (${seconds}s)`;
    }
    return 'Auto-save disabled - Click to configure';
  }

  getAutoSaveIconClass(): string {
    switch (this.autoSaveStatus) {
      case 'saving':
        return 'pi pi-spin pi-spinner';
      case 'saved':
      case 'completed':
        return 'pi pi-check';
      case 'error':
        return 'pi pi-times';
      default:
        return 'pi pi-clock';
    }
  }

  hideAutoSaveButton(): void {
    this.isAutoSaveVisible = false;
    // Disable auto-save when hiding the button
    if (this.isAutoSaveEnabled) {
      this.toggleAutoSave();
    }
    // Update save menu to show the restore option
    this.updateSaveMenuItems();
  }

  showAutoSaveButton(): void {
    this.isAutoSaveVisible = true;
    // Update save menu to remove the restore option
    this.updateSaveMenuItems();
  }

  saveCurrentScript(): void {
    const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
    if (activeTab) {
      // Get the current query content from the editor
      const currentQuery = this.editor ? this.editor.getValue() : this.sqlQuery;

      // Update the tab's content
      activeTab.content = currentQuery;

      // Show success feedback (you could add a toast notification here)
      alert(`Script "${activeTab.title}" saved successfully!`);
    } else {
      console.error('No active tab found');
      alert('No active script to save');
    }
  }

  saveAllScripts(): void {
    if (this.tabs.length === 0) {
      alert('No scripts to save');
      return;
    }

    // Get current content from editor for active tab
    const currentQuery = this.editor ? this.editor.getValue() : this.sqlQuery;

    // Update active tab content
    const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
    if (activeTab) {
      activeTab.content = currentQuery;
    }

    // Save all tabs
    const savedScripts = this.tabs.map(tab => ({
      tabId: tab.id,
      title: tab.title,
      content: tab.content,
      database: tab.database,
    }));

    // Show success feedback
    alert(`All ${this.tabs.length} scripts saved successfully!`);
  }

  get numericColumns(): string[] {
    if (!this.queryResults.length) return [];
    return this.resultColumns.filter(
      col => typeof this.queryResults[0][col] === 'number'
    );
  }

  // // Transform columns for dropdown
  // get columnOptions(): any[] {
  //   return this.resultColumns.map(col => ({
  //     label: col,
  //     value: col,
  //   }));
  // }

  get numericColumnOptions(): any[] {
    if (!this.queryResults.length) return [];
    return this.resultColumns
      .filter(col => typeof this.queryResults[0][col] === 'number')
      .map(col => ({
        label: col,
        value: col,
      }));
  }

  // Helper methods for chart type display
  getChartTypeIcon(type: string): string {
    const chartType = this.chartTypes.find(t => t.value === type);
    return chartType ? chartType.icon : 'pi pi-chart-bar';
  }

  getChartTypeLabel(type: string): string {
    const chartType = this.chartTypes.find(t => t.value === type);
    return chartType ? chartType.label : 'Select Chart Type';
  }

  // Update chart options with theme colors
  private updateChartOptionsColors(): void {
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-color').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();
    const primaryColor = style.getPropertyValue('--primary-color').trim();
    const primaryColorRgb = style.getPropertyValue('--primary-rgb').trim();

    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: {
              family: "'Montserrat', sans-serif",
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: {
            family: "'Montserrat', sans-serif",
            size: 13,
          },
          bodyFont: {
            family: "'Montserrat', sans-serif",
            size: 12,
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: borderColor,
            drawBorder: false,
          },
          ticks: {
            color: textColor,
            font: {
              family: "'Montserrat', sans-serif",
              size: 11,
            },
          },
        },
        y: {
          grid: {
            color: borderColor,
            drawBorder: false,
          },
          ticks: {
            color: textColor,
            font: {
              family: "'Montserrat', sans-serif",
              size: 11,
            },
          },
        },
      },
    };
  }

  // Update the existing updateChartData method
  updateChartData() {
    const formValues = this.chartForm.value;
    if (
      !formValues.xAxis?.value ||
      !formValues.yAxis?.value ||
      !this.queryResults.length
    ) {
      this.chartData = {};
      return;
    }

    const xAxisField = formValues.xAxis.value;
    const yAxisField = formValues.yAxis.value;

    const labels = this.queryResults.map(row => row[xAxisField]);
    const data = this.queryResults.map(row => row[yAxisField]);
    const style = getComputedStyle(document.documentElement);
    const primaryColorRgb = style.getPropertyValue('--primary-rgb').trim();

    // For pie charts, aggregate data by unique labels
    if (formValues.chartType === 'pie') {
      const aggregatedData = labels.reduce((acc, label, index) => {
        if (!acc[label]) {
          acc[label] = 0;
        }
        acc[label] += data[index];
        return acc;
      }, {});

      this.chartData = {
        labels: Object.keys(aggregatedData),
        datasets: [
          {
            data: Object.values(aggregatedData),
            backgroundColor: this.generateColors(
              Object.keys(aggregatedData).length
            ),
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 1,
          },
        ],
      };
    } else {
      // For other chart types
      this.chartData = {
        labels,
        datasets: [
          {
            label: formValues.yAxis.label,
            data,
            backgroundColor: `rgba(${primaryColorRgb}, 0.2)`,
            borderColor: `rgb(${primaryColorRgb})`,
            borderWidth: 1,
            tension: formValues.chartType === 'line' ? 0.4 : 0,
            pointBackgroundColor: `rgb(${primaryColorRgb})`,
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: `rgb(${primaryColorRgb})`,
          },
        ],
      };
    }

    // Update chart options with current theme colors
    this.updateChartOptionsColors();
  }

  // Generate random colors for pie chart
  private generateColors(count: number): string[] {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 360) / count;
      colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
  }

  // Watch for changes in selected axes and chart type
  ngDoCheck() {
    // Only update chart data if query results have actually changed
    if (this.queryResults.length > 0 && this.viewMode === 'graph') {
      this.updateChartData();
    }
  }

  // Update chart when query results change
  onQueryResultsUpdate() {
    this.updateChartData();
  }

  onAxisChange() {
    this.updateChartData();
  }

  canGenerateChart(): boolean {
    const formValues = this.chartForm.value;
    return (
      !this.isGeneratingChart &&
      this.queryResults.length > 0 &&
      formValues.xAxis?.value &&
      formValues.yAxis?.value
    );
  }

  getGenerateChartTooltip(): string {
    const formValues = this.chartForm.value;
    if (!this.queryResults.length) {
      return 'Execute a query to get data for the chart';
    }
    if (!formValues.xAxis?.value || !formValues.yAxis?.value) {
      return 'Select both X and Y axes to generate chart';
    }
    return 'Generate chart with selected axes';
  }

  // Generate chart method
  generateChart(): void {
    if (!this.canGenerateChart()) return;

    this.isGeneratingChart = true;
    this.showChart = false;

    // Simulate chart generation delay
    setTimeout(() => {
      this.updateChartData();
      this.showChart = true;
      this.isGeneratingChart = false;

      // Force chart update
      if (this.chart) {
        setTimeout(() => {
          this.chart.refresh();
        }, 100);
      }
    }, 800); // Simulate processing time
  }

  onFormChange() {
    const formValues = this.chartForm.value;
    this.selectedXAxis = formValues.xAxis;
    this.selectedYAxis = formValues.yAxis;
    this.selectedChartType = formValues.chartType;
    this.updateChartData();
  }

  // Format SQL method
  formatSQL(): void {
    if (!this.editor) return;

    const currentSQL = this.editor.getValue();
    if (!currentSQL.trim()) return;

    try {
      const formattedSQL = this.formatSQLString(currentSQL);
      this.editor.setValue(formattedSQL);
      this.editor.getAction('editor.action.formatDocument').run();
    } catch (error) {
      console.error('Error formatting SQL:', error);
    }
  }

  private formatSQLString(sql: string): string {
    // Remove extra whitespace and normalize
    let formatted = sql.replace(/\s+/g, ' ').trim();

    // Add line breaks before major SQL keywords
    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'GROUP BY',
      'HAVING',
      'ORDER BY',
      'INSERT INTO',
      'UPDATE',
      'DELETE FROM',
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP TABLE',
      'JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'INNER JOIN',
      'OUTER JOIN',
      'UNION',
      'INTERSECT',
      'EXCEPT',
    ];

    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      formatted = formatted.replace(regex, `\n${keyword}`);
    });

    // Handle subqueries and parentheses
    formatted = formatted.replace(/\(\s*SELECT/gi, '(\n    SELECT');
    formatted = formatted.replace(/\)\s*([,;])/gi, '\n)$1');

    // Add proper indentation
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentSize = '    ';

    const formattedLines = lines.map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return '';

      // Decrease indent for closing parentheses
      if (trimmedLine.startsWith(')')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indentedLine = indentSize.repeat(indentLevel) + trimmedLine;

      // Increase indent for opening parentheses and subqueries
      if (trimmedLine.includes('(') && !trimmedLine.includes(')')) {
        indentLevel++;
      }

      return indentedLine;
    });

    // Clean up and return
    return formattedLines.join('\n').replace(/^\s*\n/gm, '');
  }

  // Auto-save methods
  toggleAutoSave(): void {
    this.isAutoSaveEnabled = !this.isAutoSaveEnabled;
    if (this.isAutoSaveEnabled) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
      this.autoSaveStatus = 'idle';
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave();
    }, this.autoSaveInterval);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private performAutoSave(): void {
    if (!this.isAutoSaveEnabled) return;

    this.autoSaveStatus = 'saving';

    // Simulate save operation
    setTimeout(() => {
      try {
        // Here you would implement actual save logic
        // For now, just simulate success
        this.autoSaveStatus = 'saved';

        // Show 'completed' status with animation after save
        setTimeout(() => {
          if (this.autoSaveStatus === 'saved') {
            this.autoSaveStatus = 'completed';

            // Brief animation period for completed status
            setTimeout(() => {
              if (this.autoSaveStatus === 'completed') {
                this.autoSaveStatus = 'idle';
              }
            }, 1500); // Show completed status for 1.5 seconds with animation
          }
        }, 1000); // Show saved status for 1 second before transitioning to completed

        // Schedule next auto-save
        if (this.isAutoSaveEnabled) {
          this.startAutoSave();
        }
      } catch (error) {
        this.autoSaveStatus = 'error';
        setTimeout(() => {
          if (this.autoSaveStatus === 'error') {
            this.autoSaveStatus = 'idle';
          }
        }, 3000);
      }
    }, 1000); // Simulate save delay
  }

  private triggerAutoSave(): void {
    if (this.isAutoSaveEnabled) {
      this.stopAutoSave();
      this.startAutoSave();
    }
  }

  ngOnDestroy(): void {
    // Dispose Monaco editor
    if (this.editor) {
      this.editor.dispose();
    }
    
    // Dispose autocomplete provider
    if (this.suggestionProvider) {
      this.suggestionProvider.dispose();
    }
    
    // Clean up theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
    
    // Stop auto-save
    this.stopAutoSave();
    
    // Clear autocomplete caches
    this.tableAliases.clear();
    this.suggestionCache.clear();
    this.frequentlyUsed.clear();
  }
}
