import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { TreeNode, MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { QueryService } from '../../services/query.service';
// Removed Chart.js imports - using ngx-charts instead
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunQueryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('monacoEditor', { static: false })
  monacoEditorElement!: ElementRef;

  // Removed chart ViewChild - using ngx-charts instead

  @ViewChild('databaseMenu') databaseMenu!: any;

  @ViewChild('saveMenu') saveMenu!: any;

  @ViewChild('autoSaveMenu') autoSaveMenu!: any;

  @ViewChild('tableContainer') tableContainer!: ElementRef;

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
  private readonly DEFAULT_QUERY = `SELECT * FROM dbexec_master.screen s;`;

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
  
  // Dynamic sizing properties
  private resizeObserver: ResizeObserver | null = null;

  // Fullscreen mode
  isFullscreen: boolean = false;

  // Results properties
  queryResults: QueryResult[] = [];
  resultColumns: string[] = [];
  executionTime: number = 0;

  // Custom table properties
  tableRowsPerPage: number = 50; // Increased to allow vertical scrolling
  currentPage: number = 0;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' | '' = '';
  private originalQueryResults: QueryResult[] = [];

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
  viewMode: 'table' | 'analytics' = 'table';
  selectedChartType: any = null;
  selectedChartInputs: any = {};

  columnOptions: any[] = [];
  numericColumns: any[] = [];
  categoricalColumns: any[] = [];
  dateColumns: any[] = [];

  // ngx-charts specific properties
  ngxChartData: any[] = [];
  selectedChartTheme: string = 'vivid';
  ngxChartScheme: any = {
    domain: [
      '#5AA454',
      '#A10A28',
      '#C7B42C',
      '#AAAAAA',
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#96CEB4',
      '#DDA0DD',
      '#F7DC6F',
    ],
  };
  
  // Chart theme options
  chartThemes = [
    {
      name: 'vivid',
      label: 'Vivid',
      domain: ['#5AA454', '#A10A28', '#C7B42C', '#AAAAAA', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#F7DC6F']
    },
    {
      name: 'natural',
      label: 'Natural',
      domain: ['#C7B42C', '#5AA454', '#A10A28', '#FFC658', '#82CA9D', '#8884D8', '#FFBB28', '#FF8042', '#0088FE', '#00C49F']
    },
    {
      name: 'cool',
      label: 'Cool',
      domain: ['#a8edea', '#fed6e3', '#d299c2', '#ffa726', '#42a5f5', '#66bb6a', '#ef5350', '#ab47bc', '#26c6da', '#78909c']
    },
    {
      name: 'fire',
      label: 'Fire',
      domain: ['#FF6B35', '#F7931E', '#FFD23F', '#EE964B', '#F06292', '#BA68C8', '#9575CD', '#7986CB', '#64B5F6', '#4FC3F7']
    },
    {
      name: 'solar',
      label: 'Solar',
      domain: ['#FFA726', '#FFCC02', '#FFAB00', '#FF8F00', '#FF6F00', '#E65100', '#BF360C', '#FF5722', '#FF9800', '#FB8C00']
    },
    {
      name: 'air',
      label: 'Air',
      domain: ['#CED4DA', '#ADB5BD', '#6C757D', '#495057', '#343A40', '#E9ECEF', '#F8F9FA', '#DEE2E6', '#868E96', '#212529']
    },
    {
      name: 'aqua',
      label: 'Aqua',
      domain: ['#1DE9B6', '#00BCD4', '#03DAC6', '#18FFFF', '#64FFDA', '#A7FFEB', '#4DD0E1', '#26C6DA', '#00ACC1', '#0097A7']
    },
    {
      name: 'flame',
      label: 'Flame',
      domain: ['#D32F2F', '#F57C00', '#FBC02D', '#689F38', '#1976D2', '#512DA8', '#C2185B', '#00796B', '#455A64', '#37474F']
    }
  ];
  
  ngxChartView: [number, number] = [700, 400];
  showXAxis = true;
  showYAxis = true;
  gradient = false;
  showLegend = true;
  showXAxisLabel = true;
  showYAxisLabel = true;
  xAxisLabel = '';
  yAxisLabel = '';
  animations = true;
  showGridLines = true;
  roundDomains = true;

  // Additional ngx-charts options
  legendTitle = '';
  legendPosition: 'below' | 'right' = 'below';
  showLegendTitle = false;
  showDataLabel = false;
  
  // Custom label properties (separate from auto-generated ones)
  customXAxisLabel = '';
  customYAxisLabel = '';
  // Comprehensive chart type configuration for ngx-charts
  chartTypes = [
    {
      label: 'Vertical Bar',
      value: 'bar-vertical',
      icon: 'pi pi-chart-bar',
      description: 'Compare values across categories',
      inputs: [
        {
          name: 'xAxis',
          label: 'X-Axis (Categories)',
          type: 'categorical',
          required: true,
        },
        {
          name: 'yAxis',
          label: 'Y-Axis (Values)',
          type: 'numeric',
          required: true,
        },
      ],
    },
    {
      label: 'Horizontal Bar',
      value: 'bar-horizontal',
      icon: 'pi pi-bars',
      description: 'Compare values with horizontal bars',
      inputs: [
        {
          name: 'xAxis',
          label: 'Categories',
          type: 'categorical',
          required: true,
        },
        { name: 'yAxis', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Grouped Bar',
      value: 'bar-vertical-grouped',
      icon: 'pi pi-chart-bar',
      description: 'Compare multiple series across categories',
      inputs: [
        {
          name: 'xAxis',
          label: 'X-Axis (Categories)',
          type: 'categorical',
          required: true,
        },
        {
          name: 'yAxis',
          label: 'Y-Axis (Values)',
          type: 'numeric',
          required: true,
          multiple: true,
        },
        {
          name: 'groupBy',
          label: 'Group By',
          type: 'categorical',
          required: false,
        },
      ],
    },
    {
      label: 'Line',
      value: 'line-chart',
      icon: 'pi pi-chart-line',
      description: 'Show trends over time or categories',
      inputs: [
        { name: 'xAxis', label: 'X-Axis', type: 'any', required: true },
        {
          name: 'yAxis',
          label: 'Y-Axis (Values)',
          type: 'numeric',
          required: true,
          multiple: true,
        },
      ],
    },
    {
      label: 'Area',
      value: 'area-chart',
      icon: 'pi pi-chart-line',
      description: 'Show cumulative trends',
      inputs: [
        { name: 'xAxis', label: 'X-Axis', type: 'any', required: true },
        {
          name: 'yAxis',
          label: 'Y-Axis (Values)',
          type: 'numeric',
          required: true,
          multiple: true,
        },
      ],
    },
    {
      label: 'Pie',
      value: 'pie-chart',
      icon: 'pi pi-chart-pie',
      description: 'Show proportions of a whole',
      inputs: [
        {
          name: 'labels',
          label: 'Labels',
          type: 'categorical',
          required: true,
        },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Advanced Pie',
      value: 'pie-chart-advanced',
      icon: 'pi pi-chart-pie',
      description: 'Pie chart with exploded slices',
      inputs: [
        {
          name: 'labels',
          label: 'Labels',
          type: 'categorical',
          required: true,
        },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Donut',
      value: 'pie-chart-grid',
      icon: 'pi pi-circle',
      description: 'Pie chart with center hole',
      inputs: [
        {
          name: 'labels',
          label: 'Labels',
          type: 'categorical',
          required: true,
        },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Bubble',
      value: 'bubble-chart',
      icon: 'pi pi-circle',
      description: 'Show relationships between 3 variables',
      inputs: [
        { name: 'xAxis', label: 'X-Axis', type: 'numeric', required: true },
        { name: 'yAxis', label: 'Y-Axis', type: 'numeric', required: true },
        { name: 'size', label: 'Bubble Size', type: 'numeric', required: true },
        {
          name: 'groupBy',
          label: 'Group By',
          type: 'categorical',
          required: false,
        },
      ],
    },
    {
      label: 'Heatmap',
      value: 'heat-map',
      icon: 'pi pi-th-large',
      description: 'Show patterns in matrix data',
      inputs: [
        { name: 'xAxis', label: 'X-Axis', type: 'categorical', required: true },
        { name: 'yAxis', label: 'Y-Axis', type: 'categorical', required: true },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Tree Map',
      value: 'tree-map',
      icon: 'pi pi-sitemap',
      description: 'Show hierarchical data as rectangles',
      inputs: [
        {
          name: 'labels',
          label: 'Labels',
          type: 'categorical',
          required: true,
        },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
        {
          name: 'groupBy',
          label: 'Group By',
          type: 'categorical',
          required: false,
        },
      ],
    },
    {
      label: 'Number Cards',
      value: 'number-card',
      icon: 'pi pi-id-card',
      description: 'Display key metrics',
      inputs: [
        {
          name: 'labels',
          label: 'Labels',
          type: 'categorical',
          required: true,
        },
        { name: 'values', label: 'Values', type: 'numeric', required: true },
      ],
    },
    {
      label: 'Gauge',
      value: 'gauge',
      icon: 'pi pi-compass',
      description: 'Show single value against a scale',
      inputs: [
        {
          name: 'value',
          label: 'Value',
          type: 'numeric',
          required: true,
          single: true,
        },
        {
          name: 'label',
          label: 'Label',
          type: 'categorical',
          required: false,
          single: true,
        },
      ],
    },
    {
      label: 'Linear Gauge',
      value: 'linear-gauge',
      icon: 'pi pi-minus',
      description: 'Horizontal gauge display',
      inputs: [
        {
          name: 'value',
          label: 'Value',
          type: 'numeric',
          required: true,
          single: true,
        },
        {
          name: 'label',
          label: 'Label',
          type: 'categorical',
          required: false,
          single: true,
        },
      ],
    },
  ];

  // Chart generation properties
  isGeneratingChart: boolean = false;
  showChart: boolean = false;
  showChartPopup: boolean = false;

  // Form group
  chartForm: FormGroup;

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private fb: FormBuilder,
    private httpClientService: HttpClientService,
    private queryService: QueryService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    // Initialize form with chart type selection only
    this.chartForm = this.fb.group({
      chartType: [null, Validators.required],
    });

    // Subscribe to chart type changes to dynamically update form
    this.chartForm.get('chartType')?.valueChanges.subscribe(chartType => {
      if (chartType) {
        this.onChartTypeChange(chartType);
      }
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
      // Trigger change detection for the selected org
      this.cdr.detectChanges();
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
    
    // Setup window resize listener for responsive panel sizing
    this.setupWindowResizeListener();
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
          this.setupWindowResizeListener();
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
          wordBasedSuggestions: false,
          suggestSelection: 'first',
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          quickSuggestionsDelay: 10,
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

    // Register PERFECT SQL completion provider
    this.suggestionProvider = monaco.languages.registerCompletionItemProvider(
      'sql',
      {
        triggerCharacters: ['.', ' ', '\t'],
        provideCompletionItems: (model: any, position: any) => {
          try {
            return this.providePerfectCompletions(model, position);
          } catch (error) {
            console.error('Autocomplete error:', error);
            return { suggestions: [], incomplete: false };
          }
        },
      }
    );
  }

  private providePerfectCompletions(model: any, position: any): any {
    // PERFECT SQL AUTOCOMPLETE SYSTEM
    const fullQuery = model.getValue();
    const cursorOffset = model.getOffsetAt(position);
    const word = model.getWordUntilPosition(position);
    const currentWord = word.word;

    // Build comprehensive query context
    const queryInfo = this.buildPerfectQueryContext(
      fullQuery,
      cursorOffset,
      currentWord
    );

    // Generate intelligent suggestions
    const suggestions = this.generateIntelligentSuggestions(queryInfo, {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    });

    // Apply perfect scoring and sorting
    return {
      suggestions: this.perfectSuggestionSort(suggestions, currentWord),
      incomplete: false,
    };
  }

  private buildPerfectQueryContext(
    fullQuery: string,
    cursorOffset: number,
    currentWord: string
  ): any {
    // Extract complete query structure
    this.extractTableAliases(fullQuery);

    const beforeCursor = fullQuery.substring(0, cursorOffset);
    const afterCursor = fullQuery.substring(cursorOffset);
    const nearCursor = fullQuery.substring(
      Math.max(0, cursorOffset - 100),
      cursorOffset + 100
    );

    // Intelligent SQL parsing
    const queryStructure = this.parseQueryStructure(fullQuery);
    const currentClause = this.detectCurrentClause(beforeCursor);
    const expectation = this.determineExpectation(
      beforeCursor,
      currentWord,
      queryStructure
    );

    return {
      fullQuery,
      beforeCursor,
      afterCursor,
      nearCursor,
      currentWord,
      cursorOffset,
      queryStructure,
      currentClause,
      expectation,
      availableSchemas: this.getAvailableSchemas(),
      availableTables: this.getAvailableTablesFromContext(queryStructure),
      availableColumns: this.getAvailableColumnsFromContext(queryStructure),
      existingAliases: Array.from(this.tableAliases.entries()),
    };
  }

  private parseQueryStructure(query: string): any {
    const structure = {
      type: 'unknown',
      mainTable: null,
      joinedTables: [],
      aliases: new Map(),
      schemas: new Set(),
      columns: new Set(),
      clauses: {
        select: null,
        from: null,
        joins: [],
        where: null,
        groupBy: null,
        having: null,
        orderBy: null,
        limit: null,
      },
    };

    try {
      // Use existing parser or create enhanced one
      const ast = parse(query);
      this.processASTIntoStructure(ast, structure);
    } catch {
      // Fallback to regex parsing
      this.parseWithRegex(query, structure);
    }

    return structure;
  }

  private processASTIntoStructure(ast: any, structure: any): void {
    for (const stmt of ast) {
      if (stmt.type === 'select') {
        structure.type = 'select';

        // Process FROM clause
        if (stmt.from) {
          for (const from of stmt.from) {
            this.processFromClause(from, structure);
          }
        }

        // Process JOINs
        if (stmt.join) {
          for (const join of stmt.join) {
            this.processJoinClause(join, structure);
          }
        }

        // Process SELECT columns
        if (stmt.columns) {
          for (const col of stmt.columns) {
            this.processSelectColumn(col, structure);
          }
        }
      }
    }
  }

  private processFromClause(from: any, structure: any): void {
    if (from.type === 'table') {
      const tableName = from.name?.name || from.name;
      const alias = from.alias?.name || tableName;

      structure.mainTable = tableName;
      structure.aliases.set(alias, tableName);
      this.tableAliases.set(alias, tableName);

      // Extract schema
      if (tableName.includes('.')) {
        const [schema] = tableName.split('.');
        structure.schemas.add(schema);
      }
    }
  }

  private processJoinClause(join: any, structure: any): void {
    if (join.from?.type === 'table') {
      const tableName = join.from.name?.name || join.from.name;
      const alias = join.from.alias?.name || tableName;

      structure.joinedTables.push({
        table: tableName,
        alias: alias,
        type: join.type || 'inner',
      });

      structure.aliases.set(alias, tableName);
      this.tableAliases.set(alias, tableName);

      if (tableName.includes('.')) {
        const [schema] = tableName.split('.');
        structure.schemas.add(schema);
      }
    }
  }

  private processSelectColumn(col: any, structure: any): void {
    if (col.expr?.column) {
      structure.columns.add(col.expr.column);
    }
  }

  private parseWithRegex(query: string, structure: any): void {
    const queryLower = query.toLowerCase();

    // Detect query type
    if (queryLower.includes('select')) structure.type = 'select';
    else if (queryLower.includes('insert')) structure.type = 'insert';
    else if (queryLower.includes('update')) structure.type = 'update';
    else if (queryLower.includes('delete')) structure.type = 'delete';

    // Extract tables and aliases with enhanced patterns
    const patterns = [
      /\bfrom\s+(\w+(?:\.\w+)?)\s*(?:(?:as\s+)?(\w+))?\s*/gi,
      /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\s+(\w+(?:\.\w+)?)\s*(?:(?:as\s+)?(\w+))?\s*/gi,
      /\bupdate\s+(\w+(?:\.\w+)?)\s*(?:(?:as\s+)?(\w+))?\s*/gi,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const tableName = match[1];
        const alias = match[2] || tableName.split('.').pop() || tableName;

        if (!structure.mainTable) {
          structure.mainTable = tableName;
        } else {
          structure.joinedTables.push({
            table: tableName,
            alias,
            type: 'join',
          });
        }

        structure.aliases.set(alias, tableName);
        this.tableAliases.set(alias, tableName);

        if (tableName.includes('.')) {
          const [schema] = tableName.split('.');
          structure.schemas.add(schema);
        }
      }
    });
  }

  private detectCurrentClause(beforeCursor: string): string {
    const text = beforeCursor.toLowerCase();
    const clauses = [
      { name: 'select', pattern: /\bselect\b.*$/i },
      {
        name: 'from',
        pattern: /\bfrom\b[^(where|group|order|having|limit)]*$/i,
      },
      {
        name: 'join',
        pattern:
          /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\b[^(where|group|order|having)]*$/i,
      },
      { name: 'where', pattern: /\bwhere\b[^(group|order|having|limit)]*$/i },
      { name: 'on', pattern: /\bon\b[^(where|group|order|having)]*$/i },
      { name: 'group', pattern: /\bgroup\s+by\b[^(order|having|limit)]*$/i },
      { name: 'having', pattern: /\bhaving\b[^(order|limit)]*$/i },
      { name: 'order', pattern: /\border\s+by\b[^limit]*$/i },
      { name: 'limit', pattern: /\blimit\b.*$/i },
    ];

    for (const clause of clauses) {
      if (clause.pattern.test(text)) {
        return clause.name;
      }
    }

    return 'unknown';
  }

  private determineExpectation(
    beforeCursor: string,
    currentWord: string,
    queryStructure: any
  ): any {
    const text = beforeCursor.toLowerCase();
    const lastWord = text.match(/\b(\w+)\s*$/)?.[1] || '';

    // Dot notation check
    if (currentWord.includes('.') || beforeCursor.endsWith('.')) {
      const beforeDot = beforeCursor.match(/(\w+)\.\w*$/)?.[1];
      if (beforeDot) {
        return {
          type: 'dot_notation',
          beforeDot,
          expectColumns: this.isTableOrAlias(beforeDot),
          expectTables: this.isSchemaName(beforeDot),
        };
      }
    }

    // Context-based expectations
    const expectations = [
      // Keywords expecting tables
      {
        pattern:
          /\b(from|join|inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join)\s*\w*$/i,
        expectation: {
          type: 'table_or_schema',
          withAlias: /join/i.test(lastWord),
        },
      },
      // Keywords expecting columns
      {
        pattern:
          /\b(select|where|having|and|or|on|group\s+by|order\s+by)\s*\w*$/i,
        expectation: { type: 'column' },
      },
      // After table names expecting keywords
      {
        pattern: /\bfrom\s+\w+(?:\.\w+)?(?:\s+\w+)?\s*\w*$/i,
        expectation: {
          type: 'keyword',
          keywords: [
            'WHERE',
            'JOIN',
            'INNER JOIN',
            'LEFT JOIN',
            'RIGHT JOIN',
            'ORDER BY',
            'GROUP BY',
            'LIMIT',
          ],
        },
      },
      // After WHERE conditions
      {
        pattern: /\bwhere\s+\w+\s*[=<>!]+\s*\w+\s*\w*$/i,
        expectation: {
          type: 'keyword',
          keywords: ['AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT'],
        },
      },
      // Start of query
      {
        pattern: /^\s*\w*$/i,
        expectation: {
          type: 'keyword',
          keywords: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        },
      },
    ];

    for (const { pattern, expectation } of expectations) {
      if (pattern.test(text)) {
        return expectation;
      }
    }

    return { type: 'unknown' };
  }

  private generateIntelligentSuggestions(queryInfo: any, range: any): any[] {
    const suggestions: any[] = [];
    const { expectation, currentWord } = queryInfo;

    switch (expectation.type) {
      case 'dot_notation':
        this.addPerfectDotSuggestions(suggestions, range, queryInfo);
        break;

      case 'table_or_schema':
        if (expectation.withAlias) {
          this.addPerfectTableWithAliasSuggestions(
            suggestions,
            range,
            queryInfo
          );
        } else {
          this.addPerfectSchemaSuggestions(suggestions, range, queryInfo);
        }
        break;

      case 'column':
        this.addPerfectColumnSuggestions(suggestions, range, queryInfo);
        break;

      case 'keyword':
        this.addPerfectKeywordSuggestions(suggestions, range, queryInfo);
        break;

      default:
        this.addContextualSuggestions(suggestions, range, queryInfo);
        break;
    }

    return suggestions;
  }

  private addPerfectDotSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { expectation, currentWord } = queryInfo;
    const beforeDot = expectation.beforeDot;

    if (expectation.expectColumns) {
      // After table/alias dot - suggest columns
      this.addColumnsForTable(suggestions, range, currentWord, beforeDot);
    } else if (expectation.expectTables) {
      // After schema dot - suggest tables with aliases
      this.addTablesInSchema(suggestions, range, currentWord, beforeDot);
    }
  }

  private addPerfectSchemaSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { currentWord } = queryInfo;
    const schemas = this.getAvailableSchemas();

    schemas.forEach(schema => {
      if (this.perfectMatch(schema, currentWord)) {
        suggestions.push({
          label: schema,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schema,
          range: range,
          detail: `📁 Schema`,
          documentation: `Schema: ${schema}`,
          sortText: `0_${schema}`,
          score: this.calculatePerfectScore(schema, currentWord),
        });
      }
    });
  }

  private addPerfectTableWithAliasSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { currentWord } = queryInfo;

    // Add schemas first
    this.addPerfectSchemaSuggestions(suggestions, range, queryInfo);

    // Add direct table suggestions with smart aliases
    Object.keys(this.schema).forEach(fullTableName => {
      const tableName = fullTableName.split('.').pop() || fullTableName;

      if (
        this.perfectMatch(tableName, currentWord) ||
        this.perfectMatch(fullTableName, currentWord)
      ) {
        const alias = this.generateUniqueTableAlias(tableName);
        const insertText = `${fullTableName} ${alias}`;

        suggestions.push({
          label: `${fullTableName} ${alias}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: insertText,
          range: range,
          detail: `📋 Table with alias`,
          documentation: `Table: ${fullTableName}\nAlias: ${alias}\nColumns: ${this.schema[
            fullTableName
          ].join(', ')}`,
          sortText: `1_${tableName}`,
          score: this.calculatePerfectScore(tableName, currentWord),
        });
      }
    });
  }

  private addPerfectColumnSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { currentWord, queryStructure } = queryInfo;
    const availableTables = this.getAvailableTablesFromContext(queryStructure);
    const addedColumns = new Set<string>();

    // Add columns from available tables with context info
    availableTables.forEach(({ table, alias }) => {
      const fullTableName = this.resolveFullTableName(table);
      if (fullTableName && this.schema[fullTableName]) {
        this.schema[fullTableName].forEach(column => {
          if (
            this.perfectMatch(column, currentWord) &&
            !addedColumns.has(column)
          ) {
            addedColumns.add(column);

            suggestions.push({
              label: column,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: column,
              range: range,
              detail: `🔹 Column from ${alias || table}`,
              documentation: `Column: ${column}\nTable: ${table}\nAlias: ${
                alias || 'None'
              }`,
              sortText: `0_${column}`,
              score: this.calculatePerfectScore(column, currentWord),
            });
          }
        });
      }
    });
  }

  private addPerfectKeywordSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { currentWord, expectation } = queryInfo;
    const keywords = expectation.keywords || [];

    keywords.forEach((keyword: string) => {
      if (this.perfectMatch(keyword, currentWord)) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range: range,
          detail: `🔤 SQL Keyword`,
          documentation: `SQL Keyword: ${keyword}`,
          sortText: `0_${keyword}`,
          score: this.calculatePerfectScore(keyword, currentWord),
        });
      }
    });
  }

  private addContextualSuggestions(
    suggestions: any[],
    range: any,
    queryInfo: any
  ): void {
    const { currentWord } = queryInfo;

    // Add most relevant suggestions based on context
    this.addPerfectSchemaSuggestions(suggestions, range, queryInfo);
    this.addPerfectColumnSuggestions(suggestions, range, queryInfo);

    // Add common SQL keywords
    const commonKeywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'JOIN',
      'ORDER BY',
      'GROUP BY',
      'LIMIT',
    ];
    commonKeywords.forEach(keyword => {
      if (this.perfectMatch(keyword, currentWord)) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range: range,
          detail: `🔤 SQL Keyword`,
          documentation: `SQL Keyword: ${keyword}`,
          sortText: `2_${keyword}`,
          score: this.calculatePerfectScore(keyword, currentWord),
        });
      }
    });
  }

  private addTablesInSchema(
    suggestions: any[],
    range: any,
    currentWord: string,
    schemaName: string
  ): void {
    if (this.schemaMetadata[schemaName]) {
      const tables = this.schemaMetadata[schemaName];
      Object.keys(tables).forEach(tableName => {
        if (this.perfectMatch(tableName, currentWord)) {
          const alias = this.generateUniqueTableAlias(tableName);

          suggestions.push({
            label: `${tableName} ${alias}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `${tableName} ${alias}`,
            range: range,
            detail: `📋 Table with alias`,
            documentation: `Table: ${schemaName}.${tableName}\nAlias: ${alias}\nColumns: ${tables[
              tableName
            ].join(', ')}`,
            sortText: `0_${tableName}`,
            score: this.calculatePerfectScore(tableName, currentWord),
          });
        }
      });
    }
  }

  private getAvailableSchemas(): string[] {
    const schemas = new Set<string>();
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      if (parts.length > 1) {
        schemas.add(parts[0]);
      } else {
        schemas.add('public');
      }
    });
    return Array.from(schemas);
  }

  private getAvailableTablesFromContext(queryStructure: any): any[] {
    const tables: any[] = [];

    if (queryStructure.mainTable) {
      const alias =
        queryStructure.aliases.get(queryStructure.mainTable) ||
        queryStructure.mainTable;
      tables.push({ table: queryStructure.mainTable, alias });
    }

    queryStructure.joinedTables.forEach((joined: any) => {
      tables.push({ table: joined.table, alias: joined.alias });
    });

    return tables;
  }

  private getAvailableColumnsFromContext(queryStructure: any): string[] {
    const columns = new Set<string>();
    const tables = this.getAvailableTablesFromContext(queryStructure);

    tables.forEach(({ table }) => {
      const fullTableName = this.resolveFullTableName(table);
      if (fullTableName && this.schema[fullTableName]) {
        this.schema[fullTableName].forEach(column => columns.add(column));
      }
    });

    return Array.from(columns);
  }

  private perfectMatch(suggestion: string, input: string): boolean {
    if (!input || input.trim() === '') return true;

    const suggestionLower = suggestion.toLowerCase();
    const inputLower = input.toLowerCase().trim();

    if (suggestionLower === inputLower) return false;

    // Perfect matching algorithm
    return (
      suggestionLower.startsWith(inputLower) ||
      suggestionLower.includes(inputLower) ||
      this.smartWordMatch(suggestionLower, inputLower) ||
      this.acronymMatch(suggestion, inputLower)
    );
  }

  private smartWordMatch(suggestion: string, input: string): boolean {
    if (suggestion.includes('_')) {
      return suggestion.split('_').some(word => word.startsWith(input));
    }
    return false;
  }

  private acronymMatch(suggestion: string, input: string): boolean {
    const capitals = suggestion.match(/[A-Z]/g);
    if (capitals) {
      return capitals.join('').toLowerCase().startsWith(input);
    }
    return false;
  }

  private calculatePerfectScore(suggestion: string, input: string): number {
    if (!input) return 50;

    const suggestionLower = suggestion.toLowerCase();
    const inputLower = input.toLowerCase();

    // Perfect scoring algorithm
    if (suggestionLower.startsWith(inputLower)) return 100;
    if (suggestionLower.includes(inputLower)) return 80;
    if (this.smartWordMatch(suggestionLower, inputLower)) return 70;
    if (this.acronymMatch(suggestion, inputLower)) return 60;

    return 40;
  }

  private perfectSuggestionSort(
    suggestions: any[],
    currentWord: string
  ): any[] {
    return suggestions
      .filter(s => s.score > 30)
      .sort((a, b) => {
        // Sort by score (descending)
        if (b.score !== a.score) return b.score - a.score;

        // Sort by type priority
        const typePriority: { [key: string]: number } = {
          '0_': 0,
          '1_': 1,
          '2_': 2,
        };
        const aPriority = typePriority[a.sortText?.substring(0, 2) || ''] ?? 3;
        const bPriority = typePriority[b.sortText?.substring(0, 2) || ''] ?? 3;
        if (aPriority !== bPriority) return aPriority - bPriority;

        // Sort by length (shorter first)
        if (a.label.length !== b.label.length)
          return a.label.length - b.label.length;

        // Sort alphabetically
        return a.label.localeCompare(b.label);
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
    // Enhanced regex patterns for complex queries
    const patterns = [
      // FROM table AS alias | FROM table alias | FROM schema.table AS alias | FROM schema.table alias
      /\bfrom\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi,
      // JOIN variations with aliases
      /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi,
      // UPDATE table AS alias
      /\bupdate\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi,
      // DELETE FROM table AS alias
      /\bdelete\s+from\s+(\w+(?:\.\w+)?)(?:\s+(?:as\s+)?(\w+))?/gi,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        const tableName = match[1];
        const alias = match[2] || tableName.split('.').pop() || tableName;

        if (
          alias &&
          tableName &&
          alias.toLowerCase() !== tableName.toLowerCase()
        ) {
          this.tableAliases.set(alias, tableName);
        }

        // Also add the table name itself for direct access
        const tableOnly = tableName.split('.').pop();
        if (tableOnly && tableOnly !== alias) {
          this.tableAliases.set(tableOnly, tableName);
        }
      }
    });
  }

  private getPreciseQueryContext(
    lineBeforeCursor: string,
    fullQuery: string,
    currentWord: string,
    absoluteCursorPosition?: number
  ): any {
    const line = lineBeforeCursor.toLowerCase().trim();

    // Enhanced context detection that considers full query, not just line before cursor
    const fullQueryLower = fullQuery.toLowerCase();
    const cursorPosition = absoluteCursorPosition || lineBeforeCursor.length;

    // Check for dot notation (schema.table or table.column or alias.column)
    if (currentWord.includes('.') || lineBeforeCursor.endsWith('.')) {
      const dotMatch = lineBeforeCursor.match(/(\w+)\.(\w*)$/);
      const beforeDot = dotMatch
        ? dotMatch[1]
        : lineBeforeCursor.match(/(\w+)\.\s*$/)?.[1];

      if (beforeDot) {
        const isSchema = this.isSchemaName(beforeDot);
        const isTableOrAlias = this.isTableOrAlias(beforeDot);

        return {
          afterDot: true,
          beforeDot: beforeDot,
          expectingColumn: isTableOrAlias,
          expectingTable: isSchema,
          isSchema: isSchema,
          isTableOrAlias: isTableOrAlias,
        };
      }
    }

    // Context-specific patterns - Enhanced to work anywhere in query

    // Find the context around the cursor position in the full query
    const beforeCursor = fullQuery.substring(0, cursorPosition);
    const afterCursor = fullQuery.substring(cursorPosition);
    const queryContext = this.analyzeQueryContext(
      beforeCursor,
      afterCursor,
      currentWord
    );

    if (queryContext) {
      return queryContext;
    }

    // Fallback to line-based patterns
    // 1. After FROM/JOIN - expect schemas only (not the keyword again)
    if (
      /\b(from|join|inner\s+join|left\s+join|right\s+join|cross\s+join)\s+$/i.test(
        line
      )
    ) {
      return {
        expectingTable: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 1b. Also handle partial typing after FROM/JOIN
    if (
      /\b(from|join|inner\s+join|left\s+join|right\s+join|cross\s+join)\s+\w+$/i.test(
        line
      )
    ) {
      return {
        expectingTable: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 2. After SELECT - expect columns only (not SELECT again)
    if (/\bselect\s+$/i.test(line)) {
      const table = this.findTableInFromClause(fullQuery);
      return {
        expectingColumn: true,
        availableTables: table
          ? [table]
          : this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 3. After comma in SELECT - expect columns
    if (/,\s*$/i.test(line) && /\bselect\b/i.test(fullQuery)) {
      const table = this.findTableInFromClause(fullQuery);
      return {
        expectingColumn: true,
        availableTables: table
          ? [table]
          : this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 3a. After table name in FROM clause - expect JOIN keywords or WHERE
    if (/\bfrom\s+\w+(?:\.\w+)?\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: [
          'WHERE',
          'JOIN',
          'INNER JOIN',
          'LEFT JOIN',
          'RIGHT JOIN',
          'FULL JOIN',
          'CROSS JOIN',
          'ORDER BY',
          'GROUP BY',
          'LIMIT',
        ],
      };
    }

    // 3b. After table alias in FROM clause - expect JOIN keywords or WHERE
    if (/\bfrom\s+\w+(?:\.\w+)?\s+\w+\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: [
          'WHERE',
          'JOIN',
          'INNER JOIN',
          'LEFT JOIN',
          'RIGHT JOIN',
          'FULL JOIN',
          'CROSS JOIN',
          'ORDER BY',
          'GROUP BY',
          'LIMIT',
        ],
      };
    }

    // 3c. After JOIN keywords - expect schema names or tables with aliases
    if (
      /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\s*$/i.test(
        line
      )
    ) {
      return {
        expectingTableWithAlias: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 4. After WHERE/HAVING/AND/OR - expect columns
    if (/\b(where|having|and|or)\s+$/i.test(line)) {
      return {
        expectingColumn: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 5. After ON (join condition) - expect columns
    if (/\bon\s+$/i.test(line)) {
      return {
        expectingColumn: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 6. After ORDER BY/GROUP BY - expect columns
    if (/\b(order\s+by|group\s+by)\s+$/i.test(line)) {
      return {
        expectingColumn: true,
        availableTables: this.getAvailableTablesInContext(fullQuery),
      };
    }

    // 6a. After WHERE condition - expect AND/OR/ORDER BY/GROUP BY/LIMIT
    if (/\bwhere\s+\w+\s*(=|>|<|>=|<=|!=|<>)\s*\w+\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT'],
      };
    }

    // 6b. After JOIN table - expect ON
    if (
      /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\s+\w+(?:\.\w+)?(?:\s+\w+)?\s*$/i.test(
        line
      )
    ) {
      return {
        expectingKeyword: true,
        keywords: ['ON'],
      };
    }

    // 6c. After JOIN ON condition - expect AND/OR/WHERE/ORDER BY/GROUP BY/LIMIT
    if (/\bon\s+\w+\s*(=|>|<|>=|<=|!=|<>)\s*\w+\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: [
          'AND',
          'OR',
          'WHERE',
          'JOIN',
          'INNER JOIN',
          'LEFT JOIN',
          'RIGHT JOIN',
          'ORDER BY',
          'GROUP BY',
          'LIMIT',
        ],
      };
    }

    // 6d. After ORDER BY column - expect ASC/DESC/LIMIT
    if (/\border\s+by\s+\w+(?:\.\w+)?\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['ASC', 'DESC', 'LIMIT'],
      };
    }

    // 6da. After ORDER BY column ASC/DESC - expect LIMIT
    if (/\border\s+by\s+\w+(?:\.\w+)?\s+(asc|desc)\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['LIMIT'],
      };
    }

    // 6e. After GROUP BY column - expect HAVING/ORDER BY/LIMIT
    if (/\bgroup\s+by\s+\w+(?:\.\w+)?\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['HAVING', 'ORDER BY', 'LIMIT'],
      };
    }

    // 7. Start of query or after semicolon - expect main keywords
    if (/^\s*$/i.test(line) || /;\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      };
    }

    // 8. After SELECT * - expect FROM only
    if (/\bselect\s+\*\s*$/i.test(line)) {
      return {
        expectingKeyword: true,
        keywords: ['FROM'],
      };
    }

    // 9. Partial keyword matching - only if typing incomplete keyword at start
    if (/^\s*[a-z]*$/i.test(line) && currentWord.length > 0) {
      const possibleKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
      const matchingKeywords = possibleKeywords.filter(
        k =>
          k.toLowerCase().startsWith(currentWord.toLowerCase()) &&
          k.toLowerCase() !== currentWord.toLowerCase()
      );

      if (matchingKeywords.length > 0) {
        return {
          expectingKeyword: true,
          keywords: matchingKeywords,
        };
      }
    }

    // 10. Partial keyword matching in any context
    if (currentWord.length > 0) {
      const allKeywords = [
        'SELECT',
        'FROM',
        'WHERE',
        'JOIN',
        'INNER JOIN',
        'LEFT JOIN',
        'RIGHT JOIN',
        'FULL JOIN',
        'CROSS JOIN',
        'ON',
        'AND',
        'OR',
        'ORDER BY',
        'GROUP BY',
        'HAVING',
        'LIMIT',
        'ASC',
        'DESC',
        'INSERT',
        'UPDATE',
        'DELETE',
        'CREATE',
        'ALTER',
        'DROP',
      ];

      const matchingKeywords = allKeywords.filter(
        k =>
          k.toLowerCase().startsWith(currentWord.toLowerCase()) &&
          k.toLowerCase() !== currentWord.toLowerCase()
      );

      if (matchingKeywords.length > 0) {
        return {
          expectingKeyword: true,
          keywords: matchingKeywords,
        };
      }
    }

    return {
      expectingTable: false,
      expectingColumn: false,
      afterDot: false,
      expectingKeyword: false,
    };
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

  private findTableInFromClause(sql: string): string | null {
    const fromMatch = sql.match(/\bfrom\s+(\w+)/i);
    return fromMatch ? fromMatch[1] : null;
  }

  private analyzeQueryContext(
    beforeCursor: string,
    afterCursor: string,
    currentWord: string
  ): any {
    const beforeLower = beforeCursor.toLowerCase();
    const wordBeforeCursor = beforeCursor.match(/(\w+)\s*$/)?.[1] || '';

    // Check if we're in the middle of typing after certain keywords
    const patterns = [
      // FROM context
      {
        pattern: /\bfrom\s+\w*$/i,
        context: { expectingTable: true },
      },
      // JOIN context
      {
        pattern:
          /\b(?:inner\s+join|left\s+join|right\s+join|full\s+join|cross\s+join|join)\s+\w*$/i,
        context: { expectingTableWithAlias: true },
      },
      // SELECT context
      {
        pattern: /\bselect\s+\w*$/i,
        context: { expectingColumn: true },
      },
      // WHERE context
      {
        pattern: /\bwhere\s+\w*$/i,
        context: { expectingColumn: true },
      },
      // ON context (join conditions)
      {
        pattern: /\bon\s+\w*$/i,
        context: { expectingColumn: true },
      },
      // ORDER BY context
      {
        pattern: /\border\s+by\s+\w*$/i,
        context: { expectingColumn: true },
      },
      // GROUP BY context
      {
        pattern: /\bgroup\s+by\s+\w*$/i,
        context: { expectingColumn: true },
      },
      // After WHERE conditions
      {
        pattern: /\bwhere\s+\w+\s*(=|>|<|>=|<=|!=|<>)\s*\w+\s+\w*$/i,
        context: {
          expectingKeyword: true,
          keywords: ['AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT'],
        },
      },
      // After FROM table
      {
        pattern: /\bfrom\s+\w+(?:\.\w+)?(?:\s+\w+)?\s+\w*$/i,
        context: {
          expectingKeyword: true,
          keywords: [
            'WHERE',
            'JOIN',
            'INNER JOIN',
            'LEFT JOIN',
            'RIGHT JOIN',
            'ORDER BY',
            'GROUP BY',
            'LIMIT',
          ],
        },
      },
    ];

    for (const { pattern, context } of patterns) {
      if (pattern.test(beforeCursor)) {
        return {
          ...context,
          availableTables: this.getAvailableTablesInContext(
            beforeCursor + afterCursor
          ),
        };
      }
    }

    return null;
  }

  private getAllTablesFromQuery(sql: string): string[] {
    const tables: string[] = [];

    // Add all aliased tables from the current query
    this.tableAliases.forEach((tableName, alias) => {
      tables.push(alias);
      if (alias !== tableName) {
        tables.push(tableName);
      }
    });

    return tables;
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

  private addTableSuggestions(
    suggestions: any[],
    range: any,
    currentWord: string
  ): void {
    // Only add schema names (not table names)
    const schemas = new Set<string>();

    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      if (parts.length > 1) {
        schemas.add(parts[0]);
      } else {
        schemas.add('public');
      }
    });

    schemas.forEach(schemaName => {
      if (this.matchesInput(schemaName, currentWord)) {
        suggestions.push({
          label: schemaName,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schemaName,
          range: range,
          detail: `📁 Schema`,
          documentation: `Schema: ${schemaName}`,
          sortText: `0_${schemaName}`,
        });
      }
    });
  }

  private addTableSuggestionsWithAlias(
    suggestions: any[],
    range: any,
    currentWord: string
  ): void {
    // Add schema names first
    const schemas = new Set<string>();

    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      if (parts.length > 1) {
        schemas.add(parts[0]);
      } else {
        schemas.add('public');
      }
    });

    schemas.forEach(schemaName => {
      if (this.matchesInput(schemaName, currentWord)) {
        suggestions.push({
          label: schemaName,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schemaName,
          range: range,
          detail: `📁 Schema`,
          documentation: `Schema: ${schemaName}`,
          sortText: `0_${schemaName}`,
        });
      }
    });

    // Also add direct table suggestions with aliases for JOIN context
    Object.keys(this.schema).forEach(fullTableName => {
      const parts = fullTableName.split('.');
      const schemaName = parts.length > 1 ? parts[0] : 'public';
      const tableName = parts[parts.length - 1];

      if (
        this.matchesInput(fullTableName, currentWord) ||
        this.matchesInput(tableName, currentWord)
      ) {
        const alias = this.generateUniqueTableAlias(tableName);
        const insertTextWithAlias = `${fullTableName} ${alias}`;

        suggestions.push({
          label: `${fullTableName} ${alias}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: insertTextWithAlias,
          range: range,
          detail: `📋 Table with alias`,
          documentation: `Table: ${fullTableName}\nAlias: ${alias}\nColumns: ${this.schema[
            fullTableName
          ].join(
            ', '
          )}\nUsage: SELECT ${alias}.column FROM ... JOIN ${fullTableName} ${alias}`,
          sortText: `1_${tableName}`,
        });
      }
    });
  }

  private addColumnSuggestions(
    suggestions: any[],
    range: any,
    currentWord: string,
    availableTables: string[],
    fullQuery: string
  ): void {
    const addedColumns = new Set<string>();

    // Get all available tables and aliases from the query
    const queryTables = this.getAllTablesFromQuery(fullQuery);
    const allAvailableTables = [...availableTables, ...queryTables];

    // Add columns from tables in current query context first
    allAvailableTables.forEach(tableName => {
      const fullTableName = this.resolveFullTableName(tableName);
      if (fullTableName && this.schema[fullTableName]) {
        this.schema[fullTableName].forEach(column => {
          if (
            this.matchesInput(column, currentWord) &&
            !addedColumns.has(column)
          ) {
            addedColumns.add(column);

            // Check if this is an alias
            const isAlias = this.tableAliases.has(tableName);
            const displayTable = isAlias
              ? `${tableName} (${this.tableAliases.get(tableName)})`
              : tableName;

            suggestions.push({
              label: column,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: column,
              range: range,
              detail: `🔹 Column from ${displayTable}`,
              documentation: `Column: ${column}\nTable: ${fullTableName}\nAlias: ${
                isAlias ? tableName : 'None'
              }`,
              sortText: `0_${column}`,
            });
          }
        });
      }
    });
  }

  private resolveFullTableName(tableName: string): string | null {
    // Check if it's an alias
    if (this.tableAliases.has(tableName)) {
      return this.tableAliases.get(tableName)!;
    }

    // Check if it's a direct table name
    return (
      Object.keys(this.schema).find(
        name => name === tableName || name.endsWith('.' + tableName)
      ) || null
    );
  }

  private addDotNotationSuggestions(
    suggestions: any[],
    range: any,
    currentWord: string,
    beforeDot: string,
    fullQuery: string
  ): void {
    // Check if beforeDot is a table alias -> suggest columns
    if (this.tableAliases.has(beforeDot)) {
      const actualTableName = this.tableAliases.get(beforeDot)!;
      this.addColumnsForTable(suggestions, range, currentWord, actualTableName);
      return;
    }

    // Check if beforeDot is a schema name -> suggest tables with automatic aliases
    if (this.isSchemaName(beforeDot)) {
      const tables = this.schemaMetadata[beforeDot];
      Object.keys(tables).forEach(tableName => {
        if (this.matchesInput(tableName, currentWord)) {
          const alias = this.generateUniqueTableAlias(tableName);
          const fullTableName = `${beforeDot}.${tableName}`;
          const insertTextWithAlias = `${tableName} ${alias}`;

          suggestions.push({
            label: `${tableName} ${alias}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: insertTextWithAlias,
            range: range,
            detail: `📋 Table with alias in ${beforeDot}`,
            documentation: `Table: ${fullTableName}\nAlias: ${alias}\nColumns: ${tables[
              tableName
            ].join(
              ', '
            )}\nUsage: SELECT ${alias}.column FROM ${fullTableName} ${alias}`,
            sortText: `0_${tableName}`,
          });
        }
      });
      return;
    }

    // Check if beforeDot is a direct table name -> suggest columns
    if (this.isTableName(beforeDot)) {
      this.addColumnsForTable(suggestions, range, currentWord, beforeDot);
      return;
    }
  }

  private addColumnsForTable(
    suggestions: any[],
    range: any,
    currentWord: string,
    tableName: string
  ): void {
    // Find the full table name (with schema)
    const fullTableName = Object.keys(this.schema).find(
      name => name === tableName || name.endsWith('.' + tableName)
    );

    if (fullTableName && this.schema[fullTableName]) {
      this.schema[fullTableName].forEach(column => {
        if (this.matchesInput(column, currentWord)) {
          suggestions.push({
            label: column,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: column,
            range: range,
            detail: `🔹 Column`,
            documentation: `Column: ${column}\nTable: ${tableName}`,
            sortText: `0_${column}`,
          });
        }
      });
    }
  }

  private addKeywordSuggestions(
    suggestions: any[],
    range: any,
    currentWord: string,
    keywords: string[]
  ): void {
    keywords.forEach((keyword: string) => {
      // Only suggest if the keyword is incomplete or empty input
      if (
        currentWord === '' ||
        (keyword.toLowerCase().startsWith(currentWord.toLowerCase()) &&
          keyword.toLowerCase() !== currentWord.toLowerCase())
      ) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range: range,
          detail: `🔤 SQL Keyword`,
          documentation: `SQL Keyword: ${keyword}`,
          sortText: `0_${keyword}`,
        });
      }
    });
  }

  private matchesInput(suggestion: string, input: string): boolean {
    // If no input, show all suggestions
    if (!input || input.trim() === '') return true;

    const suggestionLower = suggestion.toLowerCase();
    const inputLower = input.toLowerCase().trim();

    // Don't suggest if exactly matching (avoid repetition like "SELECT" suggesting "SELECT")
    if (suggestionLower === inputLower) {
      return false;
    }

    // Enhanced matching for better schema/table name suggestions

    // 1. Prefix matching (highest priority)
    if (
      suggestionLower.startsWith(inputLower) &&
      suggestionLower.length > inputLower.length
    ) {
      return true;
    }

    // 2. Contains matching (for cases like 'p' matching 'c_public')
    if (
      suggestionLower.includes(inputLower) &&
      suggestionLower.length > inputLower.length
    ) {
      return true;
    }

    // 3. Word boundary matching (for underscore separated names)
    if (suggestionLower.includes('_')) {
      const words = suggestionLower.split('_');
      for (const word of words) {
        if (word.startsWith(inputLower) && word.length > inputLower.length) {
          return true;
        }
      }
    }

    // 4. Camel case matching
    const capitalLetters = suggestion.match(/[A-Z]/g);
    if (capitalLetters) {
      const acronym = capitalLetters.join('').toLowerCase();
      if (
        acronym.startsWith(inputLower) &&
        acronym.length > inputLower.length
      ) {
        return true;
      }
    }

    return false;
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
    return Object.keys(this.schema).some(
      table => table === name || table.endsWith('.' + name)
    );
  }

  private generateUniqueTableAlias(tableName: string): string {
    // Generate smart aliases based on table name
    let baseAlias = this.generateSmartAlias(tableName);

    // Check if alias is already used in current query
    const existingAliases = Array.from(this.tableAliases.keys());

    if (!existingAliases.includes(baseAlias)) {
      return baseAlias;
    }

    // If base alias exists, append number
    let counter = 1;
    let uniqueAlias = `${baseAlias}${counter}`;

    while (existingAliases.includes(uniqueAlias)) {
      counter++;
      uniqueAlias = `${baseAlias}${counter}`;
    }

    return uniqueAlias;
  }

  private generateSmartAlias(tableName: string): string {
    // Remove schema prefix if present
    const cleanTableName = tableName.split('.').pop() || tableName;

    // Smart alias generation rules
    const aliasRules = [
      // Common table names with standard aliases
      { pattern: /^users?$/i, alias: 'u' },
      { pattern: /^customers?$/i, alias: 'c' },
      { pattern: /^orders?$/i, alias: 'o' },
      { pattern: /^products?$/i, alias: 'p' },
      { pattern: /^employees?$/i, alias: 'e' },
      { pattern: /^accounts?$/i, alias: 'a' },
      { pattern: /^transactions?$/i, alias: 't' },
      { pattern: /^categories?$/i, alias: 'cat' },
      { pattern: /^departments?$/i, alias: 'd' },
      { pattern: /^companies?$/i, alias: 'comp' },
      { pattern: /^organizations?$/i, alias: 'org' },
      { pattern: /^addresses?$/i, alias: 'addr' },
      { pattern: /^payments?$/i, alias: 'pay' },
      { pattern: /^invoices?$/i, alias: 'inv' },
      { pattern: /^reports?$/i, alias: 'rep' },
      { pattern: /^settings?$/i, alias: 'set' },
      { pattern: /^sessions?$/i, alias: 'sess' },
      { pattern: /^notifications?$/i, alias: 'notif' },
      { pattern: /^messages?$/i, alias: 'msg' },
      { pattern: /^comments?$/i, alias: 'comm' },
      { pattern: /^reviews?$/i, alias: 'rev' },
      { pattern: /^ratings?$/i, alias: 'rat' },
      { pattern: /^logs?$/i, alias: 'log' },
      { pattern: /^events?$/i, alias: 'evt' },
      { pattern: /^files?$/i, alias: 'f' },
      { pattern: /^images?$/i, alias: 'img' },
      { pattern: /^documents?$/i, alias: 'doc' },

      // Pattern-based rules
      {
        pattern: /^(.+)_details?$/i,
        alias: (match: RegExpMatchArray) => match[1].substring(0, 3) + 'd',
      },
      {
        pattern: /^(.+)_history$/i,
        alias: (match: RegExpMatchArray) => match[1].substring(0, 3) + 'h',
      },
      {
        pattern: /^(.+)_logs?$/i,
        alias: (match: RegExpMatchArray) => match[1].substring(0, 3) + 'l',
      },
      {
        pattern: /^(.+)_items?$/i,
        alias: (match: RegExpMatchArray) => match[1].substring(0, 3) + 'i',
      },
      {
        pattern: /^(.+)_data$/i,
        alias: (match: RegExpMatchArray) => match[1].substring(0, 3) + 'data',
      },
    ];

    // Check against predefined rules
    for (const rule of aliasRules) {
      const match = cleanTableName.match(rule.pattern);
      if (match) {
        if (typeof rule.alias === 'function') {
          return rule.alias(match);
        }
        return rule.alias;
      }
    }

    // Fallback: generate alias from table name
    return this.generateFallbackAlias(cleanTableName);
  }

  private generateFallbackAlias(tableName: string): string {
    // Remove common prefixes/suffixes
    let cleaned = tableName
      .toLowerCase()
      .replace(/^(tbl_|table_|tb_)/, '') // Remove table prefixes
      .replace(/(_table|_tbl|_tb)$/, ''); // Remove table suffixes

    // If table name has underscores, use first letter of each word
    if (cleaned.includes('_')) {
      const parts = cleaned.split('_');
      return parts
        .map(part => part.charAt(0))
        .join('')
        .substring(0, 4);
    }

    // If camelCase, use capital letters
    const capitalLetters = tableName.match(/[A-Z]/g);
    if (capitalLetters && capitalLetters.length > 1) {
      return capitalLetters.join('').toLowerCase().substring(0, 4);
    }

    // If single word, use first few characters
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return cleaned.substring(0, 2);
    } else {
      // For longer names, use first and some consonants
      const consonants = cleaned.match(/[bcdfghjklmnpqrstvwxyz]/g) || [];
      if (consonants.length >= 2) {
        return consonants.slice(0, 3).join('');
      }
      return cleaned.substring(0, 3);
    }
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
      orgId: this.selectedOrg.id.toString(),
    };

    // Call query server API
    this.httpClientService
      .queryPostNoLoader('/query/execute', requestBody)
      .toPromise()
      .then((response: any) => {
        // Handle successful response
        const result = JSON.parse(JSON.stringify(response));

        if (result && result.data && result.data.data) {
          this.queryResults = result.data.data;
          this.resultColumns =
            this.queryResults.length > 0
              ? Object.keys(this.queryResults[0])
              : [];

          // Populate column options for chart generation
          this.populateColumnOptions();

          // Use server execution time if available, otherwise use client time
          if (result.data.executionTime) {
            this.executionTime =
              parseInt(result.data.executionTime.replace('ms', '')) ||
              Date.now() - startTime;
          } else {
            this.executionTime = Date.now() - startTime;
          }
        } else {
          this.queryResults = [];
          this.resultColumns = [];
          this.executionTime = Date.now() - startTime;

          // Clear column options when no results
          this.populateColumnOptions();
        }

        // Trigger change detection to update results table immediately
        this.cdr.detectChanges();
        
        // Dynamically adjust results panel size based on content
        this.adjustResultsPanelSize();
        
        // Synchronize column widths between header and body tables
        setTimeout(() => {
          this.synchronizeTableColumns();
          this.setOptimalTableBodyHeight();
          this.verifyTableScrolling();
        }, 200);

        // Reset table state for new results
        this.currentPage = 0;
        this.sortColumn = '';
        this.sortDirection = '';

        this.isExecuting = false;

        // Fix layout after results load - defer to avoid splitter interference
        setTimeout(() => {
          if (this.editor) {
            this.editor.layout();
          }
          // Table scrolling now handled automatically by CSS
        }, 300);
      })
      .catch((error: any) => {
        // Handle error response
        console.error('Query execution error:', error);
        this.queryResults = [];
        this.resultColumns = [];
        this.executionTime = Date.now() - startTime;
        this.isExecuting = false;

        // Clear column options on error
        this.populateColumnOptions();

        // Trigger change detection to update UI after error
        this.cdr.detectChanges();

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
      y: event.clientY,
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
                        leaf: true,
                      },
                      {
                        label: 'username (VARCHAR(50))',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'email (VARCHAR(100))',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'created_at (TIMESTAMP)',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
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
                        leaf: true,
                      },
                      {
                        label: 'name (VARCHAR(200))',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'price (DECIMAL(10,2))',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'category_id (INTEGER)',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
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
                        leaf: true,
                      },
                      {
                        label: 'user_id (INTEGER)',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'total_amount (DECIMAL(10,2))',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
                      },
                      {
                        label: 'order_date (TIMESTAMP)',
                        data: { type: 'Column', level: 4 },
                        leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'product_sales_view',
                    data: { type: 'View', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'first_name (VARCHAR(50))',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'last_name (VARCHAR(50))',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'phone (VARCHAR(20))',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'item_name (VARCHAR(100))',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'quantity (INT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'unit_price (DECIMAL(8,2))',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'title (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'content (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'author (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'createdAt (Date)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'postId (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'message (String)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'userId (ObjectId)',
                    data: { type: 'Field', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'name (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'email (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'phone (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'contact_id (INTEGER)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'note_text (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'created_date (TEXT)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'emp_name (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'department (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'salary (DECIMAL)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
                    leaf: true,
                  },
                  {
                    label: 'dept_name (VARCHAR)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
                  },
                  {
                    label: 'manager_id (INTEGER)',
                    data: { type: 'Column', level: 3 },
                    leaf: true,
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
        hasStructure: false, // Track if structure has been loaded
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
      this.queryService
        .getDatabaseStructure(node.data.database.id, this.selectedOrg.id)
        .toPromise()
        .then((response: any) => {
          // Handle successful response
          const result = JSON.parse(JSON.stringify(response));

          if (result && result.data) {
            // Store raw structure data in node
            node.data.structureData = result.data;
            node.data.hasStructure = true;

            // Transform API response to tree node structure and store schema for autocomplete
            node.children = this.transformDatabaseStructureToTreeNodes(
              result.data,
              node.data.database.id.toString()
            );

            // If this database is currently active in editor, update schema immediately
            if (this.selectedDatabase?.id === node.data.database.id) {
              this.updateActiveSchema(node.data.database.id.toString());
            }
          } else {
            // Fallback to dummy data if API response is empty
            const schemaData = this.generateDummySchemaForDatabase(
              node.data.database
            );
            node.children = schemaData[0]?.children || [];
          }

          node.data.loading = false;
          
          // Trigger change detection to update tree UI immediately
          this.cdr.detectChanges();
        })
        .catch((error: any) => {
          // Handle error response
          console.error('Error loading database structure:', error);

          // Fallback to dummy data on error
          const schemaData = this.generateDummySchemaForDatabase(
            node.data.database
          );
          node.children = schemaData[0]?.children || [];

          node.data.loading = false;
          node.data.hasStructure = false;

          // Trigger change detection to update tree UI even in error case
          this.cdr.detectChanges();

          // Show error message to user (you can customize this based on your error handling approach)
          if (error.error && error.error.message) {
            console.error('API Error:', error.error.message);
          }
        });
    }
  }

  // Transform API response to tree node structure
  transformDatabaseStructureToTreeNodes(
    structureData: any,
    databaseId?: string
  ): TreeNode[] {
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
        schema: schemaItem,
      },
      expandedIcon: 'pi pi-sitemap',
      collapsedIcon: 'pi pi-sitemap',
      children:
        schemaItem.tables && schemaItem.tables.length > 0
          ? schemaItem.tables.map((tableItem: any) => ({
              label: tableItem.table,
              data: {
                type: 'Table',
                level: 2,
                table: tableItem,
              },
              expandedIcon: 'pi pi-table',
              collapsedIcon: 'pi pi-table',
              children:
                tableItem.columns && tableItem.columns.length > 0
                  ? tableItem.columns.map((column: any) => {
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
                          column: column,
                        },
                        icon: 'pi pi-minus',
                        leaf: true,
                      };
                    })
                  : [],
            }))
          : [
              {
                label: 'No tables found',
                data: {
                  type: 'EmptyState',
                  level: 2,
                },
                icon: 'pi pi-info-circle',
                leaf: true,
                styleClass: 'empty-state-node',
              },
            ],
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

  private closeAllMenusExcept(
    exceptType: 'database' | 'save' | 'autoSave'
  ): void {
    const menuTypes: ('database' | 'save' | 'autoSave')[] = [
      'database',
      'save',
      'autoSave',
    ];

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
    
    // Trigger change detection immediately for instant UI update
    this.cdr.detectChanges();
    
    // Additional change detection cycle to ensure splitter updates
    setTimeout(() => {
      this.cdr.detectChanges();
      
      // Force layout update for Monaco editor if it exists
      if (this.editor) {
        this.editor.layout();
      }
    }, 50);
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
    
    // Trigger change detection immediately for instant UI update
    this.cdr.detectChanges();
    
    // Additional change detection cycle to ensure splitter updates
    setTimeout(() => {
      this.cdr.detectChanges();
      
      // Force layout update for Monaco editor if it exists
      if (this.editor) {
        this.editor.layout();
      }
    }, 50);
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
    
    // Mark splitter as manually adjusted to prevent auto-sizing
    this.splitterManuallyAdjusted = true;

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

  // Dynamic results panel sizing based on content and viewport
  private adjustResultsPanelSize(): void {
    // Only adjust if user hasn't manually resized the splitter
    if (this.splitterManuallyAdjusted) {
      return;
    }

    // Get viewport height
    const viewportHeight = window.innerHeight;
    
    // Calculate ideal size based on content and auto-sizing needs
    const resultsCount = this.queryResults.length;
    
    // Calculate the actual height needed for the table
    const headerHeight = 60;
    const rowHeight = 50;
    const controlsHeight = 80; // Table controls
    const padding = 64; // Various paddings
    const neededTableHeight = headerHeight + (resultsCount * rowHeight) + controlsHeight + padding;
    
    // Calculate what percentage of viewport this represents
    const neededPercentage = Math.min(Math.max((neededTableHeight / viewportHeight) * 100, 25), 75);
    
    let idealResultsPercentage = neededPercentage;
    
    // Adjust based on viewport height for very small/large screens
    if (viewportHeight < 700) {
      // Small screens - ensure minimum visibility
      idealResultsPercentage = Math.max(idealResultsPercentage, 30);
    } else if (viewportHeight > 1200) {
      // Large screens - can afford more space
      idealResultsPercentage = Math.min(idealResultsPercentage + 10, 70);
    }
    
    // Ensure within acceptable bounds (minimum 25%, maximum 75%)
    idealResultsPercentage = Math.max(25, Math.min(75, idealResultsPercentage));
    
    // Update splitter sizes
    const editorPercentage = 100 - idealResultsPercentage;
    this.verticalSplitterSizes = [editorPercentage, idealResultsPercentage];
    
    // Update previous sizes
    this.previousVerticalSizes = [...this.verticalSplitterSizes];
    
    // Trigger change detection to update splitter
    this.cdr.detectChanges();
    
    console.log(`Auto-sized results panel: ${resultsCount} rows need ${neededTableHeight}px (${idealResultsPercentage.toFixed(1)}%)`);
  }

  // Setup window resize listener for responsive behavior
  private setupWindowResizeListener(): void {
    let resizeTimeout: any;
    
    window.addEventListener('resize', () => {
      // Debounce resize events
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Only adjust if there are results and user hasn't manually adjusted
        if (this.queryResults.length > 0 && !this.splitterManuallyAdjusted) {
          this.adjustResultsPanelSize();
        }
        
        // Ensure Monaco editor resizes properly
        if (this.editor) {
          this.editor.layout();
        }
      }, 300);
    });
  }


  // Synchronize column widths between header and body tables
  private synchronizeTableColumns(): void {
    setTimeout(() => {
      const tableContainer = this.tableContainer?.nativeElement;
      if (!tableContainer) return;

      const headerTable = tableContainer.querySelector('.table-header-table');
      const bodyTable = tableContainer.querySelector('.table-body-table');
      
      if (!headerTable || !bodyTable) return;

      const headerCells = headerTable.querySelectorAll('.table-header-cell');
      const bodyCells = bodyTable.querySelectorAll('tbody tr:first-child .table-cell');
      
      if (headerCells.length !== bodyCells.length) return;

      // Calculate optimal column widths based on content
      const columnWidths: string[] = [];
      
      headerCells.forEach((headerCell: Element, index: number) => {
        const bodyCell = bodyCells[index] as HTMLElement;
        if (bodyCell) {
          // Get natural width requirements
          const headerWidth = (headerCell as HTMLElement).scrollWidth;
          const bodyWidth = bodyCell.scrollWidth;
          const optimalWidth = Math.max(headerWidth, bodyWidth, 120); // Minimum 120px
          
          columnWidths.push(`${Math.min(optimalWidth, 300)}px`); // Maximum 300px
        }
      });

      // Apply synchronized widths
      headerCells.forEach((cell: Element, index: number) => {
        (cell as HTMLElement).style.width = columnWidths[index];
      });
      
      bodyCells.forEach((cell: Element, index: number) => {
        (cell as HTMLElement).style.width = columnWidths[index];
      });
      
      console.log('Table columns synchronized with widths:', columnWidths);
    }, 50);
  }

  // Set optimal table body height to ensure scrolling works
  private setOptimalTableBodyHeight(): void {
    setTimeout(() => {
      const tableContainer = this.tableContainer?.nativeElement;
      if (!tableContainer) return;

      const bodyWrapper = tableContainer.querySelector('.table-body-wrapper') as HTMLElement;
      const tableScrollContainer = tableContainer.closest('.table-scroll-container') as HTMLElement;
      const headerWrapper = tableContainer.querySelector('.table-header-wrapper') as HTMLElement;
      
      if (!bodyWrapper || !tableScrollContainer || !headerWrapper) return;

      // Calculate available height
      const containerHeight = tableScrollContainer.clientHeight;
      const headerHeight = headerWrapper.offsetHeight;
      const availableHeight = containerHeight - headerHeight - 40; // 40px for padding/borders and bottom spacing
      
      // Set max-height to ensure scrolling (accounting for bottom padding)
      const optimalMaxHeight = Math.max(200, Math.min(availableHeight, 500));
      bodyWrapper.style.maxHeight = `${optimalMaxHeight}px`;
      
      console.log('Table body height set:', {
        containerHeight,
        headerHeight,
        availableHeight,
        optimalMaxHeight,
        displayedRows: this.getPaginatedData().length
      });
    }, 50);
  }

  // Verify and debug table scrolling issues
  private verifyTableScrolling(): void {
    setTimeout(() => {
      const tableContainer = this.tableContainer?.nativeElement;
      if (!tableContainer) return;

      const bodyWrapper = tableContainer.querySelector('.table-body-wrapper');
      const bodyTable = tableContainer.querySelector('.table-body-table');
      
      if (!bodyWrapper || !bodyTable) return;

      // Get dimensions
      const wrapperHeight = bodyWrapper.clientHeight;
      const wrapperScrollHeight = bodyWrapper.scrollHeight;
      const tableHeight = (bodyTable as HTMLElement).offsetHeight;
      const rowCount = bodyTable.querySelectorAll('tbody tr').length;
      
      console.log('Table scrolling debug:', {
        displayedRows: this.getPaginatedData().length,
        totalRows: this.queryResults.length,
        wrapperHeight,
        wrapperScrollHeight,
        tableHeight,
        rowCount,
        canScroll: wrapperScrollHeight > wrapperHeight,
        scrollableArea: wrapperScrollHeight - wrapperHeight
      });
      
      // Force scroll to bottom to test
      if (wrapperScrollHeight > wrapperHeight) {
        bodyWrapper.scrollTop = wrapperScrollHeight - wrapperHeight;
        
        setTimeout(() => {
          const finalScrollTop = bodyWrapper.scrollTop;
          const lastRowVisible = finalScrollTop >= (wrapperScrollHeight - wrapperHeight - 10);
          
          // Check if last row is fully visible
          const lastRow = bodyTable.querySelector('tbody tr:last-child') as HTMLElement;
          if (lastRow) {
            const lastRowRect = lastRow.getBoundingClientRect();
            const wrapperRect = bodyWrapper.getBoundingClientRect();
            const lastRowFullyVisible = lastRowRect.bottom <= wrapperRect.bottom;
            
            console.log('Scroll verification:', {
              scrollTop: finalScrollTop,
              maxScroll: wrapperScrollHeight - wrapperHeight,
              lastRowVisible,
              lastRowFullyVisible,
              lastRowBottom: lastRowRect.bottom,
              wrapperBottom: wrapperRect.bottom,
              scrollPercentage: (finalScrollTop / (wrapperScrollHeight - wrapperHeight)) * 100
            });
          }
          
          // Reset scroll position
          setTimeout(() => {
            bodyWrapper.scrollTop = 0;
          }, 1000);
        }, 100);
      }
    }, 100);
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
          // Run in Angular zone to ensure proper change detection
          this.ngZone.run(() => {
            this.toggleSchemaPanel();
          });
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
          // Run in Angular zone to ensure proper change detection
          this.ngZone.run(() => {
            this.toggleResultsPanel();
          });
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
    this.organisationService.listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = [...response.data.orgs];
          if (this.organisations.length > 0) {
            this.selectedOrg = this.organisations[0];
            this.loadDatabases();
          }
          // Trigger change detection to update the dropdown UI
          this.cdr.detectChanges();
        }
      })
      .catch(error => {
        console.error('Error loading organisations:', error);
        this.organisations = [];
        this.selectedOrg = {};
        // Trigger change detection even in error case
        this.cdr.detectChanges();
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
      this.transformDatabaseStructureToTreeNodes(
        treeNode.data.structureData,
        databaseId
      );
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
    this.queryService
      .getDatabaseStructure(parseInt(databaseId), this.selectedOrg.id)
      .toPromise()
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
              treeNode.children = this.transformDatabaseStructureToTreeNodes(
                result.data,
                databaseId
              );
            }
          }

          // Update active schema
          this.updateActiveSchema(databaseId);
          
          // Trigger change detection for tree node updates
          this.cdr.detectChanges();
        }
      })
      .catch((error: any) => {
        // Handle error silently for background loading
        console.warn('Could not load schema for autocomplete:', error);
        // Trigger change detection even in error case
        this.cdr.detectChanges();
      })
      .finally(() => {
        // Remove from loading set
        this.loadingSchemas.delete(databaseId);
        // Final change detection trigger to ensure loading state is updated
        this.cdr.detectChanges();
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
          
          // Trigger change detection to update the database tree UI
          this.cdr.detectChanges();
        }
      })
      .catch(error => {
        // Handle error case
        console.error('Error loading databases:', error);
        this.databases = [];
        this.selectedDatabase = {};
        this.databaseTree = [];
        this.updateDatabaseMenuItems();
        // Trigger change detection even in error case
        this.cdr.detectChanges();
      })
      .finally(() => {
        // Always set loading state to false when request completes
        this.isDatabasesLoading = false;
        // Final change detection trigger to ensure loading state is updated
        this.cdr.detectChanges();
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

  // Removed duplicate getter - using property instead

  // Populate column options dynamically from query results
  private populateColumnOptions(): void {
    if (!this.queryResults.length || !this.resultColumns.length) {
      this.columnOptions = [];
      this.numericColumns = [];
      this.categoricalColumns = [];
      return;
    }

    // Create column options with data type detection
    this.columnOptions = this.resultColumns.map(col => ({
      label: col,
      value: col,
      type: this.detectColumnType(col),
    }));

    // Separate columns by type
    this.numericColumns = this.columnOptions.filter(
      col => col.type === 'numeric'
    );
    this.categoricalColumns = this.columnOptions.filter(
      col => col.type === 'categorical'
    );
    this.dateColumns = this.columnOptions.filter(col => col.type === 'date');

    // Auto-select chart inputs if a chart type is already selected
    if (this.selectedChartType) {
      this.autoSelectChartInputs();
    }
  }

  // Detect column data type from sample data
  private detectColumnType(
    columnName: string
  ): 'numeric' | 'categorical' | 'date' {
    if (!this.queryResults.length) return 'categorical';

    const sampleValues = this.queryResults
      .slice(0, 10)
      .map(row => row[columnName]);
    const nonNullValues = sampleValues.filter(
      val => val !== null && val !== undefined
    );

    if (nonNullValues.length === 0) return 'categorical';

    // Check if all values are numeric
    const numericCount = nonNullValues.filter(
      val => !isNaN(Number(val)) && isFinite(Number(val))
    ).length;

    // Check if values look like dates
    const dateCount = nonNullValues.filter(val => {
      if (typeof val === 'string') {
        const date = new Date(val);
        return !isNaN(date.getTime()) && val.match(/\d{4}-\d{2}-\d{2}/);
      }
      return false;
    }).length;

    // Determine type based on majority
    if (dateCount > nonNullValues.length * 0.8) return 'date';
    if (numericCount > nonNullValues.length * 0.8) return 'numeric';
    return 'categorical';
  }

  // Handle chart type selection change
  private onChartTypeChange(chartTypeValue: string): void {
    if (!chartTypeValue) {
      this.selectedChartType = null;
      this.cdr.detectChanges();
      return;
    }

    // Find the selected chart type configuration
    this.selectedChartType = this.chartTypes.find(
      ct => ct.value === chartTypeValue
    );
    if (!this.selectedChartType) return;

    // Clear previous dynamic controls
    Object.keys(this.chartForm.controls).forEach(key => {
      if (key !== 'chartType') {
        this.chartForm.removeControl(key);
      }
    });

    // Add new form controls based on chart type inputs
    this.selectedChartType.inputs.forEach((input: any) => {
      if (input.multiple) {
        // Create FormArray for multiple selection
        const formArray = this.fb.array(
          [],
          input.required ? [Validators.required] : []
        );
        this.chartForm.addControl(input.name, formArray);
      } else {
        this.chartForm.addControl(
          input.name,
          this.fb.control(null, input.required ? [Validators.required] : [])
        );
      }
    });

    // Auto-select smart defaults if data is available
    if (this.queryResults.length > 0) {
      this.autoSelectChartInputs();
    }

    this.cdr.detectChanges();
  }

  // Auto-select appropriate columns based on chart type
  private autoSelectChartInputs(): void {
    if (!this.selectedChartType || !this.queryResults.length) return;

    // Use requestAnimationFrame to prevent UI blocking
    requestAnimationFrame(() => {
      this.selectedChartType.inputs.forEach((input: any) => {
        let selectedValue = null;

        if (
          input.type === 'categorical' &&
          this.categoricalColumns.length > 0
        ) {
          selectedValue = this.categoricalColumns[0].value;
        } else if (input.type === 'numeric' && this.numericColumns.length > 0) {
          selectedValue = this.numericColumns[0].value;
        } else if (input.type === 'date' && this.dateColumns.length > 0) {
          selectedValue = this.dateColumns[0].value;
        } else if (input.type === 'any' && this.columnOptions.length > 0) {
          selectedValue = this.columnOptions[0].value;
        }

        if (selectedValue) {
          const control = this.chartForm.get(input.name);
          if (control) {
            if (input.multiple) {
              // For FormArray, push the value
              const formArray = control as FormArray;
              formArray.clear();
              formArray.push(this.fb.control(selectedValue));
            } else {
              control.setValue(selectedValue);
            }
          }
        }
      });
    });
  }

  // Removed duplicate getter - using numericColumns property instead

  // Helper methods for chart type display
  getChartTypeIcon(type: string): string {
    const chartType = this.chartTypes.find(t => t.value === type);
    return chartType ? chartType.icon : 'pi pi-chart-bar';
  }

  getChartTypeLabel(type: string): string {
    const chartType = this.chartTypes.find(t => t.value === type);
    return chartType ? chartType.label : 'Select Chart Type';
  }

  // Removed updateChartOptionsColors - ngx-charts handles theming automatically

  // Transform data for ngx-charts based on selected chart type
  updateChartData() {
    if (!this.selectedChartType || !this.queryResults.length) {
      this.ngxChartData = [];
      return;
    }

    const formValues = this.chartForm.value;
    const chartType = this.selectedChartType.value;

    // Transform data based on chart type
    switch (chartType) {
      case 'bar-vertical':
      case 'bar-horizontal':
      case 'pie-chart':
      case 'pie-chart-advanced':
      case 'pie-chart-grid':
      case 'number-card':
        this.ngxChartData = this.transformToSingleSeries(formValues);
        break;

      case 'bar-vertical-grouped':
      case 'line-chart':
      case 'area-chart':
        this.ngxChartData = this.transformToMultiSeries(formValues);
        break;

      case 'bubble-chart':
        this.ngxChartData = this.transformToBubbleSeries(formValues);
        break;

      case 'heat-map':
        this.ngxChartData = this.transformToHeatmapData(formValues);
        break;

      case 'tree-map':
        this.ngxChartData = this.transformToTreemapData(formValues);
        break;

      case 'gauge':
      case 'linear-gauge':
        this.ngxChartData = this.transformToGaugeData(formValues);
        break;
    }

    // Update axis labels based on selection
    this.updateAxisLabels(formValues);
    
    // Force change detection for real-time updates
    this.cdr.detectChanges();
  }

  // Transform data to single series format [{name: string, value: number}]
  private transformToSingleSeries(formValues: any): any[] {
    const labelField = formValues.labels || formValues.xAxis;
    const valueField = formValues.values || formValues.yAxis;

    if (!labelField || !valueField) return [];

    // Aggregate data by label
    const aggregatedData = new Map<string, number>();

    this.queryResults.forEach(row => {
      const label = String(row[labelField]);
      const value = Number(row[valueField]) || 0;

      if (aggregatedData.has(label)) {
        aggregatedData.set(label, aggregatedData.get(label)! + value);
      } else {
        aggregatedData.set(label, value);
      }
    });

    return Array.from(aggregatedData.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }

  // Transform data to multi-series format [{name: string, series: [{name: string, value: number}]}]
  private transformToMultiSeries(formValues: any): any[] {
    const xAxisField = formValues.xAxis;
    const yAxisFields = formValues.yAxis;
    const groupByField = formValues.groupBy;

    if (!xAxisField || !yAxisFields) return [];

    // Handle multiple Y-axis fields (when FormArray is used)
    const yFields = Array.isArray(yAxisFields) ? yAxisFields : [yAxisFields];

    if (groupByField) {
      // Group data by groupBy field
      const groupedData = new Map<string, Map<string, number>>();

      this.queryResults.forEach(row => {
        const group = String(row[groupByField]);
        const xValue = String(row[xAxisField]);

        if (!groupedData.has(group)) {
          groupedData.set(group, new Map());
        }

        yFields.forEach(yField => {
          const yValue = Number(row[yField]) || 0;
          const key = `${xValue}`;

          if (groupedData.get(group)!.has(key)) {
            groupedData
              .get(group)!
              .set(key, groupedData.get(group)!.get(key)! + yValue);
          } else {
            groupedData.get(group)!.set(key, yValue);
          }
        });
      });

      return Array.from(groupedData.entries()).map(([name, seriesMap]) => ({
        name,
        series: Array.from(seriesMap.entries()).map(([xValue, yValue]) => ({
          name: xValue,
          value: yValue,
        })),
      }));
    } else {
      // Create series for each Y-axis field
      return yFields.map(yField => ({
        name: yField || yField,
        series: this.queryResults.map(row => ({
          name: String(row[xAxisField]),
          value: Number(row[yField]) || 0,
        })),
      }));
    }
  }

  // Transform data for bubble charts
  private transformToBubbleSeries(formValues: any): any[] {
    const xAxisField = formValues.xAxis;
    const yAxisField = formValues.yAxis;
    const sizeField = formValues.size;
    const groupByField = formValues.groupBy;

    if (!xAxisField || !yAxisField || !sizeField) return [];

    if (groupByField) {
      // Group by field for multiple series
      const groupedData = new Map<string, any[]>();

      this.queryResults.forEach(row => {
        const group = String(row[groupByField]);
        if (!groupedData.has(group)) {
          groupedData.set(group, []);
        }

        groupedData.get(group)!.push({
          x: Number(row[xAxisField]) || 0,
          y: Number(row[yAxisField]) || 0,
          r: Math.sqrt(Number(row[sizeField]) || 0), // Square root for better visual scaling
        });
      });

      return Array.from(groupedData.entries()).map(([name, series]) => ({
        name,
        series,
      }));
    } else {
      // Single series
      return [
        {
          name: 'Data',
          series: this.queryResults.map(row => ({
            x: Number(row[xAxisField]) || 0,
            y: Number(row[yAxisField]) || 0,
            r: Math.sqrt(Number(row[sizeField]) || 0),
          })),
        },
      ];
    }
  }

  // Transform data for heatmap
  private transformToHeatmapData(formValues: any): any[] {
    const xAxisField = formValues.xAxis;
    const yAxisField = formValues.yAxis;
    const valueField = formValues.values;

    if (!xAxisField || !yAxisField || !valueField) return [];

    // Create matrix data
    const matrix = new Map<string, Map<string, number>>();

    this.queryResults.forEach(row => {
      const xValue = String(row[xAxisField]);
      const yValue = String(row[yAxisField]);
      const value = Number(row[valueField]) || 0;

      if (!matrix.has(yValue)) {
        matrix.set(yValue, new Map());
      }

      matrix.get(yValue)!.set(xValue, value);
    });

    // Convert to ngx-charts format
    return Array.from(matrix.entries()).map(([yValue, xMap]) => ({
      name: yValue,
      series: Array.from(xMap.entries()).map(([xValue, value]) => ({
        name: xValue,
        value,
      })),
    }));
  }

  // Transform data for treemap
  private transformToTreemapData(formValues: any): any[] {
    const labelField = formValues.labels;
    const valueField = formValues.values;
    const groupByField = formValues.groupBy;

    if (!labelField || !valueField) return [];

    if (groupByField) {
      // Create hierarchical structure
      const grouped = new Map<string, any[]>();

      this.queryResults.forEach(row => {
        const group = String(row[groupByField]);
        if (!grouped.has(group)) {
          grouped.set(group, []);
        }

        grouped.get(group)!.push({
          name: String(row[labelField]),
          value: Number(row[valueField]) || 0,
        });
      });

      return Array.from(grouped.entries()).map(([name, children]) => ({
        name,
        children,
      }));
    } else {
      // Flat structure
      return this.transformToSingleSeries(formValues);
    }
  }

  // Transform data for gauge charts
  private transformToGaugeData(formValues: any): any[] {
    const valueField = formValues.value;
    const labelField = formValues.label;

    if (!valueField) return [];

    // For gauge, we typically show a single value or aggregate
    const values = this.queryResults.map(row => Number(row[valueField]) || 0);
    const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;

    const label = labelField
      ? String(this.queryResults[0][labelField])
      : 'Value';

    return [
      {
        name: label,
        value: avgValue,
      },
    ];
  }

  // Update axis labels based on selected columns
  private updateAxisLabels(formValues: any): void {
    // Only update axis labels if custom labels are empty (not set by user)
    if (formValues.xAxis && !this.customXAxisLabel) {
      this.xAxisLabel = formValues.xAxis || 'X Axis';
    } else if (this.customXAxisLabel) {
      this.xAxisLabel = this.customXAxisLabel;
    }
    
    if (formValues.yAxis && !this.customYAxisLabel) {
      if (Array.isArray(formValues.yAxis) && formValues.yAxis.length > 0) {
        this.yAxisLabel = formValues.yAxis[0] || 'Y Axis';
      } else if (formValues.yAxis) {
        this.yAxisLabel = formValues.yAxis || 'Y Axis';
      }
    } else if (this.customYAxisLabel) {
      this.yAxisLabel = this.customYAxisLabel;
    }
  }

  // Check if a chart type can be used with current data
  canUseChartType(chartType: any): boolean {
    if (!this.queryResults.length) return false;

    // Check if required inputs are available
    return chartType.inputs.every((input: any) => {
      if (!input.required) return true;

      if (input.type === 'numeric') {
        return this.numericColumns.length > 0;
      } else if (input.type === 'categorical') {
        return this.categoricalColumns.length > 0;
      } else if (input.type === 'date') {
        return this.dateColumns.length > 0;
      } else if (input.type === 'any') {
        return this.columnOptions.length > 0;
      }

      return true;
    });
  }

  // Select a chart type and update form
  selectChartType(chartType: any): void {
    if (!this.canUseChartType(chartType)) return;

    this.chartForm.patchValue({ chartType: chartType.value });
  }

  // Handle dropdown change event
  onChartTypeDropdownChange(event: any): void {
    const selectedValue = event.value;
    const chartType = this.chartTypes.find(ct => ct.value === selectedValue);
    if (chartType) {
      this.selectChartType(chartType);
    }
  }

  // Get icon for field types
  getFieldIcon(type: string): string {
    switch (type) {
      case 'x-axis':
      case 'category':
        return 'pi pi-chart-bar';
      case 'y-axis':
      case 'value':
        return 'pi pi-hashtag';
      case 'series':
        return 'pi pi-list';
      case 'size':
        return 'pi pi-circle';
      case 'color':
        return 'pi pi-palette';
      default:
        return 'pi pi-tag';
    }
  }

  // Reset chart configuration
  resetChartConfig(): void {
    this.chartForm.reset();
    this.selectedChartType = null;
    this.showChart = false;
    this.ngxChartData = [];
    this.cdr.detectChanges();
  }

  // Open chart in fullscreen popup
  openChartPopup(): void {
    this.showChartPopup = true;
    
    // Initialize custom labels with current values if empty
    if (!this.customXAxisLabel && this.xAxisLabel) {
      this.customXAxisLabel = this.xAxisLabel;
    }
    if (!this.customYAxisLabel && this.yAxisLabel) {
      this.customYAxisLabel = this.yAxisLabel;
    }
    
    // Ensure chart data is preserved and refreshed
    if (this.ngxChartData.length === 0 && this.queryResults.length > 0 && this.selectedChartType) {
      console.log('Restoring chart data in popup...');
      this.updateChartData();
    }
    
    this.cdr.detectChanges();
  }

  // Close chart popup
  closeChartPopup(): void {
    this.showChartPopup = false;
    this.cdr.detectChanges();
  }

  // Change chart theme
  onChartThemeChange(themeName: string): void {
    this.selectedChartTheme = themeName;
    const selectedTheme = this.chartThemes.find(theme => theme.name === themeName);
    if (selectedTheme) {
      this.ngxChartScheme = { domain: selectedTheme.domain };
      this.cdr.detectChanges();
    }
  }

  // Debounced chart update for text inputs
  private textUpdateTimeout: any;
  onTextInputChange(): void {
    if (this.textUpdateTimeout) {
      clearTimeout(this.textUpdateTimeout);
    }
    this.textUpdateTimeout = setTimeout(() => {
      // Only trigger change detection for label updates
      this.cdr.detectChanges();
    }, 300); // 300ms debounce
  }

  // Method for appearance-only changes that don't require data transformation
  onAppearanceChange(): void {
    // Bar charts in ngx-charts need special handling due to their rendering behavior
    if (this.selectedChartType?.value.includes('bar')) {
      // Create a new reference to trigger ngx-charts update
      this.ngxChartData = [...this.ngxChartData];
      // Also update the scheme reference for color changes
      this.ngxChartScheme = { ...this.ngxChartScheme };
    }
    this.cdr.detectChanges();
  }

  // Export chart functionality
  exportChart(): void {
    // Implementation for chart export
    console.log('Exporting chart...');
  }

  // Conditional display methods for chart options
  chartHasAxes(): boolean {
    const noAxesCharts = ['pie-chart', 'pie-chart-advanced', 'pie-chart-grid', 'number-card', 'gauge', 'linear-gauge'];
    return !noAxesCharts.includes(this.selectedChartType?.value);
  }

  chartSupportsGradient(): boolean {
    const gradientCharts = ['bar-vertical', 'bar-horizontal', 'bar-vertical-grouped', 'line-chart', 'area-chart'];
    return gradientCharts.includes(this.selectedChartType?.value);
  }

  chartSupportsDataLabels(): boolean {
    const dataLabelCharts = ['bar-vertical', 'bar-horizontal', 'bar-vertical-grouped', 'bar-horizontal-grouped', 'pie-chart', 'pie-chart-advanced'];
    return dataLabelCharts.includes(this.selectedChartType?.value);
  }

  chartSupportsLegend(): boolean {
    const legendCharts = ['pie-chart', 'pie-chart-advanced', 'line-chart', 'area-chart', 'bar-vertical-grouped', 'bar-horizontal-grouped'];
    return legendCharts.includes(this.selectedChartType?.value);
  }

  // Custom label change handlers
  onXAxisLabelChange(value: string): void {
    this.customXAxisLabel = value;
    this.xAxisLabel = value;
    // Immediate update for responsive feedback
    this.cdr.detectChanges();
    this.onTextInputChange();
  }

  onYAxisLabelChange(value: string): void {
    this.customYAxisLabel = value;
    this.yAxisLabel = value;
    // Immediate update for responsive feedback
    this.cdr.detectChanges();
    this.onTextInputChange();
  }


  chartHasGridLines(): boolean {
    const gridLineCharts = ['bar-vertical', 'bar-horizontal', 'bar-vertical-grouped', 'bar-horizontal-grouped', 'line-chart', 'area-chart'];
    return gridLineCharts.includes(this.selectedChartType?.value);
  }

  // Reset chart configuration
  resetChartConfiguration(): void {
    this.selectedChartType = null;
    this.showChart = false;
    this.ngxChartData = [];
    this.chartForm.reset();
    this.cdr.detectChanges();
  }

  // Get appropriate column options for an input field
  getOptionsForInput(input: any): any[] {
    switch (input.type) {
      case 'numeric':
        return this.numericColumns;
      case 'categorical':
        return this.categoricalColumns;
      case 'date':
        return this.dateColumns;
      case 'any':
        return this.columnOptions;
      default:
        return this.columnOptions;
    }
  }

  // Helper method to get FormArray value for multiselect
  getFormArrayValue(controlName: string): any[] {
    const control = this.chartForm.get(controlName);
    if (control instanceof FormArray) {
      return control.value || [];
    }
    return [];
  }

  // Helper method to update FormArray value from multiselect
  updateFormArray(controlName: string, values: any[]): void {
    const control = this.chartForm.get(controlName);
    if (control instanceof FormArray) {
      control.clear();
      values.forEach(value => {
        control.push(this.fb.control(value));
      });
      this.cdr.detectChanges();
    }
  }

  // Updated canGenerateChart method for ngx-charts
  canGenerateChart(): boolean {
    if (!this.selectedChartType || !this.queryResults.length) return false;

    // Check if all required inputs are filled
    return this.selectedChartType.inputs.every((input: any) => {
      if (!input.required) return true;

      const control = this.chartForm.get(input.name);
      if (!control) return false;

      const controlValue = control.value;
      if (input.multiple) {
        // For FormArray, check if it has valid values
        return (
          Array.isArray(controlValue) &&
          controlValue.length > 0 &&
          controlValue.every(val => val !== null && val !== undefined)
        );
      } else {
        return (
          controlValue !== null &&
          controlValue !== undefined &&
          controlValue !== ''
        );
      }
    });
  }

  // Updated generateChart method for ngx-charts
  generateChart(): void {
    if (!this.canGenerateChart()) return;

    this.isGeneratingChart = true;
    this.showChart = false;
    this.cdr.detectChanges();

    // Process data transformation with reduced delay
    requestAnimationFrame(() => {
      try {
        this.updateChartData();
        this.showChart = true;
        console.log('Chart generated successfully:', {
          chartType: this.selectedChartType?.value,
          dataPoints: this.ngxChartData.length,
        });
      } catch (error) {
        console.error('Error generating chart:', error);
        this.showChart = false;
      }
      this.isGeneratingChart = false;
      this.cdr.detectChanges();
    });
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

  // Removed ngDoCheck to improve performance - chart data is now updated on demand

  // Removed old duplicate methods - using new ngx-charts methods instead

  // Removed old duplicate methods - using new ngx-charts implementation

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

  // Custom table methods
  trackByColumn(index: number, column: string): string {
    return column;
  }

  trackByRow(index: number, row: any): any {
    return row.id || index;
  }

  getCellValue(row: any, column: string): any {
    return row[column];
  }

  isDateValue(value: any): boolean {
    if (typeof value === 'string') {
      return value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) !== null;
    }
    return false;
  }

  isNumberValue(value: any): boolean {
    return typeof value === 'number';
  }

  isBooleanValue(value: any): boolean {
    return typeof value === 'boolean';
  }

  isNullValue(value: any): boolean {
    return value === null || value === undefined;
  }

  formatCellValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Handle different data types
    if (typeof value === 'string') {
      // Check if it's a date string
      if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        try {
          const date = new Date(value);
          return date.toLocaleString();
        } catch {
          // Fall through to string handling
        }
      }

      // Truncate long strings
      if (value.length > 100) {
        return value.substring(0, 100) + '...';
      }
      return value;
    }

    if (typeof value === 'number') {
      // Format numbers with appropriate precision
      if (Number.isInteger(value)) {
        return value.toString();
      } else {
        return value.toFixed(2);
      }
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // For objects, arrays, etc.
    if (typeof value === 'object') {
      try {
        const jsonStr = JSON.stringify(value);
        return jsonStr.length > 100
          ? jsonStr.substring(0, 100) + '...'
          : jsonStr;
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  getPaginatedData(): any[] {
    const start = this.currentPage * this.tableRowsPerPage;
    const end = start + this.tableRowsPerPage;
    return this.queryResults.slice(start, end);
  }

  getTotalPages(): number {
    return Math.ceil(this.queryResults.length / this.tableRowsPerPage);
  }

  getDisplayedRowCount(): number {
    const start = this.currentPage * this.tableRowsPerPage;
    const end = Math.min(
      start + this.tableRowsPerPage,
      this.queryResults.length
    );
    return end - start;
  }

  onRowsPerPageChange(): void {
    this.currentPage = 0;
  }

  sortByColumn(column: string): void {
    if (this.sortColumn === column) {
      // Toggle sort direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.queryResults.sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.currentPage = 0;
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? 'pi-sort-up' : 'pi-sort-down';
  }

  goToFirstPage(): void {
    this.currentPage = 0;
  }

  goToLastPage(): void {
    this.currentPage = this.getTotalPages() - 1;
  }

  goToPreviousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }

  goToNextPage(): void {
    if (this.currentPage < this.getTotalPages() - 1) {
      this.currentPage++;
    }
  }

  goToPage(page: number): void {
    this.currentPage = page;
  }

  getVisiblePageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const visiblePages = 5; // Show 5 page numbers at most
    const halfVisible = Math.floor(visiblePages / 2);

    let start = Math.max(0, this.currentPage - halfVisible);
    let end = Math.min(totalPages - 1, start + visiblePages - 1);

    // Adjust start if we're near the end
    if (end - start + 1 < visiblePages) {
      start = Math.max(0, end - visiblePages + 1);
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  exportToCSV(): void {
    if (this.queryResults.length === 0) return;

    const csvContent = this.convertToCSV(this.queryResults, this.resultColumns);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query-results-${
      new Date().toISOString().split('T')[0]
    }.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private convertToCSV(data: any[], columns: string[]): string {
    const header = columns.join(',');
    const rows = data.map(row =>
      columns
        .map(col => {
          const value = row[col];
          const stringValue =
            value === null || value === undefined ? '' : String(value);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (
            stringValue.includes(',') ||
            stringValue.includes('"') ||
            stringValue.includes('\n')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',')
    );
    return [header, ...rows].join('\n');
  }

  private updateScrollIndicators(): void {
    // Simplified method - no longer needed with always-enabled scrolling
    // Keep method for backward compatibility but remove indicator logic
  }

  private resizeTimeout: any;
  private isTableHovered: boolean = false;

  onTableMouseEnter(): void {
    this.isTableHovered = true;
    // Enhanced visual feedback handled by CSS
  }

  onTableMouseLeave(): void {
    this.isTableHovered = false;
  }

  onTableKeydown(event: KeyboardEvent): void {
    if (!this.tableContainer?.nativeElement) return;

    const container = this.tableContainer.nativeElement;
    const scrollAmount = 50;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        container.scrollTop -= scrollAmount;
        break;
      case 'ArrowDown':
        event.preventDefault();
        container.scrollTop += scrollAmount;
        break;
      case 'ArrowLeft':
        event.preventDefault();
        container.scrollLeft -= scrollAmount;
        break;
      case 'ArrowRight':
        event.preventDefault();
        container.scrollLeft += scrollAmount;
        break;
      case 'PageUp':
        event.preventDefault();
        container.scrollTop -= container.clientHeight * 0.8;
        break;
      case 'PageDown':
        event.preventDefault();
        container.scrollTop += container.clientHeight * 0.8;
        break;
      case 'Home':
        event.preventDefault();
        container.scrollTop = 0;
        container.scrollLeft = 0;
        break;
      case 'End':
        event.preventDefault();
        container.scrollTop = container.scrollHeight;
        break;
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

    // Clean up text input timeout
    if (this.textUpdateTimeout) {
      clearTimeout(this.textUpdateTimeout);
    }

    // Clean up resize timeout
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    // Stop auto-save
    this.stopAutoSave();

    // Clear autocomplete caches
    this.tableAliases.clear();
    this.suggestionCache.clear();
    this.frequentlyUsed.clear();
  }
}
