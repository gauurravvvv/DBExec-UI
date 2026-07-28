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
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { CodeEditorService, EditorHandle } from 'src/app/shared/editor/code-editor.service';
import { EditorDoc } from 'src/app/shared/editor/editor-doc';
import { catalogToDatasourceSchema } from 'src/app/shared/editor/schema-bridge';
import { MonacoIntelliSenseService } from 'src/app/modules/dataset/services/monaco-intellisense.service';
import { SqlValidatorService } from 'src/app/modules/dataset/services/sql-validator.service';
import { SqlFormatterService } from 'src/app/modules/dataset/services/sql-formatter.service';

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

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { FormsModule } from '@angular/forms';

import { QueryRunnerService } from '../services/query-runner.service';
import {
  SavedQueriesService,
  SavedQueryPayload,
} from '../services/saved-queries.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { SchemaCatalog } from './schema-catalog';
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
  | {
      kind: 'message';
      command: string;
      text: string;
      elapsedMs: number;
      statementIndex: number;
    }
  | {
      kind: 'error';
      message: string;
      code?: string;
      hint?: string;
      offset?: number;
      statementIndex: number;
    }
  | {
      kind: 'explain';
      plan: any;
      analyzed: boolean;
      elapsedMs: number;
      statementIndex: number;
    };

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
export class QueryExecutorComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private translate = inject(TranslateService);

  @ViewChild('editorHost', { static: false })
  editorHost!: ElementRef<HTMLDivElement>;

  connectionId = '';
  connectionName = '';
  datasourceId = '';
  datasourceName = '';
  engine = '';

  // ── Saved queries ───────────────────────────────────────────────────
  // When opened FROM a saved query (?query=<id>), we remember it so the
  // Save prompt can update it (vs. "Save as new"). SQL + rowLimit are
  // preloaded once the editor is ready.
  savedQueryId: string | null = null;
  /** True when this tab was opened via ?query= — its SQL comes from the
   *  saved query, never the per-connection autosave draft (which could be
   *  leftover from a DIFFERENT saved query on the same connection). */
  private openedFromSavedQuery = false;
  savedQueryName = '';
  savedQueryDescription = '';
  private pendingSavedSql: string | null = null; // applied after editor init
  savePromptOpen = false;
  saving = false;
  saveMode: 'new' | 'update' = 'new';
  savePromptName = '';
  savePromptDescription = '';

  // Editor
  /**
   * The editor, created through CodeEditorService so this screen shares the
   * app's one theme, options and disposal path.
   */
  private handle: EditorHandle | null = null;
  /**
   * Offset-oriented view of the model. The statement splitter works in character
   * offsets (it mirrors the backend splitter so "run statement at cursor" sends
   * exactly the range the server runs), so offsets are the natural currency here
   * and EditorDoc does the line/column conversion once.
   */
  private doc: EditorDoc | null = null;
  private catalog = new SchemaCatalog();
  editorReady = false;
  wordWrap = false;
  minimapOn = true;

  // Editor overlays (command palette / go-to-line / shortcuts help)
  paletteOpen = false;
  paletteQuery = '';
  paletteItems: { id: string; label: string; hint?: string; icon: string }[] =
    [];
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

  // Row-limit cap sent as maxRows on each run. Default 200. This does NOT
  // rewrite the user's SQL — the BE computes the full result then returns
  // only the first N rows and flags `truncated`. 1..50000 (BE also clamps).
  rowLimit = 200;
  private readonly MAX_ROW_LIMIT = 50000;

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

  // Server-side sort/filter/paging. When the BE reports the run is
  // `derivable` (a single wrappable SELECT), the grid drives sort/filter/page
  // by RE-RUNNING the query on the server (execute + `derived`) — AG Grid
  // Community has no serverSide row model, so we keep the clientSide model and
  // swap the current page's rows. When NOT derivable, everything stays
  // in-memory (client-side), exactly as before, and this state is inert.
  serverMode = false; // active result supports server-side ops
  serverLoading = false; // a derived re-run is in flight
  serverTotal = 0; // full (filtered) row count across all pages
  serverPage = 0; // 0-based page index
  private baseSql = ''; // the SELECT that was run (re-wrapped on each op)
  private sortModel: { ordinal: number; dir: 'asc' | 'desc' }[] = [];
  private filterModel: {
    col: string;
    op: string;
    value?: unknown;
  }[] = [];

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
  // Same AG Grid theme the canonical us-data-grid uses, plus explicit compact
  // sizing so the executor result grid matches the app's data density. The
  // raw ag-grid-angular here doesn't inherit us-data-grid's SCSS
  // (--ag-font-size: 13px), so Quartz defaulted to ~14-16px text in tall
  // ~36px rows and read "large". Pin the density via theme params.
  gridTheme = themeQuartz.withPart(colorSchemeLightWarm).withParams({
    fontSize: 13, // matches --fs-control (13px), the app's grid text size
    headerFontSize: 13,
    rowHeight: 30,
    headerHeight: 34,
    cellHorizontalPadding: 10,
  });
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
    private savedQueries: SavedQueriesService,
    private globalService: GlobalService,
    private title: Title,
    private codeEditor: CodeEditorService,
    private intelliSense: MonacoIntelliSenseService,
    private sqlValidator: SqlValidatorService,
    private sqlFormatter: SqlFormatterService,
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
    // Restore the row-limit (default 200).
    try {
      const saved = parseInt(localStorage.getItem('qx-row-limit') ?? '', 10);
      if (!Number.isNaN(saved)) this.rowLimit = this.clampLimit(saved);
    } catch {
      /* storage disabled */
    }
    this.buildOverflowMenu();
    this.loadConnectionMeta();
    this.loadSchemas();
    // If opened FROM a saved query, preload its SQL + rowLimit.
    const queryId = this.route.snapshot.queryParamMap.get('query');
    if (queryId) {
      this.openedFromSavedQuery = true;
      this.loadSavedQuery(queryId);
    }
  }

  /**
   * Load a saved query's SQL + rowLimit. The executor is standalone but
   * already makes authed calls (SavedQueriesService rides the same
   * x-auth-token interceptor). If the editor is already up we apply the
   * SQL immediately; otherwise initEditor() picks up `pendingSavedSql`.
   */
  private loadSavedQuery(id: string): void {
    this.savedQueries
      .getSavedQuery(id)
      .then(res => {
        if (res?.status && res.data) {
          const d = res.data;
          this.savedQueryId = d.id;
          this.savedQueryName = d.name ?? '';
          this.savedQueryDescription = d.description ?? '';
          if (d.rowLimit != null) this.rowLimit = this.clampLimit(d.rowLimit);
          const sql = d.sql ?? '';
          if (this.doc) {
            this.replaceAll(sql);
          } else {
            this.pendingSavedSql = sql;
          }
          this.title.setTitle(
            d.name ? `${d.name} — Query Runner` : 'Query Runner',
          );
        }
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  ngAfterViewInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    // One call: the handle disposes the editor plus every listener, provider and
    // overlay registered against it.
    this.handle?.dispose();
    this.handle = null;
    this.doc = null;
  }

  // ── metadata + lazy catalog ────────────────────────────────────────

  private loadConnectionMeta(): void {
    this.service
      .getConnection(this.connectionId)
      .then(res => {
        if (res?.status && res.data) {
          this.connectionName = res.data.name;
          this.datasourceId = res.data.datasourceId ?? '';
          this.datasourceName = res.data.datasourceName ?? '';
          this.engine = res.data.engine ?? '';
          // Don't clobber a saved-query title (set in loadSavedQuery).
          if (!this.savedQueryId) {
            this.title.setTitle(
              this.datasourceName
                ? `${this.datasourceName} — Query Runner`
                : 'Query Runner',
            );
          }
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
        this.refreshCompletions();
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
        this.refreshCompletions();
      })
      .catch(() => {})
      .finally(() => {
        s.loading = false;
        this.cdr.markForCheck();
      });
  }

  /** Group folder toggle (Tables / Views / …). */
  /**
   * Object-explorer filter text.
   *
   * The Dataset Creator's schema sidebar has always had a search box; this tree
   * did not, which was one of the last visible differences between the two
   * explorers. Same placeholder, same behaviour: match a schema by its own name,
   * or keep it because one of its tables matches.
   */
  schemaSearchText = '';

  /** True when `t`'s name matches, or one of its LOADED columns does. */
  private tableMatches(t: TreeTable, q: string): boolean {
    if (t.name.toLowerCase().includes(q)) return true;
    // Columns only exist here once the table has been expanded or completion
    // fetched them — the tree loads lazily. So a column search reaches what is
    // loaded, which is why the placeholder says "tables and loaded columns".
    return (t.columns ?? []).some(c => c.name.toLowerCase().includes(q));
  }

  /** Schemas to render: all of them, or those matching the filter. */
  get filteredSchemas(): TreeSchema[] {
    const q = this.schemaSearchText.trim().toLowerCase();
    if (!q) return this.browser;
    return this.browser.filter(
      s =>
        s.schema.toLowerCase().includes(q) ||
        s.tables.some(t => this.tableMatches(t, q)),
    );
  }

  /**
   * Tables of `s` to render under the filter.
   *
   * A schema whose OWN name matches keeps all its tables — searching for a schema
   * should show what is in it, not hide everything because the table names differ.
   */
  tablesFor(s: TreeSchema): TreeTable[] {
    const q = this.schemaSearchText.trim().toLowerCase();
    if (!q || s.schema.toLowerCase().includes(q)) return s.tables;
    return s.tables.filter(t => this.tableMatches(t, q));
  }

  /** Columns of `t` to render under the filter. */
  columnsFor(t: TreeTable): TreeTable['columns'] {
    const q = this.schemaSearchText.trim().toLowerCase();
    const cols = t.columns ?? [];
    if (!q || t.name.toLowerCase().includes(q)) return cols;
    const hits = cols.filter(c => c.name.toLowerCase().includes(q));
    // A table kept only because its NAME matched shows all its columns; a table
    // kept because a column matched shows just the matches.
    return hits.length ? hits : cols;
  }

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
          // Re-feed the catalog and re-fire completion so the freshly loaded
          // columns appear in the list the user is already looking at.
          this.refreshCompletions();
          this.doc?.triggerSuggest();
        }
      })
      .catch(() => {});
  };

  insertSelect(schema: string, table: string): void {
    this.replaceAll(`SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`);
  }

  insertText(text: string): void {
    this.doc?.insertAtCursor(text);
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

  /**
   * Point the shared SQL IntelliSense at this connection.
   *
   * The executor used to carry its own 237-line CodeMirror completion source.
   * This is the same three behaviours — dot completion, clause-scoped columns,
   * tables after FROM/JOIN — plus what that source never had: CTE scope
   * tracking, alias generation, INSERT column lists and dialect-scoped keywords
   * and functions, from a 2,272-line implementation the dataset module already
   * relies on.
   *
   * The one capability the shared service lacked is lazy column loading, added
   * as `setColumnRequestHandler`: the executor browses arbitrary databases, so it
   * must not materialise every column up front.
   */
  private registerCompletions(): void {
    if (!this.handle) return;
    this.intelliSense.setActiveDbType(this.engine || undefined);
    this.intelliSense.setColumnRequestHandler((schema, table) =>
      this.requestColumnsForCompletion(schema ?? undefined, table),
    );
    // Registering returns a disposable; tracking it on the handle is what stops
    // the provider outliving this screen. A leaked provider is why the same
    // suggestions used to appear twice after revisiting an editor.
    const disposable = this.intelliSense.registerSQLCompletions(
      this.bridgedSchema() as any,
      this.handle.editor,
    );
    if (disposable) this.handle.track(disposable);
    this.handle.track(() => this.intelliSense.setColumnRequestHandler(null));
  }

  /**
   * Re-feed the schema after the catalog grows.
   *
   * The service reads from a cache primed by setDatasources(), so registration
   * itself never has to be redone — exactly how add-dataset re-feeds its tree as
   * lazy loads land.
   */
  private refreshCompletions(): void {
    this.intelliSense.setDatasources(this.bridgedSchema() as any);
  }

  private bridgedSchema() {
    return catalogToDatasourceSchema(
      this.connectionName || 'connection',
      this.engine || undefined,
      this.catalog,
    );
  }

  /**
   * Error markers from a failed run.
   *
   * Owned separately from the editor's own validation markers: `setModelMarkers`
   * replaces all markers for one owner, so sharing an owner string would make a
   * run failure wipe the syntax diagnostics and vice versa.
   */
  private setRunMarkers(markers: any[]): void {
    const model = this.handle?.editor?.getModel?.();
    if (!model) return;
    (window as any).monaco.editor.setModelMarkers(model, 'dbexec-run', markers);
  }

  private initEditor(): void {
    // A saved query opened via ?query= owns the initial doc: use its SQL if
    // already fetched, else start EMPTY and let loadSavedQuery's replaceAll
    // fill it in. Never fall back to the per-connection autosave draft in
    // that case — it could be leftover SQL from a different saved query on
    // the same connection (the draft key is per-connection, not per-query).
    // Only a plain tab (no ?query=) uses the draft.
    const initialDoc = this.openedFromSavedQuery
      ? (this.pendingSavedSql ?? '')
      : (this.pendingSavedSql ?? this.loadDraft() ?? '');
    this.pendingSavedSql = null;

    this.codeEditor
      .create({
        host: this.editorHost.nativeElement,
        flavour: 'sql',
        value: initialDoc,
        // Monaco has no placeholder option; the shared overlay reproduces the
        // hint CodeMirror's placeholder() extension used to render.
        placeholder: this.translate.instant('QUERY_RUNNER.EDITOR_PLACEHOLDER'),
        overrides: { minimap: { enabled: this.minimapOn } },
      })
      .then((handle: EditorHandle) => {
        this.handle = handle;
        this.doc = new EditorDoc(handle.editor);

        // Word wrap is a user toggle, so apply the persisted state now rather
        // than baking it into the shared options.
        handle.updateOptions({ wordWrap: this.wordWrap ? 'on' : 'off' });

        handle.onChange(() => {
          this.scheduleAutosave();
          this.updateCursorInfo();
          // Same real-time syntax validation the Dataset Creator runs, so an
          // error looks and reads identically on both screens. The validator
          // owns its own marker key, separate from the run-failure markers
          // this component sets, so neither wipes the other.
          this.sqlValidator.validateDebounced(handle.editor.getModel());
        });
        handle.track(
          handle.editor.onDidChangeCursorPosition(() =>
            this.zone.run(() => this.updateCursorInfo()),
          ),
        );

        // Only the app's own shortcuts need binding. Monaco already ships
        // comment toggle (Ctrl+/), duplicate line (Shift+Alt+Down), move line
        // (Alt+Up/Down), folding, find/replace and history on the same keys the
        // CodeMirror keymaps provided, so re-registering them would only risk
        // diverging from what users expect elsewhere in the editor.
        const KeyCode = (window as any).monaco.KeyCode;
        this.codeEditor.addShortcut(
          handle,
          { key: KeyCode.Enter, ctrlCmd: true },
          () => this.run('smart'),
        );
        this.codeEditor.addShortcut(
          handle,
          { key: KeyCode.Enter, ctrlCmd: true, shift: true },
          () => this.run('all'),
        );
        this.codeEditor.addShortcut(
          handle,
          { key: KeyCode.KeyP, ctrlCmd: true, shift: true },
          () => this.openPalette(),
        );
        this.codeEditor.addShortcut(
          handle,
          { key: KeyCode.KeyG, ctrlCmd: true },
          () => this.openGoto(),
        );

        this.registerCompletions();

        // Formatting through the shared service rather than a local call into
        // sql-formatter: the options (dialect, keyword case, indent) then match
        // the Dataset Creator exactly, instead of two screens formatting the
        // same SQL two ways.
        const fmt = this.sqlFormatter.registerFormattingProvider();
        if (fmt) handle.track(fmt);
        this.sqlFormatter.registerContextMenuActions(handle.editor);

        // Validate what was restored from the draft or the saved query.
        this.sqlValidator.validate(handle.editor.getModel());

        this.editorReady = true;
        this.updateCursorInfo();
        this.cdr.markForCheck();
      })
      .catch(() => {
        // Surface the failure rather than leaving an empty box: the toolbar
        // reads editorReady to decide whether Run can be enabled.
        this.editorReady = false;
        this.cdr.markForCheck();
      });
  }

  toggleWrap(): void {
    this.wordWrap = !this.wordWrap;
    // A live option change, where CodeMirror needed a Compartment reconfigure.
    this.handle?.updateOptions({ wordWrap: this.wordWrap ? 'on' : 'off' });
  }

  // ── minimap ─────────────────────────────────────────────────────────

  toggleMinimap(): void {
    this.minimapOn = !this.minimapOn;
    // Monaco's minimap is built in, so the @replit/codemirror-minimap
    // dependency and its hand-built container went away with the migration.
    this.handle?.updateOptions({ minimap: { enabled: this.minimapOn } });
    try {
      localStorage.setItem('qx-minimap', this.minimapOn ? '1' : '0');
    } catch {
      /* storage disabled */
    }
    // Minimap now lives in the ⋮ menu — refresh its label/check state.
    this.buildOverflowMenu();
  }

  toggleExplain(): void {
    this.explainMode = !this.explainMode;
  }

  // ── row limit ───────────────────────────────────────────────────────

  private clampLimit(n: number): number {
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(Math.floor(n), this.MAX_ROW_LIMIT);
  }

  /** Bound + persist the row-limit when the toolbar input changes. */
  onRowLimitChange(value: number | string): void {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    this.rowLimit = this.clampLimit(
      Number.isNaN(n as number) ? 200 : (n as number),
    );
    try {
      localStorage.setItem('qx-row-limit', String(this.rowLimit));
    } catch {
      /* storage disabled */
    }
  }

  // ── command palette ─────────────────────────────────────────────────

  /** The full action list the palette (and shortcuts help) surfaces. */
  private paletteActions(): {
    id: string;
    label: string;
    hint?: string;
    icon: string;
    run: () => void;
  }[] {
    return [
      {
        id: 'run',
        label: 'Run statement',
        hint: 'Ctrl/Cmd+Enter',
        icon: 'pi-play',
        run: () => this.run('smart'),
      },
      {
        id: 'run-all',
        label: 'Run all',
        hint: 'Ctrl/Cmd+Shift+Enter',
        icon: 'pi-forward',
        run: () => this.run('all'),
      },
      {
        id: 'format',
        label: 'Format SQL',
        hint: '',
        icon: 'pi-align-left',
        run: () => this.format(),
      },
      {
        id: 'wrap',
        label: 'Toggle word wrap',
        hint: '',
        icon: 'pi-bars',
        run: () => this.toggleWrap(),
      },
      {
        id: 'minimap',
        label: 'Toggle minimap',
        hint: '',
        icon: 'pi-map',
        run: () => this.toggleMinimap(),
      },
      {
        id: 'explain',
        label: 'Toggle EXPLAIN mode',
        hint: '',
        icon: 'pi-sitemap',
        run: () => this.toggleExplain(),
      },
      {
        id: 'goto',
        label: 'Go to line…',
        hint: 'Ctrl/Cmd+G',
        icon: 'pi-directions',
        run: () => this.openGoto(),
      },
      {
        id: 'upper',
        label: 'Upper-case selection',
        hint: '',
        icon: 'pi-arrow-up',
        run: () => this.transformCase('upper'),
      },
      {
        id: 'lower',
        label: 'Lower-case selection',
        hint: '',
        icon: 'pi-arrow-down',
        run: () => this.transformCase('lower'),
      },
      {
        id: 'clear',
        label: 'Clear editor',
        hint: '',
        icon: 'pi-trash',
        run: () => this.clearEditor(),
      },
      {
        id: 'copy',
        label: 'Copy all',
        hint: '',
        icon: 'pi-copy',
        run: () => this.copyAll(),
      },
      {
        id: 'download',
        label: 'Download .sql',
        hint: '',
        icon: 'pi-download',
        run: () => this.downloadSql(),
      },
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
    setTimeout(() => this.doc?.focus(), 0);
  }

  closePalette(): void {
    this.paletteOpen = false;
    this.cdr.markForCheck();
    this.doc?.focus();
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
    if (!this.doc || Number.isNaN(n)) {
      this.doc?.focus();
      return;
    }
    this.doc.goToLine(n);
  }

  closeGoto(): void {
    this.gotoOpen = false;
    this.cdr.markForCheck();
    this.doc?.focus();
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
    if (!this.doc || !sel) return;
    const out =
      mode === 'upper' ? sel.text.toUpperCase() : sel.text.toLowerCase();
    this.doc.replaceRange(sel.from, sel.to, out);
  }

  clearEditor(): void {
    this.replaceAll('');
    this.doc?.focus();
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

  // ── SQL file load (drag-drop onto the editor) ──────────────────────

  /**
   * Read a dropped .sql (or plain text) file's contents. Guards oversize +
   * binary. If the editor is empty, loads immediately; otherwise opens the
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
    if (this.doc) {
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
    this.doc?.focus();
  }

  cancelLoadChoice(): void {
    this.pendingFileSql = null;
    this.pendingFileName = '';
    this.loadChoiceOpen = false;
    this.cdr.markForCheck();
    this.doc?.focus();
  }

  // Drag-drop a .sql onto the editor. Only react when files are dragged.
  onDragOver(event: DragEvent): void {
    if (
      !event.dataTransfer ||
      !Array.from(event.dataTransfer.types).includes('Files')
    )
      return;
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
    if (
      event.relatedTarget &&
      (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    ) {
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

  /**
   * PrimeNG overflow menu (⋯) — the less-used actions PLUS the power-user
   * toggles moved off the toolbar to declutter it (Command palette, Keyboard
   * shortcuts, Minimap). Rebuilt when the minimap toggles so its label stays
   * current. Labels are localised (QUERY_RUNNER.*).
   */
  private buildOverflowMenu(): void {
    const t = (k: string) => this.translate.instant(k);
    this.overflowItems = [
      {
        label: t('QUERY_RUNNER.PALETTE_HINT'),
        icon: 'pi pi-bolt',
        command: () => this.openPalette(),
      },
      {
        label: t('QUERY_RUNNER.SHORTCUTS_HINT'),
        icon: 'pi pi-question-circle',
        command: () => this.openShortcuts(),
      },
      {
        // Live label reflects current state; menu is rebuilt on toggle.
        label: this.minimapOn
          ? t('QUERY_RUNNER.MINIMAP_HIDE')
          : t('QUERY_RUNNER.MINIMAP_SHOW'),
        icon: this.minimapOn ? 'pi pi-check' : 'pi pi-map',
        command: () => this.toggleMinimap(),
      },
      { separator: true },
      {
        label: t('QUERY_RUNNER.DOWNLOAD_SQL'),
        icon: 'pi pi-download',
        command: () => this.downloadSql(),
      },
      {
        label: t('QUERY_RUNNER.GOTO_LINE'),
        icon: 'pi pi-directions',
        command: () => this.openGoto(),
      },
      {
        label: t('QUERY_RUNNER.CASE_UPPER'),
        icon: 'pi pi-arrow-up',
        command: () => this.transformCase('upper'),
      },
      {
        label: t('QUERY_RUNNER.CASE_LOWER'),
        icon: 'pi pi-arrow-down',
        command: () => this.transformCase('lower'),
      },
      { separator: true },
      {
        label: t('QUERY_RUNNER.COPY_ALL'),
        icon: 'pi pi-copy',
        command: () => this.copyAll(),
      },
      {
        label: t('QUERY_RUNNER.CLEAR_EDITOR'),
        icon: 'pi pi-trash',
        command: () => this.clearEditor(),
      },
    ];
  }

  private updateCursorInfo(): void {
    if (!this.doc) return;
    const pos = this.doc.selection().head;
    const line = this.doc.lineAt(pos);
    this.zone.run(() => {
      this.cursorInfo = `Ln ${line.number}, Col ${pos - line.from + 1}`;
      this.cdr.markForCheck();
    });
  }

  private getAll(): string {
    return this.doc?.text() ?? '';
  }
  private getSelection(): { text: string; from: number; to: number } | null {
    if (!this.doc) return null;
    const { from, to } = this.doc.selection();
    return from === to
      ? null
      : { text: this.doc.sliceDoc(from, to), from, to };
  }
  private replaceAll(text: string): void {
    this.doc?.setText(text);
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
    return (
      'ex_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  /**
   * mode 'smart' = selection, else the statement at the cursor.
   * mode 'all'   = the whole editor.
   */
  run(mode: 'smart' | 'all' = 'smart'): void {
    if (this.running || !this.doc) return;

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
        const pos = this.doc.selection().head;
        const stmt = statementAtCursor(this.getAll(), pos);
        if (!stmt) return;
        sqlText = stmt.sql;
        range = { from: stmt.from, to: stmt.to };
      }
    }
    if (!sqlText.trim()) return;

    // Flash the lines that will run, so a multi-statement script shows which
    // one went. Whole lines rather than the exact character range the CodeMirror
    // decoration used: Monaco's line decoration is what editors use for this and
    // it reads more clearly at a glance.
    if (range) {
      this.handle?.flash(
        this.doc.lineAt(range.from).number,
        this.doc.lineAt(range.to).number,
      );
    }
    // Clear any prior error markers.
    this.setRunMarkers([]);

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
        maxRows: this.rowLimit,
      })
      .then(res => {
        this.elapsedMs = Math.round(performance.now() - t0);
        if (res?.status && res.data?.results) {
          this.results = res.data.results as QueryResult[];
          this.statusText = this.summarize();
          this.maybeMarkError(range?.from ?? 0);
          // Server-side eligibility: the BE flags a single wrappable SELECT as
          // derivable. Capture the base SQL so sort/filter/page can re-wrap it.
          const first = this.results[0];
          this.serverMode =
            res.data.derivable === true && !!first && first.kind === 'rows';
          if (this.serverMode) {
            this.baseSql = sqlText;
            this.serverTotal =
              (first as { total?: number }).total ??
              (first as { rowCount: number }).rowCount;
            this.serverPage = 0;
            this.sortModel = [];
            this.filterModel = [];
          } else {
            this.baseSql = '';
            this.serverTotal = 0;
            this.serverPage = 0;
          }
        } else {
          this.results = [
            {
              kind: 'error',
              message: res?.message ?? 'Execution failed',
              statementIndex: 0,
            },
          ];
          this.statusText = 'Error';
          this.serverMode = false;
        }
      })
      .catch(err => {
        this.results = [
          {
            kind: 'error',
            message: err?.message ?? 'Execution failed',
            statementIndex: 0,
          },
        ];
        this.statusText = 'Error';
        this.serverMode = false;
      })
      .finally(() => {
        this.running = false;
        this.executionId = null;
        this.cdr.markForCheck();
      });
  }

  /** If a result is an error with an offset, drop a lint marker + jump. */
  private maybeMarkError(base: number): void {
    if (!this.doc) return;
    const err = this.results.find(r => r.kind === 'error') as
      { kind: 'error'; message: string; offset?: number } | undefined;
    if (!err || err.offset == null) return;
    const pos = Math.min(Math.max(0, base + err.offset), this.doc.length());
    const from = this.doc.offsetToPosition(pos);
    const to = this.doc.offsetToPosition(Math.min(pos + 1, this.doc.length()));
    this.setRunMarkers([
      {
        severity: (window as any).monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: from.lineNumber,
        startColumn: from.column,
        endLineNumber: to.lineNumber,
        endColumn: to.column,
      },
    ]);
  }

  /** Jump the cursor to the failing offset. */
  goToError(): void {
    if (!this.doc) return;
    const err = this.results[this.activeResult] as
      { kind: 'error'; offset?: number } | undefined;
    if (!err || err.offset == null) return;
    const pos = Math.min(Math.max(0, err.offset), this.doc.length());
    this.doc.setCursor(pos);
    this.doc.focus();
  }

  cancel(): void {
    // Cancel applies to a normal run (running) OR a derived server-page
    // re-run (serverLoading) — both now carry an executionId.
    if ((!this.running && !this.serverLoading) || !this.executionId) return;
    this.service.cancel(this.connectionId, this.executionId).catch(() => {});
  }

  // ── save query ──────────────────────────────────────────────────────

  /**
   * Open the inline Save prompt. When opened from a saved query, default
   * to "Save" (update it); "Save as new" flips the mode. A brand-new tab
   * only offers "Save" (as new).
   */
  openSavePrompt(
    mode: 'new' | 'update' = this.savedQueryId ? 'update' : 'new',
  ): void {
    this.saveMode = mode;
    if (mode === 'update') {
      this.savePromptName = this.savedQueryName;
      this.savePromptDescription = this.savedQueryDescription;
    } else {
      // Prefill the name from the current saved query (if any) as a base.
      this.savePromptName = this.savedQueryId ? '' : this.savedQueryName;
      this.savePromptDescription = this.savedQueryId
        ? ''
        : this.savedQueryDescription;
    }
    this.savePromptOpen = true;
    this.cdr.markForCheck();
  }

  closeSavePrompt(): void {
    this.savePromptOpen = false;
    this.cdr.markForCheck();
    this.doc?.focus();
  }

  /**
   * Close the Save prompt only when the backdrop itself is clicked — matches
   * the canonical .confirmation-popup pattern (target===currentTarget) so a
   * click inside the card doesn't dismiss it.
   */
  onSaveBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeSavePrompt();
  }

  /** True once a name is entered and we're not mid-save. */
  get canSave(): boolean {
    return !this.saving && this.savePromptName.trim().length >= 2;
  }

  /** POST (new) or PUT (update) the current editor SQL as a saved query. */
  confirmSave(): void {
    if (!this.canSave) return;
    const sql = this.getAll().trim();
    if (!sql || !this.connectionId || !this.datasourceId) {
      this.statusText = 'Cannot save: missing SQL or connection metadata';
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();

    const payload: SavedQueryPayload = {
      name: this.savePromptName.trim(),
      sql,
      datasourceId: this.datasourceId,
      connectionId: this.connectionId,
      rowLimit: this.rowLimit,
    };
    const desc = this.savePromptDescription.trim();
    if (desc) payload.description = desc;

    const isUpdate = this.saveMode === 'update' && !!this.savedQueryId;
    const req = isUpdate
      ? this.savedQueries.updateSavedQuery(this.savedQueryId!, payload)
      : this.savedQueries.addSavedQuery(payload);

    req
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          const data = res?.data;
          // Track the (new or existing) id so subsequent saves can update
          // it in place; reflect the new name/description in tab state.
          this.savedQueryId = data?.id ?? this.savedQueryId;
          this.savedQueryName = payload.name;
          this.savedQueryDescription = payload.description ?? '';
          this.title.setTitle(`${payload.name} — Query Runner`);
          this.savePromptOpen = false;
        }
      })
      .catch(() => {})
      .finally(() => {
        this.saving = false;
        this.cdr.markForCheck();
        this.doc?.focus();
      });
  }

  format(): void {
    if (!this.doc) return;
    try {
      const sel = this.getSelection();
      if (sel) {
        this.doc.replaceRange(
          sel.from,
          sel.to,
          this.sqlFormatter.formatSql(sel.text),
        );
      } else {
        this.replaceAll(this.sqlFormatter.formatSql(this.getAll()));
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
    if (r.kind === 'message')
      return `${r.text} · ${Math.round(r.elapsedMs)} ms`;
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
  get resultContext(): {
    count: string;
    elapsed: string;
    truncated: boolean;
  } | null {
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

  // ── server-side sort / filter / paging (derivable results) ──────────
  //
  // AG Grid Community has no serverSide row model, so the grid stays on the
  // clientSide model showing ONE page. On sort/filter change we read the grid
  // state, re-run the wrapped query on the server, and swap the page in. On a
  // non-derivable result these handlers no-op and AG Grid's own in-memory
  // sort/filter applies (unchanged behaviour).

  get serverPageSize(): number {
    return this.rowLimit;
  }

  /** "1–200 of 5,240" style range label for the server pager. */
  get serverRangeLabel(): string {
    if (!this.serverMode) return '';
    const from =
      this.serverTotal === 0 ? 0 : this.serverPage * this.serverPageSize + 1;
    const to = Math.min(
      (this.serverPage + 1) * this.serverPageSize,
      this.serverTotal,
    );
    return `${from.toLocaleString()}–${to.toLocaleString()} ${this.translate.instant(
      'QUERY_RUNNER.OF',
    )} ${this.serverTotal.toLocaleString()}`;
  }

  get serverHasPrev(): boolean {
    return this.serverMode && this.serverPage > 0;
  }
  get serverHasNext(): boolean {
    return (
      this.serverMode &&
      (this.serverPage + 1) * this.serverPageSize < this.serverTotal
    );
  }

  serverPrev(): void {
    if (!this.serverHasPrev || this.serverLoading) return;
    this.serverPage -= 1;
    this.fetchServerPage();
  }
  serverNext(): void {
    if (!this.serverHasNext || this.serverLoading) return;
    this.serverPage += 1;
    this.fetchServerPage();
  }

  /** Grid sort changed → capture ordinals + re-fetch page 1. */
  onSortChanged(): void {
    if (!this.serverMode || !this.gridApi) return;
    const state = this.gridApi.getColumnState();
    // Preserve the user's multi-sort order (sortIndex), map field cN → ordinal.
    this.sortModel = state
      .filter(s => s.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(s => ({
        ordinal: this.fieldToOrdinal(s.colId),
        dir: s.sort as 'asc' | 'desc',
      }))
      .filter(o => o.ordinal > 0);
    this.serverPage = 0;
    this.fetchServerPage();
  }

  /** Grid filter changed → translate to derived filters + re-fetch page 1. */
  onFilterChanged(): void {
    if (!this.serverMode || !this.gridApi) return;
    const model = this.gridApi.getFilterModel() ?? {};
    const out: { col: string; op: string; value?: unknown }[] = [];
    for (const [field, m] of Object.entries<any>(model)) {
      const col = this.fieldToName(field);
      if (!col) continue;
      // Flatten simple + (first condition of) combined filter models.
      const cond = m?.operator ? (m.condition1 ?? m) : m;
      const op = this.mapFilterOp(cond?.type, m?.filterType);
      if (!op) continue;
      out.push({ col, op, value: cond?.filter });
    }
    this.filterModel = out;
    this.serverPage = 0;
    this.fetchServerPage();
  }

  /** Grid column field (c0,c1,…) → 1-based output ordinal for ORDER BY. */
  private fieldToOrdinal(field: string | null | undefined): number {
    if (!field) return 0;
    const m = /^c(\d+)$/.exec(field);
    return m ? parseInt(m[1], 10) + 1 : 0;
  }

  /** Grid column field (c0,c1,…) → the real column name for filtering. */
  private fieldToName(field: string): string | null {
    const r = this.activeRows;
    const col = r?.columns.find(c => c.field === field);
    return col?.name ?? null;
  }

  /** AG Grid filter type → derived filter op. Null ⇒ unsupported (skip). */
  private mapFilterOp(
    type: string | undefined,
    filterType: string | undefined,
  ): string | null {
    switch (type) {
      case 'contains':
        return 'contains';
      case 'notContains':
        return 'notContains';
      case 'equals':
        return 'equals';
      case 'notEqual':
        return 'notEqual';
      case 'startsWith':
        return 'startsWith';
      case 'endsWith':
        return 'endsWith';
      case 'blank':
        return 'blank';
      case 'notBlank':
        return 'notBlank';
      case 'greaterThan':
        return 'gt';
      case 'greaterThanOrEqual':
        return 'gte';
      case 'lessThan':
        return 'lt';
      case 'lessThanOrEqual':
        return 'lte';
      default:
        // number 'inRange' etc. unsupported → skip (client still shows page).
        return filterType === 'number' ? null : null;
    }
  }

  /** Re-run the base SELECT wrapped with the current sort/filter/page. */
  private fetchServerPage(): void {
    if (!this.serverMode || !this.baseSql) return;
    this.serverLoading = true;
    // Give the derived re-run its own executionId (was null) so the backend
    // registers a RUNNING key and Cancel can reach it — a slow sort/filter
    // over a big table was previously uncancelable.
    this.executionId = this.genId();
    this.cdr.markForCheck();
    const derived = {
      ...(this.sortModel.length ? { orderBy: this.sortModel } : {}),
      ...(this.filterModel.length ? { filters: this.filterModel } : {}),
      offset: this.serverPage * this.serverPageSize,
      limit: this.serverPageSize,
    };
    this.service
      .execute(
        this.connectionId,
        this.baseSql,
        this.autoCommit,
        this.executionId,
        {
          maxRows: this.rowLimit,
          derived,
        },
      )
      .then(res => {
        const first = res?.data?.results?.[0];
        if (res?.status && first && first.kind === 'rows') {
          // Replace just the active result's rows/total; keep tab position.
          this.results = [first, ...this.results.slice(1)];
          this.activeResult = 0;
          this.serverTotal =
            (first as { total?: number }).total ?? this.serverTotal;
        }
      })
      .catch(() => {
        /* keep the previous page on error */
      })
      .finally(() => {
        this.serverLoading = false;
        this.executionId = null;
        this.cdr.markForCheck();
      });
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
    if (r && this.gridApi)
      this.gridApi.setGridOption('columnDefs', this.colDefs(r));
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
    const base = (this.datasourceName || 'query').replace(
      /[^A-Za-z0-9_-]+/g,
      '_',
    );
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
  planRows(
    node: any,
    depth = 0,
    acc: { depth: number; node: any }[] = [],
  ): { depth: number; node: any }[] {
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
