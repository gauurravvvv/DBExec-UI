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
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
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

import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ModuleRegistry,
  ClientSideRowModelModule,
  themeQuartz,
} from 'ag-grid-community';
import { format as formatSql } from 'sql-formatter';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleButtonModule } from 'primeng/togglebutton';
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
  | { kind: 'error'; message: string; code?: string; hint?: string; offset?: number; statementIndex: number };

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
  // group folder open state
  g: { tables: boolean; views: boolean; matviews: boolean; functions: boolean; sequences: boolean };
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
    ToggleButtonModule,
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

  connectionId = '';
  connectionName = '';
  datasourceName = '';
  engine = '';

  // Editor
  private view!: EditorView;
  private langCompartment = new Compartment();
  private wrapCompartment = new Compartment();
  private catalog = new SchemaCatalog();
  editorReady = false;
  wordWrap = false;

  // Execution
  running = false;
  autoCommit = false; // OFF ⇒ read-only preview; ON ⇒ writes commit
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

  // AG Grid
  gridTheme = themeQuartz;
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
          g: { tables: true, views: false, matviews: false, functions: false, sequences: false },
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
              '.cm-scroller': {
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: '13px',
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
      .execute(this.connectionId, sqlText, this.autoCommit, this.executionId)
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
    return `#${i + 1}`;
  }

  refreshSchemas(): void {
    this.loadSchemas();
  }
}
