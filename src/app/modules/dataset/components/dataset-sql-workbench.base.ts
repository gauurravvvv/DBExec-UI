/**
 * Everything add-dataset and edit-dataset do the same way.
 *
 * The two screens were near-copies: 96 shared member names, of which **81 had
 * byte-identical bodies** once the schema-tree, result-sheet and result-grid
 * services were extracted (before that it was 56 — pulling the services out made
 * the screens far more alike). Those 81, plus the 37 identically-declared fields
 * they operate on, live here. Moving a byte-identical body is behaviour-preserving
 * by construction, which is the whole reason this class only takes identical ones.
 *
 * The 14 members that genuinely differ stay on the subclasses, declared `abstract`
 * below where the base needs to call them. They are not accidents of history —
 * each is a real difference in what creating a dataset means versus editing one:
 *
 *  - `ngOnInit` — add reads `connectorId`/`schema` query params; edit fetches a
 *    dataset by route id. Different entry contracts.
 *  - `initMonaco` — **add registers the SQL validator and formatter; edit registers
 *    neither**, and binds Ctrl+Enter through `editor.addCommand`, which does not
 *    bind in this app. That is a defect, not a preference, and merging the method
 *    would have hidden it. See the drift reconciliation plan.
 *  - `executeQueryForDatasource` — add resets expanded JSON cells; edit restores
 *    persisted column widths. Each grid has a different memory.
 *  - `onDatasetDialogClose` — add POSTs and navigates away; edit commits an update
 *    and honours Save & Run.
 *  - `hasUnsavedChanges` — edit diffs against the loaded original; add has no
 *    original and can only ask whether anything was typed.
 *  - `onFileSelected` / `exportBaseName` / `insertColumnName` / `onResultsLazyLoad`
 *    and the four host hooks — small, deliberate, documented per screen.
 *
 * **Why `@Directive()` and not `@Injectable()`:** this is a component base class
 * that declares `@ViewChild`s and implements `AfterViewInit`, so Angular needs a
 * directive-family decorator to compile its metadata. It has no selector and is
 * never instantiated directly.
 *
 * **Why `inject()` and not constructor parameters:** threading eighteen
 * dependencies through two `super(...)` calls is noise, and every addition would
 * touch both subclasses. `inject()` in a field initialiser resolves against the
 * subclass's node injector — which is what makes the three component-provided
 * services below resolve to *that screen's* instance rather than a shared one.
 */
import {
  AfterViewInit,
  ChangeDetectorRef,
  Directive,
  ElementRef,
  HostListener,
  ViewChild,
  DestroyRef,
  inject,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';

import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from '../../connector/constants/connector-types.constant';
import {
  DIALECT_LINT_DEBOUNCE_MS,
  ENABLE_DIALECT_LINT,
  SQL_EDITOR_PLACEHOLDER,
} from '../config/sql-editor.config';
import {
  ColumnProfile,
  downloadTextFile,
  rowsToCsv,
  rowsToJson,
} from '../helpers/dataset-result-tools.helper';
import {
  buildResultExportPayload,
  downloadBlob,
} from '../helpers/dataset-export.helper';
import { DatasetParamConfig } from '../helpers/param-tokens.helper';
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../models/query-tab.model';
import {
  DatasourceSchema,
  QueryResult,
} from '../models/dataset-schema.model';
import { DatasetService } from '../services/dataset.service';
import {
  DatasetSchemaTreeService,
  SchemaTreeHost,
} from '../services/dataset-schema-tree.service';
import { MonacoIntelliSenseService } from '../services/monaco-intellisense.service';
import { QueryService } from '../services/query.service';
import { SqlLinterService } from '../services/sql-linter.service';
import {
  ResultGridHost,
  ResultGridToolsService,
} from '../services/result-grid-tools.service';
import {
  ResultSheetHost,
  ResultSheetLayoutService,
} from '../services/result-sheet-layout.service';

declare const monaco: any;

@Directive()
export abstract class DatasetSqlWorkbenchBase
  implements AfterViewInit, ResultSheetHost, ResultGridHost, SchemaTreeHost
{
  // ── Injected dependencies ───────────────────────────────────────
  //
  // The last three are declared in each subclass's `providers`, so these
  // resolve to that screen's own instance, never a shared one.

  protected readonly cdr = inject(ChangeDetectorRef);
  protected readonly elementRef = inject(ElementRef) as ElementRef<HTMLElement>;
  protected readonly store = inject(Store);
  protected readonly translate = inject(TranslateService);
  protected readonly messageService = inject(MessageService);
  protected readonly globalService = inject(GlobalService);
  protected readonly monacoLoader = inject(MonacoLoaderService);
  protected readonly queryService = inject(QueryService);
  protected readonly datasetService = inject(DatasetService);
  protected readonly sqlLinterService = inject(SqlLinterService);
  protected readonly monacoIntelliSenseService = inject(MonacoIntelliSenseService);
  protected readonly sheet = inject(ResultSheetLayoutService);
  protected readonly grid = inject(ResultGridToolsService);
  protected readonly tree = inject(DatasetSchemaTreeService);

  // ── What each screen must supply ────────────────────────────────

  /** Mount Monaco. Genuinely different per screen — see the class comment. */
  protected abstract initMonaco(): void;

  /** Ordered name candidates for an export file name. */
  protected abstract exportBaseName(): string;

  /**
   * Run a query against the selected datasource and render the result.
   *
   * Abstract because the two screens remember different things about their grid:
   * add clears expanded JSON cells for the new rows, edit re-applies the column
   * widths the user dragged and persisted for that dataset.
   */
  protected abstract executeQueryForDatasource(
    query: string,
    page?: number,
    limit?: number,
    filter?: { [key: string]: string },
  ): void;

  /** Per-column widths. edit-dataset also writes these, so it widens the type. */
  abstract get columnWidths(): Record<string, number>;

  // SchemaTreeHost members that differ per screen.
  abstract dbTypeCandidates(): any[];
  abstract cachedSchemaDbType(dbId: string): string | null;
  abstract omitPublicSchemaPrefix(): boolean;

  // ── Shared state ────────────────────────────────────────────────


  // ViewChild for file input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @ViewChild('sqlEditorContainer')
  sqlEditorContainer!: ElementRef<HTMLDivElement>;

  /**
   * Reference to the PrimeNG result-grid Table so we can call its
   * `.reset()` between queries. Without this, PrimeNG keeps its
   * internal "first row index" state across `queryResult` changes,
   * so running query A (200 rows, viewing page 4) then query B (7
   * rows) leaves the table pointing at row 75 of a 7-row result —
   * the grid renders empty until the user clicks page 1. Typed as
   * any so we don't pull primeng/table into this controller's
   * import surface (the component already has plenty).
   */
  @ViewChild('resultsTable') resultsTable: any;

  editor: any;

  /** Owns the editor lifetime; see CodeEditorService. */
  protected handle: EditorHandle | null = null;

  protected codeEditor = inject(CodeEditorService);

  isLoadingEditor = true;

  isLoadingSchema = false;

  isExecutingQuery = false;

  monacoLoadFailed = false;

  queryResult: QueryResult | null = null;

  currentQuery = '';

  /** Debounced SQL snapshot fed to the params panel for token scanning. */
  paramsSql = '';

  /** Configured params, collected from the panel; saved as paramsConfig. */
  paramsConfig: DatasetParamConfig[] = [];

  protected sqlParamScan$ = new Subject<string>();

  // Bound listener reference (for proper removeEventListener)
  protected boundCloseContextMenu = this.closeContextMenu.bind(this);

  // Database sidebar
  showDatasourceSidebar = true;

  // Context Menu
  showContextMenu = false;

  contextMenuPosition: ContextMenuPosition = { x: 0, y: 0 };

  contextMenuItems: ContextMenuItem[] = [];

  contextMenuDatasource: any | null = null;

  // Save as Dataset Dialog
  showDatasetDialog = false;

  // Results bottom sheet
  showResultsPopup = false;

  resultRows = 25;

  resultPage = 1;

  isExportingResults = false;

  resultFilterValues: { [key: string]: string } = {};

  protected resultFilterSubject = new Subject<void>();

  protected lastExecutedQuery = '';

  protected lastResultsLazyEvent: any = null;

  /** Monaco markers owner-id for the lint pass. Stable string so
   *  successive setModelMarkers() calls replace the previous batch. */
  protected static readonly DIALECT_LINT_OWNER = 'sql-dialect-lint';

  /** Debounce handle for dialect lint. Cleared in ngOnDestroy. */
  protected dialectLintTimer: ReturnType<typeof setTimeout> | null = null;

  // IntelliSense provider disposables
  protected completionProviderDisposable: any = null;

  protected hoverProviderDisposable: any = null;

  protected signatureHelpDisposable: any = null;

  selectedDatasourceObj: any = null;

  protected destroyRef = inject(DestroyRef);

  saving = this.datasetService.saving;


  // ── Shared behaviour ────────────────────────────────────────────


  exportResultsAsCsv(): void {
    if (!this.lastExecutedQuery || !this.selectedDatasourceObj?.id) return;

    this.isExportingResults = true;

    const payload = buildResultExportPayload(
      this.selectedDatasourceObj.id,
      this.lastExecutedQuery,
      this.resultFilterValues,
    );

    this.queryService.exportQueryResults(payload).subscribe({
      next: (blob: Blob) => {
        const datasourceName = this.selectedDatasourceObj.name || 'datasource';
        downloadBlob(blob, `${datasourceName}_query_results.csv`);
        this.isExportingResults = false;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.isExportingResults = false;
        this.cdr.markForCheck();
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('DATASET.EXPORT_FAILED'),
          detail:
            error.error?.message ||
            error.message ||
            this.translate.instant('DATASET.EXPORT_FAILED_DESC'),
          key: 'topRight',
          life: 3000,
          styleClass: 'custom-toast',
        });
      },
    });
  }

  executeQuery(): void {
    if (!this.editor) return;
    // Re-entry guard against double-firing while a query is already
    // in flight. The previous version also bailed when
    // `showResultsPopup` was true — a leftover from the modal era
    // when the popup stole focus from Monaco. The docked sheet
    // doesn't steal focus, so users expect Run / Ctrl+Enter to fire
    // a fresh query whether or not the sheet is open.
    if (this.isExecutingQuery) return;

    const selection = this.editor.getSelection();
    const hasSelection = selection && !selection.isEmpty();

    if (hasSelection) {
      // Execute selected text
      const selectedText = this.editor.getModel().getValueInRange(selection);
      if (selectedText.trim()) {
        this.executeSelectedQuery(selectedText);
        return;
      }
    }

    // No selection, execute complete query
    this.executeCompleteQuery();
  }

  protected registerIntelliSenseProviders(): void {
    // Dispose previous providers if they exist
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
    }
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
    }
    if (this.signatureHelpDisposable) {
      this.signatureHelpDisposable.dispose();
    }

    // Register new providers and store disposables
    if (this.editor) {
      this.completionProviderDisposable =
        this.monacoIntelliSenseService.registerSQLCompletions(
          this.datasources,
          this.editor,
        );
      this.hoverProviderDisposable =
        this.monacoIntelliSenseService.registerHoverProvider(this.datasources);
      this.signatureHelpDisposable =
        this.monacoIntelliSenseService.registerSignatureHelpProvider();
    }
  }

  onDatasourceContextMenu(event: MouseEvent, datasource: any): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuDatasource = datasource;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    this.contextMenuItems = [
      {
        label: this.translate.instant('DATASET.REFRESH_SCHEMA'),
        icon: 'pi pi-refresh',
        command: () => this.refreshDatasourceFromContext(),
      },
    ];

    this.showContextMenu = true;
  }

  protected surfaceResultSheet(): void {
    this.showResultsPopup = true;
    this.sheet.expand();
    // Snap the table's internal "first row index" back to 0 so a
    // 200-row → 7-row result transition doesn't leave the grid
    // showing page 4 of nothing. PrimeNG's <p-table>.first is the
    // index of the first row of the current page; setting it to 0
    // is the minimal reset (filter inputs + sort survive — see
    // .reset() if a fuller wipe is ever wanted).
    if (this.resultsTable) {
      this.resultsTable.first = 0;
    }
    this.resultPage = 1;
  }

  protected loadMonacoEditor(): void {
    this.monacoLoader
      .load()
      .then(() => {
        this.initMonaco();
      })
      .catch(() => {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.showMonacoLoadError();
        this.cdr.markForCheck();
      });
  }

  executeCompleteQuery(): void {
    if (this.isExecutingQuery) return;
    const query = this.editor?.getValue() || this.currentQuery;
    this.resultPage = 1;
    this.resultFilterValues = {};
    // Deliberately leave `queryResult` in place until the new
    // result lands. Nulling it would unmount the sheet (the
    // *ngIf="queryResult" branch flips), flicker for the duration
    // of the round-trip, then mount again. The pre-existing rows
    // are correctly replaced when the new response arrives.
    this.executeQueryForDatasource(query);
  }

  protected resetEditor(): void {
    // Clear query result
    this.queryResult = null;

    // Reset editor content if it exists
    if (this.editor) {
      this.editor.setValue(SQL_EDITOR_PLACEHOLDER);
    }

    // Reset current query
    this.currentQuery = '';
  }

  protected runDialectLint(): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;
    const dbType = this.selectedDatasourceObj?.config?.dbType ?? null;
    const markers = this.sqlLinterService.lint(model.getValue(), dbType);
    monaco.editor.setModelMarkers(
      model,
      DatasetSqlWorkbenchBase.DIALECT_LINT_OWNER,
      markers,
    );
  }

  clearResultFilters(): void {
    this.resultFilterValues = {};
    this.resultPage = 1;
    if (this.lastExecutedQuery) {
      this.executeQueryForDatasource(
        this.lastExecutedQuery,
        1,
        this.resultRows,
      );
    }
  }

  exportCurrentScript(): void {
    if (!this.editor || !this.selectedDatasourceObj) return;

    const datasourceName = this.selectedDatasourceObj.name || 'datasource';
    downloadTextFile(
      this.editor.getValue(),
      `${datasourceName}_script.sql`,
      'text/plain',
    );
  }

  exportResultsCsvClient(): void {
    if (!this.queryResult?.columns?.length) return;
    const csv = rowsToCsv(this.queryResult.columns, this.queryResult.rows);
    downloadTextFile(
      csv,
      `${this.exportBaseName()}_preview.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  exportResultsJsonClient(): void {
    if (!this.queryResult?.columns?.length) return;
    const json = rowsToJson(this.queryResult.columns, this.queryResult.rows);
    downloadTextFile(
      json,
      `${this.exportBaseName()}_preview.json`,
      'application/json;charset=utf-8;',
    );
  }

  protected scheduleDialectLint(): void {
    if (!ENABLE_DIALECT_LINT) return;
    if (!this.editor) return;
    if (this.dialectLintTimer) clearTimeout(this.dialectLintTimer);
    this.dialectLintTimer = setTimeout(() => {
      this.dialectLintTimer = null;
      this.runDialectLint();
    }, DIALECT_LINT_DEBOUNCE_MS);
  }

  get selectedDbTypeOption(): DatabaseTypeOption | null {
    const dbType = this.selectedDatasourceObj?.config?.dbType;
    if (!dbType) return null;
    return (
      DATABASE_TYPES.find((t: DatabaseTypeOption) => t.value === dbType) ??
      DATABASE_TYPES.find((t: DatabaseTypeOption) => t.value === 'postgres') ??
      null
    );
  }

  toggleDatasourceSidebar(): void {
    this.showDatasourceSidebar = !this.showDatasourceSidebar;
    // Trigger Monaco editor resize after sidebar animation
    setTimeout(() => {
      if (this.editor) {
        this.editor.layout();
      }
    }, 300);
  }

  refreshDatasourceFromContext(): void {
    if (!this.contextMenuDatasource) return;

    // Refresh schema for this specific database
    this.refreshSingleDatasource(this.contextMenuDatasource.id);

    this.closeContextMenu();
  }

  closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuDatasource = null;
    // The cell-level menu shares the global outside-click listener
    // (see boundCloseContextMenu), so it closes from here too.
    this.grid.closeCellContextMenu();
  }

  dismissResultSheet(): void {
    this.showResultsPopup = false;
    this.queryResult = null;
    // expandedJsonCells references row indices in queryResult; drop
    // them so a fresh result starts with no expanded JSON cells.
    this.grid.resetExpandedCells();
  }

  executeSelectedQuery(selectedText: string): void {
    if (this.isExecutingQuery) return;
    this.resultPage = 1;
    this.resultFilterValues = {};
    // See executeCompleteQuery — same anti-flicker reasoning.
    this.executeQueryForDatasource(selectedText);
  }

  isTableExpanded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): boolean {
    return this.tree.isTableExpanded(dbId, schemaName, tableName);
  }

  protected showMonacoLoadError(): void {}

  retryLoadMonaco(): void {
    this.monacoLoadFailed = false;
    this.isLoadingEditor = true;
    this.loadMonacoEditor();
  }

  get effectiveSheetHeightPx(): number {
    return this.sheet.effectiveHeightPx(
      this.showResultsPopup,
      !!this.queryResult,
    );
  }

  protected initializeComponent(): void {
    // Setup theme monitoring

    // Close context menus on click outside
    document.addEventListener('click', this.boundCloseContextMenu);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showContextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
  }

  saveAsDataset(): void {
    if (!this.selectedDatasourceObj) return;

    // Show dialog
    this.showDatasetDialog = true;
  }

  clearEditor(): void {
    if (this.editor) {
      this.editor.setValue('');
    }
  }

  get isQueryEmpty(): boolean {
    const query = this.currentQuery.trim();
    const defaultQuery = SQL_EDITOR_PLACEHOLDER;
    return !query || query === defaultQuery;
  }

  sheetPaneElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector(
      '.editor-results-area',
    ) as HTMLElement | null;
  }

  triggerFileInput(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.click();
    }
  }

  async copySql(): Promise<void> {
    const sql = this.editor?.getValue() || this.currentQuery || '';
    await this.grid.writeToClipboard(sql);
  }

  ngAfterViewInit(): void {
    this.loadMonacoEditor();
    this.sheet.installResizeObserver();
  }

  onParamsConfigChange(config: DatasetParamConfig[]): void {
    this.paramsConfig = config;
    this.cdr.markForCheck();
  }

  refreshSelectedDatasource(): void {
    if (!this.selectedDatasourceObj || !this.selectedDatasourceObj.id) return;
    this.refreshSingleDatasource(this.selectedDatasourceObj.id);
  }

  protected updateEditorTheme(): void {
    if (this.editor) {
    }
  }

  get cellContextMenuLeft(): number {
    return this.grid.cellContextMenuLeft;
  }

  get cellContextMenuTop(): number {
    return this.grid.cellContextMenuTop;
  }

  closeOtherMenus(): void {
    this.showContextMenu = false;
  }

  get columnProfiles(): ColumnProfile[] {
    return this.grid.columnProfiles;
  }

  async copyCellValue(): Promise<void> {
    await this.grid.copyCellValue();
  }

  async copyColumnValues(): Promise<void> {
    await this.grid.copyColumnValues();
  }

  currentResult(): QueryResult | null {
    return this.queryResult;
  }

  get datasourceSchemas(): { [dbId: string]: DatasourceSchema } {
    return this.tree.datasourceSchemas;
  }
  set datasourceSchemas(map: { [dbId: string]: DatasourceSchema }) {
    this.tree.datasourceSchemas = map;
  }

  get datasources(): DatasourceSchema[] {
    return this.tree.datasources;
  }
  set datasources(list: DatasourceSchema[]) {
    this.tree.datasources = list;
  }

  editorInstance(): any {
    return this.editor;
  }

  get expandedJsonCells(): Set<string> {
    return this.grid.expandedJsonCells;
  }
  set expandedJsonCells(cells: Set<string>) {
    this.grid.expandedJsonCells = cells;
  }

  get expandedPaths(): Set<string> {
    return this.tree.expandedPaths;
  }

  getFilteredSchemas(schemas: any[] | undefined): any[] {
    return this.tree.getFilteredSchemas(schemas);
  }

  getFilteredTables(tables: any[]): any[] {
    return this.tree.getFilteredTables(tables);
  }

  get hasAnyColumnType(): boolean {
    return this.grid.hasAnyColumnType();
  }

  isExpanded(path: string): boolean {
    return this.tree.isExpanded(path);
  }

  get isPaginationEnabled(): boolean {
    return !!this.queryResult;
  }

  get isResultFilterActive(): boolean {
    return Object.values(this.resultFilterValues).some(v => !!v);
  }

  get isResultSheetCollapsed(): boolean {
    return this.sheet.isCollapsed;
  }
  set isResultSheetCollapsed(collapsed: boolean) {
    this.sheet.isCollapsed = collapsed;
  }

  jsonCellKey(rowIndex: number, col: string): string {
    return this.grid.jsonCellKey(rowIndex, col);
  }

  get loadingDatasources(): { [dbId: string]: boolean } {
    return this.tree.loadingDatasources;
  }
  set loadingDatasources(map: { [dbId: string]: boolean }) {
    this.tree.loadingDatasources = map;
  }

  nullSeverity(pct: number): 'good' | 'warn' | 'bad' {
    return this.grid.nullSeverity(pct);
  }

  onCellContextMenu(event: MouseEvent, rowIndex: number, col: string): void {
    this.grid.onCellContextMenu(event, rowIndex, col);
  }

  onPaneWidthChanged(): void {
    this.grid.recalculateColumnWidths();
  }

  onResultFilterChange(): void {
    this.resultFilterSubject.next();
  }

  onSheetDragStart(event: MouseEvent): void {
    this.sheet.onDragStart(event);
  }

  onSheetHandleKeydown(event: KeyboardEvent): void {
    this.sheet.onHandleKeydown(event);
  }

  refreshSingleDatasource(dbId: string): void {
    this.tree.refreshSingleDatasource(dbId);
  }

  requestRender(): void {
    this.cdr.markForCheck();
  }

  get resultSheetHeightPx(): number {
    return this.sheet.heightPx;
  }
  set resultSheetHeightPx(px: number) {
    this.sheet.heightPx = px;
  }

  schemaPath(dbId: string, schemaName: string): string {
    return this.tree.schemaPath(dbId, schemaName);
  }

  get schemaSearchText(): string {
    return this.tree.schemaSearchText;
  }
  set schemaSearchText(text: string) {
    this.tree.schemaSearchText = text;
  }

  protected get schemaSelectionToken(): number {
    return this.tree.schemaSelectionToken;
  }
  protected set schemaSelectionToken(token: number) {
    this.tree.schemaSelectionToken = token;
  }

  get schemaTreeMode(): { [dbId: string]: 'eager' | 'lazy' } {
    return this.tree.schemaTreeMode;
  }

  selectedDatasourceRecord(): any | null {
    return this.selectedDatasourceObj;
  }

  get showCellContextMenu(): boolean {
    return this.grid.showCellContextMenu;
  }

  get showColumnProfile(): boolean {
    return this.grid.showColumnProfile;
  }

  tablePath(dbId: string, schemaName: string, tableName: string): string {
    return this.tree.tablePath(dbId, schemaName, tableName);
  }

  toggleColumnProfile(): void {
    this.grid.toggleColumnProfile();
  }

  toggleDatasource(db: any): void {
    this.tree.toggleDatasource(db);
  }

  toggleJsonCell(rowIndex: number, col: string): void {
    this.grid.toggleJsonCell(rowIndex, col);
  }

  toggleResultSheet(): void {
    this.sheet.toggle();
  }

  toggleSchema(dbId: string, schemaName: string): void {
    this.tree.toggleSchema(dbId, schemaName);
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    this.tree.toggleTable(dbId, schemaName, tableName);
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }
}
