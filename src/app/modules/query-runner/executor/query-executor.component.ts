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

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { PostgreSQL, sql, keywordCompletionSource } from '@codemirror/lang-sql';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';

import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridOptions, ModuleRegistry, ClientSideRowModelModule, themeQuartz } from 'ag-grid-community';
import { format as formatSql } from 'sql-formatter';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { FormsModule } from '@angular/forms';

import { QueryRunnerService } from '../services/query-runner.service';
import { SchemaCatalog } from './schema-catalog';
import { dbexecCompletionSource } from './completion';
import { TypedCellComponent } from './typed-cell.component';

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

/**
 * QueryExecutorComponent — the standalone Query Runner workspace. Loads
 * OUTSIDE the app shell (no sidebar), so a browser tab is a focused,
 * full-screen SQL tool. Left object browser, CodeMirror editor with
 * catalog-driven IntelliSense, AG Grid typed results, run/format/cancel
 * toolbar, auto-commit + Commit/Rollback, status bar.
 *
 * Standalone component (imports its own deps) so it can be lazily loaded
 * by query-executor.module without the app shell modules.
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
  private catalog: SchemaCatalog | null = null;
  editorReady = false;

  // Execution
  running = false;
  autoCommit = false; // OFF ⇒ read-only preview; ON ⇒ writes commit
  results: QueryResult[] = [];
  activeResult = 0;
  private executionId: string | null = null;
  elapsedMs: number | null = null;
  statusText = '';

  // Object browser
  catalogLoading = false;
  browser: {
    schema: string;
    open: boolean;
    tables: { name: string; type: string; open: boolean; columns: { name: string; dataType: string; isPrimaryKey: boolean }[] }[];
  }[] = [];

  // AG Grid
  gridTheme = themeQuartz;
  gridOptions: GridOptions = {
    defaultColDef: { flex: 0, width: 170, resizable: true, sortable: true, filter: true, minWidth: 90 },
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
    this.loadConnectionMeta();
    this.loadCatalog();
  }

  ngAfterViewInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  // ── metadata + catalog ────────────────────────────────────────────

  private loadConnectionMeta(): void {
    this.service
      .getConnection(this.connectionId)
      .then(res => {
        if (res?.status && res.data) {
          this.connectionName = res.data.name;
          this.datasourceName = res.data.datasourceName ?? '';
          this.engine = res.data.engine ?? '';
          const t = this.datasourceName
            ? `${this.datasourceName} — Query Runner`
            : 'Query Runner';
          this.title.setTitle(t);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  private loadCatalog(): void {
    this.catalogLoading = true;
    this.cdr.markForCheck();
    this.service
      .getCatalog(this.connectionId)
      .then(res => {
        if (res?.status && res.data) {
          this.catalog = new SchemaCatalog(res.data);
          this.buildBrowser(res.data);
          this.reconfigureCatalog();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.catalogLoading = false;
        this.cdr.markForCheck();
      });
  }

  private buildBrowser(dto: any): void {
    const bySchema = new Map<string, any[]>();
    for (const t of dto.tables ?? []) {
      const arr = bySchema.get(t.schema) ?? [];
      const cols = (dto.columns ?? [])
        .filter((c: any) => c.schema === t.schema && c.table === t.name)
        .map((c: any) => ({ name: c.column, dataType: c.dataType, isPrimaryKey: c.isPrimaryKey }));
      arr.push({ name: t.name, type: t.type, open: false, columns: cols });
      bySchema.set(t.schema, arr);
    }
    this.browser = (dto.schemas ?? []).map((s: string) => ({
      schema: s,
      open: s === 'public',
      tables: bySchema.get(s) ?? [],
    }));
  }

  toggleSchema(s: any): void {
    s.open = !s.open;
  }
  toggleTable(t: any): void {
    t.open = !t.open;
  }

  /** Double-click a table → insert a SELECT into the editor. */
  insertSelect(schema: string, table: string): void {
    const stmt = `SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`;
    this.replaceAll(stmt);
  }

  insertText(text: string): void {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({ changes: { from, to, insert: text } });
    this.view.focus();
  }

  // ── editor ────────────────────────────────────────────────────────

  private buildLanguage() {
    return [
      sql({ dialect: PostgreSQL }),
      autocompletion({
        activateOnTyping: true,
        override: [
          ...(this.catalog ? [dbexecCompletionSource(this.catalog)] : []),
          keywordCompletionSource(PostgreSQL, false),
        ],
      }),
    ];
  }

  private initEditor(): void {
    // Build the editor outside Angular's zone (CM manages its own DOM).
    this.zone.runOutsideAngular(() => {
      this.view = new EditorView({
        parent: this.editorHost.nativeElement,
        state: EditorState.create({
          doc: '-- Write SQL. Ctrl/Cmd+Enter runs the statement.\n',
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            drawSelection(),
            history(),
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            highlightSelectionMatches(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            this.langCompartment.of(this.buildLanguage()),
            keymap.of([
              {
                key: 'Mod-Enter',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.run());
                  return true;
                },
              },
              {
                key: 'Mod-Shift-Enter',
                preventDefault: true,
                run: () => {
                  this.zone.run(() => this.run());
                  return true;
                },
              },
              indentWithTab,
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...historyKeymap,
              ...completionKeymap,
              ...searchKeymap,
            ]),
            EditorView.theme({
              '&': { height: '100%' },
              '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '13px' },
            }),
          ],
        }),
      });
    });
    this.editorReady = true;
    this.cdr.markForCheck();
  }

  private reconfigureCatalog(): void {
    if (!this.view) return;
    this.view.dispatch({
      effects: this.langCompartment.reconfigure(this.buildLanguage()),
    });
  }

  private getSql(): string {
    return this.view ? this.view.state.doc.toString() : '';
  }
  private getSelection(): string | null {
    if (!this.view) return null;
    const { from, to } = this.view.state.selection.main;
    return from === to ? null : this.view.state.sliceDoc(from, to);
  }
  private replaceAll(text: string): void {
    if (!this.view) return;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
  }

  // ── run / cancel / format ──────────────────────────────────────────

  private genId(): string {
    return 'ex_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  run(): void {
    if (this.running) return;
    const sqlText = this.getSelection() ?? this.getSql();
    if (!sqlText.trim()) return;

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
        const { from, to } = this.view.state.selection.main;
        this.view.dispatch({ changes: { from, to, insert: formatSql(sel, opts) } });
      } else {
        this.replaceAll(formatSql(this.getSql(), opts));
      }
    } catch {
      /* sql-formatter throws on unparseable input; leave the text as-is */
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

  // ── result grid helpers ─────────────────────────────────────────────

  get activeRows(): QueryRow | null {
    const r = this.results[this.activeResult];
    return r && r.kind === 'rows' ? r : null;
  }

  colDefs(r: QueryRow): ColDef[] {
    return r.columns.map(c => ({
      headerName: c.name,
      field: c.field,
      headerTooltip: `${c.name} · ${c.semanticType}`,
      cellRenderer: TypedCellComponent,
      cellRendererParams: { semanticType: c.semanticType },
      type: c.semanticType === 'number' ? 'rightAligned' : undefined,
    }));
  }

  tabLabel(r: QueryResult, i: number): string {
    if (r.kind === 'rows') return `Result ${i + 1} (${r.rowCount})`;
    if (r.kind === 'message') return r.command || `Message ${i + 1}`;
    if (r.kind === 'error') return 'Error';
    return `#${i + 1}`;
  }

  refreshCatalog(): void {
    this.loadCatalog();
  }
}
