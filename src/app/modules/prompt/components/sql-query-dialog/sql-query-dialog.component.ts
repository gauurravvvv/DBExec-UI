import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { MonacoIntelliSenseService } from '../../../dataset/services/monaco-intellisense.service';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';

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
  // Match the rest of the app: JetBrains Mono. Monaco doesn't resolve
  // var(--font-mono), so the stack is duplicated.
  fontSize: 14,
  fontFamily:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SqlQueryDialogComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @ViewChild('sqlQueryEditorContainer')
  sqlQueryEditorContainer!: ElementRef<HTMLDivElement>;
  @Input() visible = false;
  @Input() schemaData: any[] = []; // Schema structure with tables and columns
  @Input() currentSchema: string = '';
  // Mirrors the parent's saving signal so the Execute button can
  // spin + disable while the parent's getPromptValuesBySQL POST is
  // in flight.
  @Input() executing = false;
  @Output() close = new EventEmitter<void>();
  @Output() execute = new EventEmitter<string>();

  sqlQuery = '';
  isSqlLoading = false;
  sqlError = '';

  // Monaco Editor
  editor: any = null;
  /** Owns the editor lifetime; see CodeEditorService. */
  private handle: EditorHandle | null = null;
  private codeEditor = inject(CodeEditorService);
  private completionProviderDisposable: any = null;
  private hoverProviderDisposable: any = null;
  private signatureHelpDisposable: any = null;
  isLoadingEditor = true;
  monacoLoadFailed = false;
  // Light default — Monaco's setTheme is global; a dark default could

  constructor(
    private monacoIntelliSenseService: MonacoIntelliSenseService,
    private monacoLoader: MonacoLoaderService,
  ) {}

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
      // Through the handle: it disposes the editor plus every listener and
      // overlay registered against it, so nothing is left behind.
      this.handle?.dispose();
      this.handle = null;
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
          // Through the handle: it disposes the editor plus every listener and
          // overlay registered against it, so nothing is left behind.
          this.handle?.dispose();
          this.handle = null;
          this.editor = null;
        }
      }
    }
  }


  /**
   * Setup MutationObserver to watch for theme changes
   */

  /**
   * Update Monaco Editor theme
   */
  private updateEditorTheme(): void {
    if (this.editor) {
    }
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
      });
  }

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  private initMonaco(): void {
    // Wait for the DOM to be ready
    setTimeout(async () => {
      const container = this.sqlQueryEditorContainer?.nativeElement;
      if (!container) {
        this.isLoadingEditor = false;
        return;
      }

      try {
        // Setup theme monitoring

        // Dispose previous editor if exists
        if (this.editor) {
          // Through the handle: it disposes the editor plus every listener and
          // overlay registered against it, so nothing is left behind.
          this.handle?.dispose();
          this.handle = null;
        }
        // One call replaces load → register language → define theme → create →
        // re-assert the global theme → focus. CodeEditorService owns that sequence
        // for every editor in the app, so this screen cannot drift from the others.
        const handle = await this.codeEditor.create({
          host: container,
          flavour: 'sql',
          value: this.sqlQuery || '',
                  autoFocus: true,
        });
        this.handle = handle;
        // Existing call sites keep using this.editor; the handle is what
        // disposal goes through.
        this.editor = handle.editor;

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
    const datasources = this.transformSchemaData();

    if (datasources.length === 0 || !this.editor) {
      return;
    }

    // Register completion provider using the service
    this.completionProviderDisposable =
      this.monacoIntelliSenseService.registerSQLCompletions(
        datasources,
        this.editor,
      );

    // Register hover provider using the service
    this.hoverProviderDisposable =
      this.monacoIntelliSenseService.registerHoverProvider(datasources);

    // Register signature help provider
    this.signatureHelpDisposable =
      this.monacoIntelliSenseService.registerSignatureHelpProvider();
  }

  /**
   * Transform schemaData from config-prompt format to MonacoIntelliSenseService format
   *
   * Input format (staticSchemaData from config-prompt):
   * [{ schema_name: string, tables: [{ table_name, table_alias, columns: [{ name, type }] }] }]
   *
   * Output format (DatasourceSchema for MonacoIntelliSenseService):
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
        name: 'datasource',
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
