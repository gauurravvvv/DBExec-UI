import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
} from '@codemirror/autocomplete';
import {
  copyLineDown,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  toggleComment,
} from '@codemirror/commands';
import { PostgreSQL, sql, keywordCompletionSource } from '@codemirror/lang-sql';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { lintGutter, setDiagnostics, Diagnostic } from '@codemirror/lint';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { showMinimap } from '@replit/codemirror-minimap';

import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ModuleRegistry,
  ClientSideRowModelModule,
  themeQuartz,
  colorSchemeLightWarm,
} from 'ag-grid-community';
import { format as formatSql } from 'sql-formatter';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { FormsModule } from '@angular/forms';

import { QueryRunnerService } from '../services/query-runner.service';
import { SchemaCatalog } from './schema-catalog';
import { dbexecCompletionSource } from './completion';
import { TypedCellComponent } from './typed-cell.component';
import { splitStatements, statementAtCursor } from './split-statements';
import { ObjectDetailComponent, ObjectKind } from './object-detail.component';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

interface QueryRow {
  kind: 'rows';
  columns: { name: string; field: string; semanticType: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  statementIndex: number;
}
type QueryResult =
  | QueryRow
  | { kind: 'message'; command: string; text: string; elapsedMs: number; statementIndex: number }
  | { kind: 'error'; message: string; code?: string; hint?: string; offset?: number; statementIndex: number }
  | { kind: 'explain'; plan: any; analyzed: boolean; elapsedMs: number; statementIndex: number };

interface TreeTable {
  name: string;
  type: string;
  open: boolean;
  loading: boolean;
  loaded: boolean;
  columns: { name: string; dataType: string; isPrimaryKey: boolean }[];
}
/** A non-table object node (view / matview / function / sequence). */
interface TreeObject {
  name: string;
  args?: string;
  returns?: string;
}
/** A trigger node — carries its owning table (triggers are per-table). */
interface TreeTrigger {
  name: string;
  table: string;
  timing?: string;
  events?: string;
}
interface TreeSchema {
  schema: string;
  open: boolean;
  loading: boolean;
  loaded: boolean;
  tables: TreeTable[];
  views: TreeObject[];
  matviews: TreeObject[];
  functions: TreeObject[];
  sequences: TreeObject[];
  triggers: TreeTrigger[];
  // group folder open state
  g: {
    tables: boolean;
    views: boolean;
    matviews: boolean;
    functions: boolean;
    sequences: boolean;
    triggers: boolean;
  };
}

/** CM effect + field: transient highlight of the range that just ran. */
const setRunFlash = StateEffect.define<{ from: number; to: number } | null>();
const runFlashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setRunFlash)) {
        value = e.value
          ? Decoration.set([
              Decoration.mark({ class: 'qx-run-flash' }).range(
                e.value.from,
                e.value.to,
              ),
            ])
          : Decoration.none;
      }
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * QueryExecutorComponent — the standalone Query Runner workspace. Full
 * SQL editor: lazy schema tree, CodeMirror with IntelliSense + find/
 * replace + comment toggle + folding + wrapping + multi-cursor + smart
 * run (selection / statement-at-cursor) + go-to-error + autosave, and an
 * AG Grid result panel with export / copy / quick-filter / column
 * filters. Loads outside the app shell.
 */
@Component({
  selector: 'app-query-executor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    AgGridAngular,
    ButtonModule,
    TooltipModule,
    MenuModule,
    ObjectDetailComponent,
  ],
  templateUrl: './query-executor.component.html',
  styleUrls: ['./query-executor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueryExecutorComponent implements OnInit, AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  @ViewChild('editorHost', { static: false }) editorHost!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  connectionId = '';
  connectionName = '';
  datasourceName = '';
  engine = '';

  // Editor
  private view!: EditorView;
  private langCompartment = new Compartment();
  private wrapCompartment = new Compartment();
  private minimapCompartment = new Compartment();
  private catalog = new SchemaCatalog();
  editorReady = false;
  wordWrap = false;
  minimapOn = true;

  // Editor overlays (command palette / go-to-line / shortcuts help)
  paletteOpen = false;
  paletteQuery = '';
  paletteItems: { id: string; label: string; hint?: string; icon: string }[] = [];
  gotoOpen = false;
  gotoValue = '';
  shortcutsOpen = false;

  // SQL file upload (button / overflow / drag-drop)
  dragOver = false; // drop-overlay visible while a file is dragged over
  loadChoiceOpen = false; // replace/append prompt when the editor isn't empty
  private pendingFileSql: string | null = null;
  private pendingFileName = '';
  // Max .sql we'll read into the editor (guards a giant accidental drop).
  private readonly MAX_SQL_BYTES = 5 * 1024 * 1024;

  // Toolbar overflow menu (PrimeNG p-menu)
  overflowItems: MenuItem[] = [];

  // Execution
  running = false;
  autoCommit = false; // OFF ⇒ read-only preview; ON ⇒ writes commit
  explainMode = false; // when ON, Run wraps statements in EXPLAIN
  results: QueryResult[] = [];
  activeResult = 0;
  private executionId: string | null = null;
  elapsedMs: number | null = null;
  statusText = '';
  cursorInfo = 'Ln 1, Col 1';

  // Object browser (lazy)
  schemasLoading = false;
  browser: TreeSchema[] = [];
  private storageKey = '';

  // Object-detail modal
  detailVisible = false;
  detailKind: ObjectKind | null = null;
  detailSchema = '';
  detailName = '';
  detailTable = ''; // for triggers (owning table)

  // AG Grid
  // Same AG Grid theme the canonical us-data-grid uses, so the executor's
  // result grid matches every other grid in the app (see
  // us-data-grid.component.ts).
  gridTheme = themeQuartz.withPart(colorSchemeLightWarm);
  private gridApi: GridApi | null = null;
  quickFilter = '';
  showFilters = false;
  gridOptions: GridOptions = {
    defaultColDef: {
      flex: 0,
      width: 170,
      resizable: true,
      sortable: true,
      filter: true,
      minWidth: 90,
    },
    enableCellTextSelection: true,
    ensureDomOrder: true,
    rowSelection: 'multiple' as any,
    suppressFieldDotNotation: true,
    animateRows: false,
  };

  constructor(
    private route: ActivatedRoute,
    private service: QueryRunnerService,
    private title: Title,
  ) {}

  ngOnInit(): void {
    this.connectionId = this.route.snapshot.queryParamMap.get('conn') ?? '';
    if (!this.connectionId) {
      this.statusText = 'No connection specified';
      return;
    }
    this.storageKey = `qx-draft:${this.connectionId}`;
    // Restore minimap preference (default on).
    try {
      this.minimapOn = localStorage.getItem('qx-minimap') !== '0';
    } catch {
      /* storage disabled */
    }
    this.buildOverflowMenu();
    this.loadConnectionMeta();
    this.loadSchemas();
  }

  ngAfterViewInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  // ── metadata + lazy catalog ────────────────────────────────────────

  private loadConnectionMeta(): void {
    this.service
      .getConnection(this.connectionId)
      .then(res => {
        if (res?.status && res.data) {
          this.connectionName = res.data.name;
          this.datasourceName = res.data.datasourceName ?? '';
          this.engine = res.data.engine ?? '';
          this.title.setTitle(
            this.datasourceName
              ? `${this.datasourceName} — Query Runner`
              : 'Query Runner',
          );
        }
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  /** First paint: schema names only. */
  private loadSchemas(): void {
    this.schemasLoading = true;
    this.cdr.markForCheck();
    this.service
      .getSchemas(this.connectionId)
      .then(res => {
        const schemas: string[] = res?.status ? (res.data?.schemas ?? []) : [];
        this.catalog.setSchemas(schemas);
        this.browser = schemas.map(s => ({
          schema: s,
          open: false,
          loading: false,
          loaded: false,
          tables: [],
          views: [],
          matviews: [],
          functions: [],
          sequences: [],
          triggers: [],
          g: {
            tables: true,
            views: false,
            matviews: false,
            functions: false,
            sequences: false,
            triggers: false,
          },
        }));
        this.reconfigureCatalog();
      })
      .catch(() => {})
      .finally(() => {
        this.schemasLoading = false;
        this.cdr.markForCheck();
      });
  }

  /** Expand a schema → lazy-load ALL its objects, grouped (once). */
  toggleSchema(s: TreeSchema): void {
    s.open = !s.open;
    if (s.open && !s.loaded && !s.loading) {
      this.loadSchemaObjects(s);
    }
  }

  private loadSchemaObjects(s: TreeSchema): void {
    s.loading = true;
    this.cdr.markForCheck();
    this.service
      .getObjects(this.connectionId, s.schema)
      .then(res => {
        const d = res?.status ? res.data : null;
        const tables = d?.tables ?? [];
        s.tables = tables.map((t: any) => ({
          name: t.name,
          type: t.type,
          open: false,
          loading: false,
          loaded: false,
          columns: [],
        }));
        s.views = (d?.views ?? []).map((v: any) => ({ name: v.name }));
        s.matviews = (d?.matviews ?? []).map((v: any) => ({ name: v.name }));
        s.functions = (d?.functions ?? []).map((f: any) => ({
          name: f.name,
          args: f.args,
          returns: f.returns,
        }));
        s.sequences = (d?.sequences ?? []).map((q: any) => ({ name: q.name }));
        s.triggers = (d?.triggers ?? []).map((t: any) => ({
          name: t.name,
          table: t.table,
          timing: t.timing,
          events: t.events,
        }));
        s.loaded = true;
        // Feed IntelliSense: tables + views are queryable relations.
        this.catalog.setTables(s.schema, [
          ...tables,
          ...s.views.map(v => ({ name: v.name, type: 'view' })),
          ...s.matviews.map(v => ({ name: v.name, type: 'matview' })),
        ]);
        this.reconfigureCatalog();
      })
      .catch(() => {})
      .finally(() => {
        s.loading = false;
        this.cdr.markForCheck();
      });
  }

  /** Group folder toggle (Tables / Views / …). */
  toggleGroup(s: TreeSchema, group: keyof TreeSchema['g']): void {
    s.g[group] = !s.g[group];
  }

  /** Refresh one schema's objects (clears cache + re-fetches). */
  refreshSchema(s: TreeSchema): void {
    s.loaded = false;
    s.tables = [];
    s.views = [];
    s.matviews = [];
    s.functions = [];
    s.sequences = [];
    s.triggers = [];
    this.loadSchemaObjects(s);
  }

  /** Expand a table → lazy-load its columns (once). */
  toggleTable(s: TreeSchema, t: TreeTable): void {
    t.open = !t.open;
    if (t.open && !t.loaded && !t.loading) {
      this.fetchColumns(s.schema, t);
    }
  }

  private fetchColumns(schema: string, t: TreeTable): void {
    t.loading = true;
    this.cdr.markForCheck();
    this.service
      .getColumns(this.connectionId, schema, t.name)
      .then(res => {
        const cols = res?.status ? (res.data?.columns ?? []) : [];
        t.columns = cols.map((c: any) => ({
          name: c.column,
          dataType: c.dataType,
          isPrimaryKey: c.isPrimaryKey,
        }));
        t.loaded = true;
        this.catalog.setColumns(
          schema,
          t.name,
          cols.map((c: any) => ({
            name: c.column,
            dataType: c.dataType,
            isPrimaryKey: c.isPrimaryKey,
            nullable: c.isNullable,
          })),
        );
      })
      .catch(() => {})
      .finally(() => {
        t.loading = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Lazy column loader used by IntelliSense: fetch a table's columns if
   * we don't have them, then re-trigger completion so they appear.
   */
  private requestColumnsForCompletion = (
    schema: string | undefined,
    table: string,
  ): void => {
    if (this.catalog.hasColumns(schema, table)) return;
    // Resolve the real schema: prefer the given one, else find the table
    // in any loaded schema.
    let sch = schema;
    if (!sch) {
      for (const s of this.browser) {
        if (s.tables.some(t => t.name.toLowerCase() === table.toLowerCase())) {
          sch = s.schema;
          break;
        }
      }
    }
    if (!sch) sch = this.catalog.defaultSchema;
    this.service
      .getColumns(this.connectionId, sch, table)
      .then(res => {
        if (res?.status) {
          const cols = res.data?.columns ?? [];
          this.catalog.setColumns(
            sch!,
            table,
            cols.map((c: any) => ({
              name: c.column,
              dataType: c.dataType,
              isPrimaryKey: c.isPrimaryKey,
              nullable: c.isNullable,
            })),
          );
          // Re-fire completion so the freshly-loaded columns show.
          if (this.view) startCompletion(this.view);
        }
      })
      .catch(() => {});
  };

  insertSelect(schema: string, table: string): void {
    this.replaceAll(`SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`);
  }

  insertText(text: string): void {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({ changes: { from, to, insert: text } });
    this.view.focus();
  }

  /** Open the read-only detail modal for any object node. */
  openObject(kind: ObjectKind, schema: string, name: string): void {
    this.detailKind = kind;
    this.detailSchema = schema;
    this.detailName = name;
    this.detailTable = '';
    this.detailVisible = true;
    this.cdr.markForCheck();
  }

  /** Open the detail modal for a trigger (needs its owning table). */
  openTrigger(schema: string, table: string, name: string): void {
    this.detailKind = 'trigger';
    this.detailSchema = schema;
    this.detailName = name;
    this.detailTable = table;
    this.detailVisible = true;
    this.cdr.markForCheck();
  }

  closeDetail(): void {
    this.detailVisible = false;
    this.cdr.markForCheck();
  }

  // ── editor ────────────────────────────────────────────────────────

  private buildLanguage() {
    return [
      sql({ dialect: PostgreSQL }),
      autocompletion({
        activateOnTyping: true,
        override: [
          dbexecCompletionSource(this.catalog, this.requestColumnsForCompletion),
          keywordCompletionSource(PostgreSQL, false),
        ],
      }),
    ];
  }

  private initEditor(): void {
    const saved = this.loadDraft();
    this.zone.runOutsideAngular(() => {
      this.view = new EditorView({
        parent: this.editorHost.nativeElement,
        state: EditorState.create({
          doc: saved ?? '',
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            drawSelection(),
            rectangularSelection(),
            history(),
            foldGutter(),
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            highlightSelectionMatches(),
            search({ top: true }),
            lintGutter(),
            runFlashField,
            placeholder('-- Write SQL. Ctrl/Cmd+Enter runs the statement at the cursor.'),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            this.wrapCompartment.of([]),
            this.minimapCompartment.of(this.minimapOn ? this.minimapExtension() : []),
            this.langCompartment.of(this.buildLanguage()),
            keymap.of([
              {
                key: 'Mod-Enter',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.run('smart'));
                  return true;
                },
              },
              {
                key: 'Mod-Shift-Enter',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.run('all'));
                  return true;
                },
              },
              {
                key: 'Mod-/',
                preventDefault: true,
                run: toggleComment,
              },
              {
                key: 'Mod-Shift-p',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.openPalette());
                  return true;
                },
              },
              {
                key: 'Mod-g',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.openGoto());
                  return true;
                },
              },
              // Duplicate line ↓ and move line ↑/↓ — VSCode parity.
              { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
              { key: 'Alt-ArrowUp', run: moveLineUp },
              { key: 'Alt-ArrowDown', run: moveLineDown },
              indentWithTab,
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...historyKeymap,
              ...foldKeymap,
              ...completionKeymap,
              ...searchKeymap,
            ]),
            EditorView.updateListener.of(u => {
              if (u.docChanged) this.scheduleAutosave();
              if (u.selectionSet || u.docChanged) this.updateCursorInfo();
            }),
            EditorView.theme({
              '&': { height: '100%' },
              // Match the app's mono stack + a comfortable, readable editor
              // size (14px / 1.6). Fuller chrome theming (gutters, selection,
              // autocomplete, find panel) lives in the GLOBAL
              // _codemirror-theme.scss — CM appends those layers to body.
              '.cm-scroller': {
                fontFamily: 'var(--font-mono)',
                // Explicit px (not a rem token): the app root font-size is
                // 14px, so rem tokens render ~12px in the editor — too small
                // for code. 14px absolute keeps it comfortable everywhere.
                fontSize: '14px',
                lineHeight: '1.65',
              },
            }),
          ],
        }),
      });
    });
    this.editorReady = true;
    this.updateCursorInfo();
    this.cdr.markForCheck();
  }

  private reconfigureCatalog(): void {
    if (!this.view) return;
    this.view.dispatch({
      effects: this.langCompartment.reconfigure(this.buildLanguage()),
    });
  }

  toggleWrap(): void {
    this.wordWrap = !this.wordWrap;
    this.view?.dispatch({
      effects: this.wrapCompartment.reconfigure(
        this.wordWrap ? EditorView.lineWrapping : [],
      ),
    });
  }

  // ── minimap (VSCode-style) ──────────────────────────────────────────

  /** Build the minimap facet extension, themed via the container's class. */
  private minimapExtension() {
    return showMinimap.compute([], () => ({
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'qx-minimap';
        return { dom };
      },
      displayText: 'blocks',
      showOverlay: 'always',
    }));
  }

  toggleMinimap(): void {
    this.minimapOn = !this.minimapOn;
    this.view?.dispatch({
      effects: this.minimapCompartment.reconfigure(
        this.minimapOn ? this.minimapExtension() : [],
      ),
    });
    try {
      localStorage.setItem('qx-minimap', this.minimapOn ? '1' : '0');
    } catch {
      /* storage disabled */
    }
  }

  toggleExplain(): void {
    this.explainMode = !this.explainMode;
  }

  // ── command palette ─────────────────────────────────────────────────

  /** The full action list the palette (and shortcuts help) surfaces. */
  private paletteActions(): { id: string; label: string; hint?: string; icon: string; run: () => void }[] {
    return [
      { id: 'run', label: 'Run statement', hint: 'Ctrl/Cmd+Enter', icon: 'pi-play', run: () => this.run('smart') },
      { id: 'run-all', label: 'Run all', hint: 'Ctrl/Cmd+Shift+Enter', icon: 'pi-forward', run: () => this.run('all') },
      { id: 'format', label: 'Format SQL', hint: '', icon: 'pi-align-left', run: () => this.format() },
      { id: 'wrap', label: 'Toggle word wrap', hint: '', icon: 'pi-bars', run: () => this.toggleWrap() },
      { id: 'minimap', label: 'Toggle minimap', hint: '', icon: 'pi-map', run: () => this.toggleMinimap() },
      { id: 'explain', label: 'Toggle EXPLAIN mode', hint: '', icon: 'pi-sitemap', run: () => this.toggleExplain() },
      { id: 'goto', label: 'Go to line…', hint: 'Ctrl/Cmd+G', icon: 'pi-directions', run: () => this.openGoto() },
      { id: 'upper', label: 'Upper-case selection', hint: '', icon: 'pi-arrow-up', run: () => this.transformCase('upper') },
      { id: 'lower', label: 'Lower-case selection', hint: '', icon: 'pi-arrow-down', run: () => this.transformCase('lower') },
      { id: 'clear', label: 'Clear editor', hint: '', icon: 'pi-trash', run: () => this.clearEditor() },
      { id: 'copy', label: 'Copy all', hint: '', icon: 'pi-copy', run: () => this.copyAll() },
      { id: 'upload', label: 'Upload .sql file', hint: '', icon: 'pi-upload', run: () => this.openFileDialog() },
      { id: 'download', label: 'Download .sql', hint: '', icon: 'pi-download', run: () => this.downloadSql() },
    ];
  }

  openPalette(): void {
    this.paletteQuery = '';
    this.paletteItems = this.paletteActions().map(a => ({
      id: a.id,
      label: a.label,
      hint: a.hint,
      icon: a.icon,
    }));
    this.paletteOpen = true;
    this.cdr.markForCheck();
  }

  onPaletteFilter(): void {
    const q = this.paletteQuery.trim().toLowerCase();
    this.paletteItems = this.paletteActions()
      .filter(a => !q || a.label.toLowerCase().includes(q))
      .map(a => ({ id: a.id, label: a.label, hint: a.hint, icon: a.icon }));
    this.cdr.markForCheck();
  }

  runPaletteItem(id: string): void {
    const action = this.paletteActions().find(a => a.id === id);
    this.paletteOpen = false;
    this.cdr.markForCheck();
    action?.run();
    setTimeout(() => this.view?.focus(), 0);
  }

  closePalette(): void {
    this.paletteOpen = false;
    this.cdr.markForCheck();
    this.view?.focus();
  }

  // ── go to line ──────────────────────────────────────────────────────

  openGoto(): void {
    this.gotoValue = '';
    this.gotoOpen = true;
    this.cdr.markForCheck();
  }

  applyGoto(): void {
    const n = parseInt(this.gotoValue, 10);
    this.gotoOpen = false;
    this.cdr.markForCheck();
    if (!this.view || Number.isNaN(n)) {
      this.view?.focus();
      return;
    }
    const total = this.view.state.doc.lines;
    const lineNo = Math.min(Math.max(1, n), total);
    const line = this.view.state.doc.line(lineNo);
    this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    this.view.focus();
  }

  closeGoto(): void {
    this.gotoOpen = false;
    this.cdr.markForCheck();
    this.view?.focus();
  }

  // ── shortcuts help ──────────────────────────────────────────────────

  openShortcuts(): void {
    this.shortcutsOpen = true;
    this.cdr.markForCheck();
  }
  closeShortcuts(): void {
    this.shortcutsOpen = false;
    this.cdr.markForCheck();
  }

  // ── editor text actions (palette + overflow) ────────────────────────

  private transformCase(mode: 'upper' | 'lower'): void {
    const sel = this.getSelection();
    if (!this.view || !sel) return;
    const out = mode === 'upper' ? sel.text.toUpperCase() : sel.text.toLowerCase();
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: out } });
  }

  clearEditor(): void {
    this.replaceAll('');
    this.view?.focus();
  }

  copyAll(): void {
    try {
      navigator.clipboard?.writeText(this.getAll());
    } catch {
      /* clipboard blocked */
    }
  }

  downloadSql(): void {
    const blob = new Blob([this.getAll()], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.exportName('sql');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── SQL file upload (button / overflow / drag-drop) ─────────────────

  /**
   * Open the native file picker. Resolves the input via the ViewChild, or
   * falls back to a DOM lookup (the ViewChild can be undefined if the click
   * arrives from a PrimeNG menu/overlay callback). Clearing value first lets
   * the same file be re-picked.
   */
  openFileDialog(): void {
    const el =
      this.fileInput?.nativeElement ??
      (this.editorHost?.nativeElement
        ?.closest('.qx-shell')
        ?.querySelector('input.qx-file-input') as HTMLInputElement | null);
    if (!el) {
      this.statusText = 'File picker unavailable';
      this.cdr.markForCheck();
      return;
    }
    el.value = '';
    el.click();
  }

  /** Native picker change handler. */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.readSqlFile(file);
    // Reset so choosing the SAME file again still fires change.
    input.value = '';
  }

  /**
   * Read a .sql (or plain text) file's contents. Guards oversize + binary.
   * If the editor is empty, loads immediately; otherwise opens the
   * replace/append choice.
   */
  private readSqlFile(file: File): void {
    const nameOk = /\.(sql|txt|ddl|pgsql)$/i.test(file.name);
    if (!nameOk && file.type && !file.type.startsWith('text')) {
      this.statusText = 'Only .sql / text files can be loaded';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > this.MAX_SQL_BYTES) {
      this.statusText = 'File too large (max 5 MB)';
      this.cdr.markForCheck();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      this.pendingFileSql = text;
      this.pendingFileName = file.name;
      if (this.getAll().trim().length === 0) {
        // Empty editor → load straight in, no prompt.
        this.applyLoadedFile('replace');
      } else {
        this.loadChoiceOpen = true;
        this.cdr.markForCheck();
      }
    };
    reader.onerror = () => {
      this.statusText = 'Could not read file';
      this.cdr.markForCheck();
    };
    reader.readAsText(file);
  }

  /** Resolve the replace/append choice (or the auto path for an empty editor). */
  applyLoadedFile(mode: 'replace' | 'append'): void {
    const text = this.pendingFileSql ?? '';
    if (this.view) {
      if (mode === 'replace') {
        this.replaceAll(text);
      } else {
        const cur = this.getAll();
        const joiner = cur.endsWith('\n') || cur.length === 0 ? '' : '\n\n';
        this.replaceAll(cur + joiner + text);
      }
    }
    this.statusText = `Loaded ${this.pendingFileName}`;
    this.pendingFileSql = null;
    this.pendingFileName = '';
    this.loadChoiceOpen = false;
    this.cdr.markForCheck();
    this.view?.focus();
  }

  cancelLoadChoice(): void {
    this.pendingFileSql = null;
    this.pendingFileName = '';
    this.loadChoiceOpen = false;
    this.cdr.markForCheck();
    this.view?.focus();
  }

  // Drag-drop a .sql onto the editor. Only react when files are dragged.
  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!this.dragOver) {
      this.dragOver = true;
      this.cdr.markForCheck();
    }
  }
  onDragLeave(event: DragEvent): void {
    // Ignore leave events bubbling from children — only clear when leaving
    // the editor region entirely.
    if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      return;
    }
    this.dragOver = false;
    this.cdr.markForCheck();
  }
  onDrop(event: DragEvent): void {
    if (!event.dataTransfer) return;
    event.preventDefault();
    this.dragOver = false;
    this.cdr.markForCheck();
    const file = event.dataTransfer.files?.[0];
    if (file) this.readSqlFile(file);
  }

  /** PrimeNG overflow menu (⋯) — the less-used actions. */
  private buildOverflowMenu(): void {
    this.overflowItems = [
      { label: 'Upload .sql…', icon: 'pi pi-upload', command: () => this.openFileDialog() },
      { label: 'Download .sql', icon: 'pi pi-download', command: () => this.downloadSql() },
      { separator: true },
      { label: 'Go to line…', icon: 'pi pi-directions', command: () => this.openGoto() },
      { label: 'Upper-case selection', icon: 'pi pi-arrow-up', command: () => this.transformCase('upper') },
      { label: 'Lower-case selection', icon: 'pi pi-arrow-down', command: () => this.transformCase('lower') },
      { separator: true },
      { label: 'Copy all', icon: 'pi pi-copy', command: () => this.copyAll() },
      { label: 'Clear editor', icon: 'pi pi-trash', command: () => this.clearEditor() },
    ];
  }

  private updateCursorInfo(): void {
    if (!this.view) return;
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    this.zone.run(() => {
      this.cursorInfo = `Ln ${line.number}, Col ${pos - line.from + 1}`;
      this.cdr.markForCheck();
    });
  }

  private getAll(): string {
    return this.view ? this.view.state.doc.toString() : '';
  }
  private getSelection(): { text: string; from: number; to: number } | null {
    if (!this.view) return null;
    const { from, to } = this.view.state.selection.main;
    return from === to
      ? null
      : { text: this.view.state.sliceDoc(from, to), from, to };
  }
  private replaceAll(text: string): void {
    if (!this.view) return;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
  }

  // ── autosave (localStorage, per connection) ─────────────────────────

  private autosaveHandle: any = null;
  private scheduleAutosave(): void {
    if (this.autosaveHandle) clearTimeout(this.autosaveHandle);
    this.autosaveHandle = setTimeout(() => {
      try {
        localStorage.setItem(this.storageKey, this.getAll());
      } catch {
        /* quota / disabled — best-effort */
      }
    }, 600);
  }
  private loadDraft(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  // ── run / cancel / format ──────────────────────────────────────────

  private genId(): string {
    return 'ex_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /**
   * mode 'smart' = selection, else the statement at the cursor.
   * mode 'all'   = the whole editor.
   */
  run(mode: 'smart' | 'all' = 'smart'): void {
    if (this.running || !this.view) return;

    let sqlText: string;
    let range: { from: number; to: number } | null = null;
    if (mode === 'all') {
      sqlText = this.getAll();
    } else {
      const sel = this.getSelection();
      if (sel) {
        sqlText = sel.text;
        range = { from: sel.from, to: sel.to };
      } else {
        const pos = this.view.state.selection.main.head;
        const stmt = statementAtCursor(this.getAll(), pos);
        if (!stmt) return;
        sqlText = stmt.sql;
        range = { from: stmt.from, to: stmt.to };
      }
    }
    if (!sqlText.trim()) return;

    // Flash the range that will run (~500ms).
    if (range) {
      this.view.dispatch({ effects: setRunFlash.of(range) });
      setTimeout(() => this.view?.dispatch({ effects: setRunFlash.of(null) }), 500);
    }
    // Clear any prior error diagnostics.
    this.view.dispatch(setDiagnostics(this.view.state, []));

    this.running = true;
    this.results = [];
    this.activeResult = 0;
    this.executionId = this.genId();
    this.statusText = 'Running…';
    this.cdr.markForCheck();

    const t0 = performance.now();
    this.service
      .execute(this.connectionId, sqlText, this.autoCommit, this.executionId, {
        explain: this.explainMode,
        analyze: this.explainMode && this.autoCommit,
      })
      .then(res => {
        this.elapsedMs = Math.round(performance.now() - t0);
        if (res?.status && res.data?.results) {
          this.results = res.data.results as QueryResult[];
          this.statusText = this.summarize();
          this.maybeMarkError(range?.from ?? 0);
        } else {
          this.results = [
            { kind: 'error', message: res?.message ?? 'Execution failed', statementIndex: 0 },
          ];
          this.statusText = 'Error';
        }
      })
      .catch(err => {
        this.results = [
          { kind: 'error', message: err?.message ?? 'Execution failed', statementIndex: 0 },
        ];
        this.statusText = 'Error';
      })
      .finally(() => {
        this.running = false;
        this.executionId = null;
        this.cdr.markForCheck();
      });
  }

  /** If a result is an error with an offset, drop a lint marker + jump. */
  private maybeMarkError(base: number): void {
    if (!this.view) return;
    const err = this.results.find(r => r.kind === 'error') as
      | { kind: 'error'; message: string; offset?: number }
      | undefined;
    if (!err || err.offset == null) return;
    const pos = Math.min(Math.max(0, base + err.offset), this.view.state.doc.length);
    const diag: Diagnostic = {
      from: pos,
      to: Math.min(pos + 1, this.view.state.doc.length),
      severity: 'error',
      message: err.message,
    };
    this.view.dispatch(setDiagnostics(this.view.state, [diag]));
  }

  /** Jump the cursor to the failing offset. */
  goToError(): void {
    if (!this.view) return;
    const err = this.results[this.activeResult] as
      | { kind: 'error'; offset?: number }
      | undefined;
    if (!err || err.offset == null) return;
    const pos = Math.min(Math.max(0, err.offset), this.view.state.doc.length);
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }

  cancel(): void {
    if (!this.running || !this.executionId) return;
    this.service.cancel(this.connectionId, this.executionId).catch(() => {});
  }

  format(): void {
    if (!this.view) return;
    try {
      const opts = {
        language: 'postgresql' as const,
        keywordCase: 'upper' as const,
        tabWidth: 2,
      };
      const sel = this.getSelection();
      if (sel) {
        this.view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: formatSql(sel.text, opts) },
        });
      } else {
        this.replaceAll(formatSql(this.getAll(), opts));
      }
    } catch {
      /* unparseable → leave as-is */
    }
  }

  private summarize(): string {
    const r = this.results[this.activeResult];
    if (!r) return '';
    if (r.kind === 'rows') {
      return `${r.rowCount} row${r.rowCount === 1 ? '' : 's'} · ${Math.round(r.elapsedMs)} ms${r.truncated ? ' · truncated' : ''}`;
    }
    if (r.kind === 'message') return `${r.text} · ${Math.round(r.elapsedMs)} ms`;
    if (r.kind === 'error') return 'Error';
    if (r.kind === 'explain')
      return `Plan${r.analyzed ? ' (analyzed)' : ''} · ${Math.round(r.elapsedMs)} ms`;
    return '';
  }

  setActive(i: number): void {
    this.activeResult = i;
    this.statusText = this.summarize();
    this.cdr.markForCheck();
  }

  // ── result grid ─────────────────────────────────────────────────────

  get activeRows(): QueryRow | null {
    const r = this.results[this.activeResult];
    return r && r.kind === 'rows' ? r : null;
  }

  /**
   * Quiet context line shown above the active rows grid ("240 rows · 88 ms",
   * plus a truncation note). Purely derived from the active result — no new
   * state. Empty string when the active result isn't a row set.
   */
  get resultContext(): { count: string; elapsed: string; truncated: boolean } | null {
    const r = this.activeRows;
    if (!r) return null;
    return {
      count: `${r.rowCount.toLocaleString()} row${r.rowCount === 1 ? '' : 's'}`,
      elapsed: `${Math.round(r.elapsedMs).toLocaleString()} ms`,
      truncated: r.truncated,
    };
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
  }

  colDefs(r: QueryRow): ColDef[] {
    return r.columns.map(c => ({
      headerName: c.name,
      field: c.field,
      headerTooltip: `${c.name} · ${c.semanticType}`,
      cellRenderer: TypedCellComponent,
      cellRendererParams: { semanticType: c.semanticType },
      type: c.semanticType === 'number' ? 'rightAligned' : undefined,
      filter: true,
      floatingFilter: this.showFilters,
    }));
  }

  onQuickFilter(): void {
    this.gridApi?.setGridOption('quickFilterText', this.quickFilter);
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    // Re-apply colDefs so floatingFilter flips.
    const r = this.activeRows;
    if (r && this.gridApi) this.gridApi.setGridOption('columnDefs', this.colDefs(r));
    this.cdr.markForCheck();
  }

  exportCsv(): void {
    this.gridApi?.exportDataAsCsv({ fileName: this.exportName('csv') });
  }

  exportJson(): void {
    const r = this.activeRows;
    if (!r) return;
    const objects = r.rows.map(row => {
      const o: Record<string, unknown> = {};
      r.columns.forEach(c => (o[c.name] = row[c.field]));
      return o;
    });
    const blob = new Blob([JSON.stringify(objects, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.exportName('json');
    a.click();
    URL.revokeObjectURL(url);
  }

  private exportName(ext: string): string {
    const base = (this.datasourceName || 'query').replace(/[^A-Za-z0-9_-]+/g, '_');
    return `${base}_result.${ext}`;
  }

  tabLabel(r: QueryResult, i: number): string {
    if (r.kind === 'rows') return `Result ${i + 1} (${r.rowCount})`;
    if (r.kind === 'message') return r.command || `Message ${i + 1}`;
    if (r.kind === 'error') return 'Error';
    if (r.kind === 'explain') return 'Query plan';
    return `#${i + 1}`;
  }

  // ── EXPLAIN plan rendering helpers (result panel) ───────────────────

  /** The root plan node of the active explain result, or null. */
  get activePlan(): any | null {
    const r = this.results[this.activeResult];
    if (!r || r.kind !== 'explain') return null;
    // EXPLAIN (FORMAT JSON) → [ { "Plan": {...}, ... } ]
    const root = Array.isArray(r.plan) ? r.plan[0] : r.plan;
    return root?.Plan ?? root ?? null;
  }

  /** Pretty-printed full plan JSON (for the raw view / copy). */
  get activePlanJson(): string {
    const r = this.results[this.activeResult];
    if (!r || r.kind !== 'explain') return '';
    try {
      return JSON.stringify(r.plan, null, 2);
    } catch {
      return String(r.plan);
    }
  }

  /** Flatten a plan tree into indented rows for a readable node list. */
  planRows(node: any, depth = 0, acc: { depth: number; node: any }[] = []): { depth: number; node: any }[] {
    if (!node) return acc;
    acc.push({ depth, node });
    for (const child of node.Plans ?? []) this.planRows(child, depth + 1, acc);
    return acc;
  }

  copyPlan(): void {
    try {
      navigator.clipboard?.writeText(this.activePlanJson);
    } catch {
      /* clipboard blocked */
    }
  }

  // ── table data preview (object tree → SELECT * LIMIT 100) ───────────

  /**
   * Quick data preview for a table/view: drop a SELECT into the editor and
   * run it read-only so the rows land in the result grid. Reuses the
   * normal execute path (no dedicated BE endpoint).
   */
  previewData(schema: string, name: string): void {
    if (this.running) return;
    this.replaceAll(`SELECT *\nFROM ${schema}.${name}\nLIMIT 100;`);
    // Run everything (single statement just inserted).
    this.run('all');
  }

  refreshSchemas(): void {
    this.loadSchemas();
  }
}
