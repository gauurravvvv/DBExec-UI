import {
  AfterViewInit,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { MonacoIntelliSenseService } from '../../../../dataset/services copy/monaco-intellisense.service';

declare const monaco: any;
declare const window: any;

// Editor loading configuration
const EDITOR_LOADING_CONFIG = {
  MAX_ATTEMPTS: 200,
  CHECK_INTERVAL_MS: 50,
  TIMEOUT_MS: 20000,
};

// Monaco editor options matching add-dataset
const MONACO_EDITOR_OPTIONS = {
  language: 'sql',
  automaticLayout: true,

  // IntelliSense & Autocomplete
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  wordBasedSuggestions: true,
  tabCompletion: 'on' as const,
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showWords: true,
    insertMode: 'insert' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false,
  },
  quickSuggestionsDelay: 100,

  // UI Features
  minimap: { enabled: true },
  folding: true,
  lineNumbers: 'on' as const,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  smoothScrolling: true,
  mouseWheelZoom: true,
  fontSize: 14,
  fontFamily: "'Fira Code', 'Courier New', monospace",
  fontLigatures: true,

  // Bracket Features
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },

  // Editing Features
  formatOnPaste: false,
  formatOnType: false,
  autoClosingBrackets: 'always' as const,
  autoClosingQuotes: 'always' as const,
  autoIndent: 'full' as const,
  multiCursorModifier: 'alt' as const,

  // Context Menu
  contextmenu: true,

  // Scrollbar
  scrollbar: {
    vertical: 'visible' as const,
    horizontal: 'visible' as const,
    useShadows: true,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

@Component({
  selector: 'app-sql-query-dialog',
  templateUrl: './sql-query-dialog.component.html',
  styleUrls: ['./sql-query-dialog.component.scss'],
})
export class SqlQueryDialogComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input() visible = false;
  @Input() schemaData: any[] = []; // Schema structure with tables and columns
  @Input() currentSchema: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() execute = new EventEmitter<string>();

  sqlQuery = '';
  isSqlLoading = false;
  sqlError = '';

  // Monaco Editor
  editor: any = null;
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  isLoadingEditor = true;
  monacoLoadFailed = false;
  private currentTheme: string = 'vs-dark';
  private themeObserver: MutationObserver | null = null;

  constructor(private monacoIntelliSenseService: MonacoIntelliSenseService) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngAfterViewInit() {
    // Editor will be initialized when dialog opens
  }

  ngOnDestroy() {
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
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']) {
      if (this.visible) {
        // Reset state when dialog opens
        this.sqlQuery = '';
        this.sqlError = '';

        // Initialize Monaco editor after DOM is ready
        setTimeout(() => this.loadMonacoEditor(), 100);
      } else {
        // Dispose editor when dialog closes
        if (this.editor) {
          this.editor.dispose();
          this.editor = null;
        }
      }
    }
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
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkMonaco);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
      }
    }, checkInterval);

    // Extended timeout fallback - 20 seconds
    setTimeout(() => {
      clearInterval(checkMonaco);
      if (typeof monaco === 'undefined') {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
      }
    }, EDITOR_LOADING_CONFIG.TIMEOUT_MS);
  }

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  private initMonaco(): void {
    // Wait for the DOM to be ready
    setTimeout(() => {
      const container = document.getElementById('sql-query-editor-container');
      if (!container) {
        this.isLoadingEditor = false;
        return;
      }

      try {
        // Setup theme monitoring
        this.setupThemeObserver();

        // Dispose previous editor if exists
        if (this.editor) {
          this.editor.dispose();
        }

        // Create Monaco Editor instance
        this.editor = monaco.editor.create(container, {
          ...MONACO_EDITOR_OPTIONS,
          value: this.sqlQuery || '',
          theme: this.currentTheme,
        });

        // Setup content change listener
        this.editor.onDidChangeModelContent(() => {
          this.sqlQuery = this.editor.getValue();
          this.sqlError = '';
        });

        // Register IntelliSense
        this.registerIntelliSenseProviders();

        // Focus the editor
        this.editor.focus();

        this.isLoadingEditor = false;
      } catch (error) {
        console.error('Error creating Monaco editor:', error);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
      }
    }, 100);
  }

  /**
   * Register IntelliSense providers using MonacoIntelliSenseService
   */
  private registerIntelliSenseProviders(): void {
    // Dispose previous providers if they exist
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
    }
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
    }

    // Transform schema data to the format expected by MonacoIntelliSenseService
    const databases = this.transformSchemaData();

    if (databases.length === 0 || !this.editor) {
      return;
    }

    // Register completion provider using the service
    this.completionProviderDisposable =
      this.monacoIntelliSenseService.registerSQLCompletions(
        databases,
        this.editor
      );

    // Register hover provider using the service
    this.hoverProviderDisposable =
      this.monacoIntelliSenseService.registerHoverProvider(databases);
  }

  /**
   * Transform schemaData from config-prompt format to MonacoIntelliSenseService format
   *
   * Input format (staticSchemaData from config-prompt):
   * [{ schema_name: string, tables: [{ table_name, table_alias, columns: [{ name, type }] }] }]
   *
   * Output format (DatabaseSchema for MonacoIntelliSenseService):
   * [{ name: string, schemas: [{ name, tables: [{ name, columns: [{ name, type, nullable, isPrimaryKey, isForeignKey }] }] }] }]
   */
  private transformSchemaData(): any[] {
    if (!this.schemaData || this.schemaData.length === 0) {
      return [];
    }

    // Group all schemas under a single database structure
    const schemas = this.schemaData.map((schema: any) => ({
      name: schema.schema_name,
      tables: (schema.tables || []).map((table: any) => ({
        name: table.table_name,
        columns: (table.columns || []).map((col: any) => ({
          name: col.name,
          type: col.type || 'unknown',
          nullable: col.nullable ?? true,
          isPrimaryKey: col.isPrimaryKey ?? false,
          isForeignKey: col.isForeignKey ?? false,
          foreignKeyTable: col.foreignKeyTable,
          foreignKeyColumn: col.foreignKeyColumn,
        })),
      })),
    }));

    // Return as a database structure expected by the service
    return [
      {
        name: 'database',
        schemas: schemas,
      },
    ];
  }

  onCancel(): void {
    this.close.emit();
  }

  onExecute(): void {
    if (!this.sqlQuery.trim()) {
      this.sqlError = 'Please enter a SQL query';
      return;
    }
    this.execute.emit(this.sqlQuery.trim());
  }

  setError(error: string): void {
    this.sqlError = error;
  }
}
