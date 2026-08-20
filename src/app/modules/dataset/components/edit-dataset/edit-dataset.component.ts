import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatasetFieldsStore } from '../../services/dataset-fields.store';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, Subject, TimeoutError } from 'rxjs';
import { debounceTime, first, timeout } from 'rxjs/operators';
import { DATASET, QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { IAPIResponse } from 'src/app/core/models/global.model';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { expandAnimation } from '../../animations/expand.animation';
import {
  DIALECT_LINT_DEBOUNCE_MS,
  ENABLE_DIALECT_LINT,
  MONACO_EDITOR_OPTIONS,
  QUERY_EXECUTION_TIMEOUT_MS,
  SQL_EDITOR_PLACEHOLDER,
} from '../../config/sql-editor.config';
import {
  DatasourceSchema,
  QueryExecuteData,
  QueryResult,
} from '../../models/dataset-schema.model';
import { measureColumnWidths } from '../../helpers/cell-formatter.helper';
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../../models/query-tab.model';
import { ConnectorService } from '../../../connector/services/connector.service';
import { DatasetService } from '../../services/dataset.service';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import { SqlLinterService } from '../../services/sql-linter.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from '../../../connector/constants/connector-types.constant';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';
import { DatasetParamConfig } from '../../helpers/param-tokens.helper';
import { DatasetParamRunError } from '../dataset-params-panel/dataset-params-panel.component';
import {
  ColumnDelta,
  ColumnProfile,
  SimpleColumn,
  SqlDiffLine,
  diffColumns,
  diffSqlLines,
  downloadTextFile,
  rowsToCsv,
  rowsToJson,
} from '../../helpers/dataset-result-tools.helper';
import {
  buildResultExportPayload,
  downloadBlob,
  exportBaseName as buildExportBaseName,
  readSqlFile,
} from '../../helpers/dataset-export.helper';
import {
  ResultSheetHost,
  ResultSheetLayoutService,
} from '../../services/result-sheet-layout.service';
import {
  ResultGridHost,
  ResultGridToolsService,
} from '../../services/result-grid-tools.service';
import {
  DatasetSchemaTreeService,
  EnsureTablesOptions,
  SchemaTreeHost,
} from '../../services/dataset-schema-tree.service';
import { DatasetSqlWorkbenchBase } from '../dataset-sql-workbench.base';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-edit-dataset',
  templateUrl: './edit-dataset.component.html',
  styleUrls: ['./edit-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [expandAnimation],
  // Component-scoped: the sheet height, the drag in progress and the grid's
  // expanded cells all belong to THIS screen's result pane, never shared.
  providers: [
    ResultSheetLayoutService,
    ResultGridToolsService,
    DatasetSchemaTreeService,
  ],
})
export class EditDatasetComponent
  extends DatasetSqlWorkbenchBase
  implements
    OnInit,
    OnDestroy,
    AfterViewInit,
    HasUnsavedChanges,
    ResultSheetHost,
    ResultGridHost,
    SchemaTreeHost
{
  /**
   * Size cap for an imported .sql / .txt script.
   *
   * add-dataset uses 2 here, and the comment that used to sit above this
   * constant read "max 2MB" — so 22 is very likely a typo. It is preserved
   * verbatim because correcting it is a behaviour change; see the drift
   * reconciliation plan.
   */
  private static readonly SQL_UPLOAD_MAX_MB = 22;

  // Dataset ID from route
  datasetId?: string;
  isLoadingDataset = false;
  datasetName: string = '';
  datasetDescription: string = '';
  datasetStatus: number = 1;
  initialQuery?: string;
  originalQuery: string = ''; // Store original query from dataset

  editor: any;

  // ── Query parameters ({{name}}) ───────────────────────────────────
  /** Last-run param error (MISSING_REQUIRED_PARAM / UNKNOWN_PARAM). */
  paramRunError: DatasetParamRunError | null = null;
  /** True while a run-with-params request is in flight. */
  isRunningWithParams = false;

  // Theme monitoring. Default to the app's light theme ('vs'), not
  // 'vs-dark' — Monaco's setTheme is GLOBAL, so a stale dark default
  // here could leak into the editor when it re-creates on a
  // navigate-away-and-back (the editor mounts before the theme is
  // the safe default avoids a dark flash / stuck-dark editor.


  // ── Diff-before-save (Slice 3) ────────────────────────────────────
  /** Saved dataset columns (columnToUse + dataType), captured on load,
   *  used as the baseline for the column delta. */
  private originalFields: SimpleColumn[] = [];
  /** True while the diff dialog is open awaiting confirm/cancel. */
  showDiffDialog = false;

  // ── Formula field authoring from the editor ───────────────────────
  /** Rows handed to the formula dialog for its {field} completions. */
  datasetFieldRows: any[] = [];
  showFormulaFieldDialog = false;
  editingFormulaField: any = null;

  openFormulaFieldDialog(field?: any): void {
    this.editingFormulaField = field ?? null;
    this.showFormulaFieldDialog = true;
  }

  /**
   * Patch the shared store rather than reloading the dataset, so the sidebar and
   * the formula editor's field completions reflect the save immediately.
   */
  onFormulaFieldDialogClose(payload: any): void {
    this.showFormulaFieldDialog = false;
    const field = payload?.field ?? payload;
    this.editingFormulaField = null;
    if (!field) return;
    this.fieldsStore.upsert(field);
    const key = field.id ?? field.columnToUse;
    const index = this.datasetFieldRows.findIndex(
      (r: any) =>
        (field.id && r.id === field.id) || r.columnToUse === field.columnToUse,
    );
    this.datasetFieldRows =
      index === -1 || !key
        ? [...this.datasetFieldRows, field]
        : this.datasetFieldRows.map((r: any, i: number) =>
            i === index ? field : r,
          );
  }
  /** Computed line diff for the SQL side-by-side pane. */
  diffLines: SqlDiffLine[] = [];
  /** Old / new SQL captured when the diff opened. */
  diffOldSql = '';
  diffNewSql = '';
  /** Column delta (added/removed/renamed/type-changed). */
  columnDelta: ColumnDelta | null = null;
  /** True while previewColumns is in flight for the diff. */
  isComputingDiff = false;
  /** Downstream consumer counts when a removed/renamed column is used. */
  diffLineage: { analyses: number; dashboards: number } | null = null;
  /** The form payload captured at diff-open, committed on confirm. */
  private pendingSaveForm: DatasetFormData | null = null;
  /** When true, run the preview immediately after the pending save. */
  private pendingSaveAndRun = false;

  // ── Result export + profiling (Slice 4) ───────────────────────────


  // (Removed: isPaginatorNeeded — see add-dataset for the same
  // change. Paginator is now always-on so the footer doesn't pop
  // in when a result spills past one page.)


  // ── Bottom-sheet + result-grid state ──────────────────────────────
  //
  // Held by ResultSheetLayoutService and ResultGridToolsService; these proxies
  // keep the template bindings working unchanged.


  /**
   * Per-column pixel width applied to the result grid's <colgroup>.
   *
   * Writable, unlike add-dataset's: this screen also overlays widths the user
   * dragged and persisted per dataset (see restoreColumnState / onResultColResize).
   */
  get columnWidths(): Record<string, number> {
    return this.grid.columnWidths;
  }
  set columnWidths(widths: Record<string, number>) {
    this.grid.columnWidths = widths;
  }


  selectedDatasourceName: string = '';


  get hasQueryChanged(): boolean {
    if (!this.editor) return false;
    const currentQuery = this.editor.getValue().trim();
    const originalQuery = this.originalQuery.trim();
    return currentQuery !== originalQuery;
  }

  hasUnsavedChanges(): boolean {
    return this.hasQueryChanged;
  }


  constructor(
    private datasourceService: ConnectorService,
    private router: Router,
    private route: ActivatedRoute,
    private fieldsStore: DatasetFieldsStore,
  ) {
    super();
  }

  // ── ResultSheetHost / ResultGridHost ────────────────────────────
  //
  // The two result-pane services reach back through these rather than taking an
  // ElementRef or a ChangeDetectorRef of their own, which keeps them free of any
  // dependency on this screen in particular.


  // ── SchemaTreeHost ──────────────────────────────────────────────

  /**
   * Lazy-fetch behaviour this screen asks for.
   *
   * Neither flag is set, which is what this screen did before: no re-entry guard
   * (so two rapid expands of one schema issue two requests) and no up-front row
   * spinner. add-dataset sets both. Deliberately preserved — see the drift
   * reconciliation plan.
   */
  private static readonly ENSURE_TABLES: EnsureTablesOptions = {
    guardReentry: false,
    markLoading: false,
  };


  /**
   * Empty by design: this screen never searched a datasource list to resolve a
   * dbType, only the current selection.
   */
  dbTypeCandidates(): any[] {
    return [];
  }

  /** Reads the current selection regardless of dbId, as this screen always did. */
  cachedSchemaDbType(_dbId: string): string | null {
    return this.selectedDatasourceObj?.config?.dbType ?? null;
  }

  /** This screen always inserts a fully-qualified `schema.table.column`. */
  omitPublicSchemaPrefix(): boolean {
    return false;
  }

  ngOnInit(): void {
    // Restore the user's preferred result-sheet height + collapsed
    // state so a returning user gets back where they left off.
    this.sheet.attach(this);
    this.grid.attach(this);
    this.tree.attach(this, EditDatasetComponent.ENSURE_TABLES);
    this.sheet.loadPersisted();

    // Setup debounce for result filter changes
    this.resultFilterSubject
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.lastExecutedQuery) return;

        // Reset to first page on filter change
        this.resultPage = 1;

        // Build filter object from non-empty filter values
        const filter: { [key: string]: string } = {};
        for (const col of Object.keys(this.resultFilterValues)) {
          if (this.resultFilterValues[col]) {
            filter[col] = this.resultFilterValues[col];
          }
        }

        this.executeQueryForDatasource(
          this.lastExecutedQuery,
          1,
          this.resultRows,
          filter,
        );
      });

    // Debounced SQL → params panel. See add-dataset for the rationale.
    this.sqlParamScan$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(sql => {
        this.paramsSql = sql;
        this.cdr.markForCheck();
      });

    // Fetch datasetId from route params
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.datasetId = params['id'] ? params['id'] : undefined;

        // If datasetId is present, fetch dataset data first
        if (this.datasetId) {
          this.fetchDatasetData();
        }
      });
  }


  ngOnDestroy(): void {
    this.resultFilterSubject.complete();
    // The pane observer, its debounce timer and any in-flight sheet drag are
    // disposed by ResultSheetLayoutService's own ngOnDestroy, which Angular runs
    // for a component-provided service.

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

    // Cancel any pending lint pass so it doesn't fire after teardown.
    if (this.dialectLintTimer) {
      clearTimeout(this.dialectLintTimer);
      this.dialectLintTimer = null;
    }

    // Cleanup theme observer

    // Remove context menu listener
    document.removeEventListener('click', this.boundCloseContextMenu);
  }


  protected initMonaco(): void {
    if (!this.selectedDatasourceObj) {
      this.isLoadingEditor = false;
      this.cdr.markForCheck();
      return;
    }

    // Lock the dialect to the datasource we're editing against. Edit
    // mode never lets the user switch datasources — the dataset is
    // bound to one — so this only needs to fire once per editor init.
    this.monacoIntelliSenseService.setActiveDbType(
      this.selectedDatasourceObj?.config?.dbType ?? null,
    );

    // Wait for the DOM to be ready
    setTimeout(async () => {
      const container = this.sqlEditorContainer?.nativeElement;
      if (!container) {
        this.isLoadingEditor = false;
        this.cdr.markForCheck();
        return;
      }

      try {
        // Dispose previous editor if exists
        if (this.editor) {
          // Through the handle: it disposes the editor plus every listener and
          // overlay registered against it, so nothing is left behind.
          this.handle?.dispose();
          this.handle = null;
        }

        const initialValue = this.initialQuery || SQL_EDITOR_PLACEHOLDER;
        // One call replaces load → register language → define theme → create →
        // re-assert the global theme → focus. CodeEditorService owns that sequence
        // for every editor in the app, so this screen cannot drift from the others.
        const handle = await this.codeEditor.create({
          host: container,
          flavour: 'sql',
          value: initialValue,
                  autoFocus: true,
        });
        this.handle = handle;
        // Existing call sites keep using this.editor; the handle is what
        // disposal goes through.
        this.editor = handle.editor;

        // Assert the theme globally after create. `create()`'s `theme`
        // option sets the global theme, but doing it explicitly here
        // makes the intent obvious and corrects any leak from another
        // Monaco instance mounted on a previously-visited screen.
        this.currentQuery = initialValue;

        // Add Ctrl+Enter handler for query execution
        this.editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          () => {
            this.executeQuery();
          },
        );

        // Focus the editor
        this.editor.focus();

        // Setup content change listener. Monaco events fire outside Angular's
        // zone — without markForCheck the Run button (gated on isQueryEmpty
        // / hasQueryChanged) won't update as the user types under OnPush.
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
          this.scheduleDialectLint();
          this.sqlParamScan$.next(this.currentQuery);
          this.cdr.markForCheck();
        });

        // Register IntelliSense
        this.registerIntelliSenseProviders();
        // Kick an initial lint pass so the user sees marker decorations
        // for any pre-existing syntax errors when they open an existing
        // dataset (instead of only on subsequent keystrokes).
        this.scheduleDialectLint();

        // Add keyboard shortcuts via service
        this.monacoIntelliSenseService.registerKeyboardShortcuts(
          this.editor,
          () => this.executeQuery(),
        );

        // Add custom context menu items
        this.editor.addAction({
          id: 'execute-complete-query',
          label: 'Execute Complete Query',
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.5,
          run: () => {
            this.executeCompleteQuery();
          },
        });

        this.editor.addAction({
          id: 'execute-selection',
          label: 'Execute Selected Query',
          contextMenuGroupId: 'navigation',
          contextMenuOrder: 1.6,
          precondition: 'editorHasSelection',
          run: () => {
            const selection = this.editor.getSelection();
            const selectedText = this.editor
              .getModel()
              .getValueInRange(selection);
            if (selectedText.trim()) {
              this.executeSelectedQuery(selectedText);
            }
          },
        });

        this.isLoadingEditor = false;
        this.cdr.markForCheck();
      } catch (error) {
        this.isLoadingEditor = false;
        this.cdr.markForCheck();
      }
    }, 100);
  }


  resetToOriginal(): void {
    if (!this.editor) return;

    // Reset editor to original query
    this.editor.setValue(this.originalQuery);
    this.currentQuery = this.originalQuery;
  }


  /**
   * Import a .sql / .txt file into the editor.
   *
   * Validation and reading live in `dataset-export.helper`; this keeps the toast
   * copy and the editor write, which are the parts that need the component. The
   * file input is cleared on every path so re-picking the same file still fires a
   * change event.
   */
  async onFileSelected(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    const result = await readSqlFile(
      file,
      EditDatasetComponent.SQL_UPLOAD_MAX_MB,
    );
    event.target.value = '';

    if (result.ok) {
      if (this.editor) {
        this.editor.setValue(result.sql);
        this.currentQuery = result.sql;
      }
      return;
    }

    const toast =
      result.reason === 'extension'
        ? {
            summary: 'DATASET.INVALID_FILE_FORMAT',
            detail: 'DATASET.INVALID_FILE_FORMAT_DESC',
            params: undefined,
          }
        : result.reason === 'size'
          ? {
              summary: 'DATASET.FILE_TOO_LARGE',
              detail: 'DATASET.FILE_SIZE_LIMIT',
              params: { size: EditDatasetComponent.SQL_UPLOAD_MAX_MB },
            }
          : {
              summary: 'DATASET.IMPORT_FAILED',
              detail: 'DATASET.IMPORT_FAILED_DESC',
              params: undefined,
            };

    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant(toast.summary),
      detail: this.translate.instant(toast.detail, toast.params),
      key: 'topRight',
      life: 3000,
      styleClass: 'custom-toast',
    });
  }


  onResultsLazyLoad(event: any): void {
    this.lastResultsLazyEvent = event;
    const page =
      Math.floor((event.first || 0) / (event.rows || this.resultRows)) + 1;
    const limit = event.rows || this.resultRows;

    if (!this.lastExecutedQuery) return;

    this.resultPage = page;
    this.resultRows = limit;

    // Build filter object from non-empty filter values
    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    this.executeQueryForDatasource(this.lastExecutedQuery, page, limit, filter);
  }

  protected executeQueryForDatasource(
    query: string,
    page: number = 1,
    limit: number = this.resultRows,
    filter: { [key: string]: string } = {},
  ): void {
    if (!query.trim()) {
      return;
    }

    if (!this.selectedDatasourceObj?.id) {
      return;
    }

    this.isExecutingQuery = true;
    this.lastExecutedQuery = query;

    const startTime = Date.now();

    const payload: any = {
      connectorId: this.selectedDatasourceObj.id,
      query: query,
      page: page,
      limit: limit,
    };

    if (Object.keys(filter).length > 0) {
      payload.filter = JSON.stringify(filter);
    }

    this.queryService
      .executeQuery(payload)
      .pipe(timeout(QUERY_EXECUTION_TIMEOUT_MS))
      .subscribe({
        next: (response: IAPIResponse<QueryExecuteData>) => {
          if (!response.status) {
            this.queryResult = {
              columns: [],
              rows: [],
              rowCount: 0,
              executionTime: `${Date.now() - startTime}ms`,
              error:
                response.message ||
                this.translate.instant('DATASET.QUERY_EXECUTION_FAILED'),
            };
            this.surfaceResultSheet();
            this.isExecutingQuery = false;
            this.cdr.markForCheck();
            return;
          }

          const data = response.data;
          if (!data) {
            this.queryResult = {
              columns: [],
              rows: [],
              rowCount: 0,
              executionTime: `${Date.now() - startTime}ms`,
              message: response.message,
            };
            this.surfaceResultSheet();
            this.isExecutingQuery = false;
            this.cdr.markForCheck();
            return;
          }

          const executionTime =
            typeof data.executionTime === 'number'
              ? `${data.executionTime}ms`
              : data.executionTime || `${Date.now() - startTime}ms`;

          this.queryResult = {
            columns: data.columns ?? [],
            columnTypes: data.columnTypes ?? {},
            rows: Array.isArray(data.data) ? data.data : [],
            rowCount: data.rowCount ?? 0,
            executionTime,
            query: data.query,
          };

          // Auto-fit columns to content. Columns keep their natural
          // measured widths; the trailing strip stays blank if total
          // is narrower than the container. Mirrors add-dataset.
          this.columnWidths = measureColumnWidths(
            this.queryResult.columns,
            this.queryResult.rows,
            this.queryResult.columnTypes,
          );
          // Overlay any user-remembered widths for this dataset.
          this.restoreColumnState();

          // Refresh the profiling strip against the new rows (only when
          // it's currently visible — otherwise it recomputes on open).
          if (this.showColumnProfile) this.grid.recomputeColumnProfiles();

          if (this.queryResult.columns.length > 0) {
            this.surfaceResultSheet();
          }

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          const executionTime = `${Date.now() - startTime}ms`;

          // Extract error message — RxJS TimeoutError gets a friendlier copy.
          let errorMessage: string;
          if (error instanceof TimeoutError) {
            errorMessage = this.translate.instant('DATASET.QUERY_TIMEOUT');
          } else if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error?.error === 'string') {
            errorMessage = error.error;
          } else {
            errorMessage = this.translate.instant(
              'DATASET.QUERY_EXECUTION_FAILED',
            );
          }

          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: executionTime,
            error: errorMessage,
          };
          this.surfaceResultSheet();

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ────────────────────────────────────────────────────────────────
  // Bottom-sheet behaviour mirrored from add-dataset. See
  // add-dataset.component.ts for the long-form comments on each
  // method — same semantics, scoped to this component's lifecycle.
  // ────────────────────────────────────────────────────────────────

  private static readonly SHEET_HEIGHT_STORAGE_KEY =
    'dbexec.queryResult.sheetHeightPx';
  private static readonly SHEET_COLLAPSED_STORAGE_KEY =
    'dbexec.queryResult.sheetCollapsed';
  private static readonly SHEET_MIN_HEIGHT = 240;
  private static readonly SHEET_MAX_HEIGHT_PADDING = 120;


  // ── Client-side result export + profiling (Slice 4) ───────────────

  /** Base file name for exports — derived from the dataset/datasource. */
  protected exportBaseName(): string {
    return buildExportBaseName([
      this.datasetName,
      this.selectedDatasourceName,
      this.selectedDatasourceObj?.name,
    ]);
  }


  // ── Result-grid column-state persistence (Slice 4) ────────────────
  private columnStateStorageKey(): string | null {
    if (!this.datasetId) return null;
    return `dbexec.dataset.${this.datasetId}.gridColumnState`;
  }

  /**
   * Persist the result grid's column widths (the one bit of state the
   * <colgroup>-driven grid exposes) keyed by dataset id. Sort/filter
   * are lazy-loaded server-side here, so only widths round-trip.
   * Fails silently when localStorage is unavailable.
   */
  private persistColumnState(): void {
    const key = this.columnStateStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ widths: this.columnWidths }));
    } catch (_) {
      /* localStorage may be unavailable */
    }
  }

  /**
   * PrimeNG `(onColResize)` — the user drag-resized a header. Map the
   * delta onto our <colgroup> width record and persist so the width
   * survives reloads. Guarded: only the data columns (index ≥ 1; the
   * leading # column is fixed) are tracked.
   */
  onResultColResize(event: { element?: HTMLElement; delta?: number }): void {
    if (!this.queryResult?.columns?.length) return;
    const th = event?.element as HTMLElement | undefined;
    const delta = event?.delta ?? 0;
    if (!th) return;
    // The header cell text is the column name (see the th-content
    // template). Fall back to width-only when it can't be resolved.
    const label = (th.textContent || '').trim();
    const col = this.queryResult.columns.find(c => label.startsWith(c));
    if (!col) return;
    const current = this.columnWidths[col] ?? th.offsetWidth ?? 160;
    this.columnWidths = {
      ...this.columnWidths,
      [col]: Math.max(60, current + delta),
    };
    this.persistColumnState();
  }

  /** Restore persisted column widths for this dataset, if any. */
  private restoreColumnState(): void {
    const key = this.columnStateStorageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.widths && typeof parsed.widths === 'object') {
        // Merge over the measured widths so a newly-added column still
        // gets an auto width while remembered ones win.
        this.columnWidths = { ...this.columnWidths, ...parsed.widths };
      }
    } catch (_) {
      /* corrupt / unavailable — ignore */
    }
  }


  onDatasetDialogClose(formData: DatasetFormData | null): void {
    this.showDatasetDialog = false;

    // Whether this save should re-run inline afterwards (Save & Run).
    // Captured + reset here so a cancelled dialog doesn't leave the
    // flag armed for the next plain Save.
    const andRun = this.pendingSaveAndRun;
    this.pendingSaveAndRun = false;

    if (!formData) return;
    if (!this.selectedDatasourceObj || !this.datasetId) return;

    const sql = this.editor?.getValue() || this.currentQuery;
    const sqlChanged = sql.trim() !== this.originalQuery.trim();

    // SQL unchanged (e.g. a rename/description-only edit) → commit
    // straight through, no diff review needed.
    if (!sqlChanged) {
      this.commitSave(formData, andRun);
      return;
    }

    // SQL changed → open the diff-before-save review. Capture the form
    // + the run intent so the commit can proceed once the user confirms.
    this.pendingSaveForm = formData;
    this.pendingSaveAndRun = andRun;
    this.openDiffDialog(sql);
  }

  /**
   * Build the diff-before-save review: line diff of old vs new SQL,
   * the column delta (via preview-columns on the NEW SQL), and — when
   * a column is removed or renamed — a downstream-consumer warning
   * from getLineage. Opens the dialog; the actual save waits for
   * `confirmDiffSave()`.
   */
  private openDiffDialog(newSql: string): void {
    this.diffOldSql = this.originalQuery;
    this.diffNewSql = newSql;
    this.diffLines = diffSqlLines(this.originalQuery, newSql);
    this.columnDelta = null;
    this.diffLineage = null;
    this.isComputingDiff = true;
    this.showDiffDialog = true;
    this.cdr.markForCheck();

    if (!this.datasetId) {
      this.isComputingDiff = false;
      return;
    }

    this.datasetService
      .previewColumns(this.datasetId, newSql)
      .then((response: any) => {
        // Accept both an envelope ({ data: { columns } }) and a bare
        // ({ columns }) shape so we don't depend on the wrapper.
        const cols = response?.data?.columns ?? response?.columns ?? [];
        const next: SimpleColumn[] = (Array.isArray(cols) ? cols : []).map(
          (c: any) => ({
            name: (c?.name ?? '').toString(),
            dataType: (c?.dataType ?? '').toString(),
          }),
        );
        this.columnDelta = diffColumns(this.originalFields, next);

        // Only bother the lineage endpoint when something is being
        // removed or renamed — those are the changes that break
        // downstream consumers.
        const breaking =
          this.columnDelta.removed.length > 0 ||
          this.columnDelta.renamed.length > 0;
        if (breaking && this.datasetId) {
          this.datasetService
            .getLineage(this.datasetId)
            .then((lin: any) => {
              const d = lin?.data ?? lin ?? {};
              this.diffLineage = {
                analyses: Array.isArray(d.analyses) ? d.analyses.length : 0,
                dashboards: Array.isArray(d.dashboards)
                  ? d.dashboards.length
                  : 0,
              };
              this.cdr.markForCheck();
            })
            .catch(() => {
              /* lineage is advisory — swallow */
            });
        }
      })
      .catch(() => {
        // preview-columns failed (e.g. invalid SQL). Leave the delta
        // null; the dialog still shows the SQL diff and lets the user
        // proceed at their own risk.
        this.columnDelta = null;
      })
      .finally(() => {
        this.isComputingDiff = false;
        this.cdr.markForCheck();
      });
  }

  /** User confirmed the diff review → run the deferred save. */
  confirmDiffSave(): void {
    this.showDiffDialog = false;
    const form = this.pendingSaveForm;
    const andRun = this.pendingSaveAndRun;
    this.pendingSaveForm = null;
    this.pendingSaveAndRun = false;
    if (form) this.commitSave(form, andRun);
  }

  /** User cancelled the diff review → stay on the page, discard nothing. */
  cancelDiffSave(): void {
    this.showDiffDialog = false;
    this.pendingSaveForm = null;
    this.pendingSaveAndRun = false;
    this.cdr.markForCheck();
  }

  /**
   * Commit the update. When `andRun` is true, stay on the page and
   * immediately re-run the preview (Save & Run); otherwise keep the
   * existing behaviour of navigating back to the list.
   */
  private commitSave(formData: DatasetFormData, andRun: boolean): void {
    if (!this.selectedDatasourceObj || !this.datasetId) return;

    const sql = this.editor?.getValue() || this.currentQuery;
    const saveData = {
      id: this.datasetId,
      name: formData.name,
      description: formData.description,
      datasource: this.selectedDatasourceObj.id,
      sql,
      // Always send the current config (even []) so removing every
      // {{token}} clears a previously-saved paramsConfig on the BE.
      paramsConfig: this.paramsConfig,
    };

    this.datasetService
      .updateDataset(saveData, (formData.justification || '').trim())
      .then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.originalQuery = this.editor?.getValue() || this.currentQuery;
          if (andRun) {
            // Save & Run: keep the editor open and preview the fresh SQL
            // in place rather than bouncing to the list.
            this.executeCompleteQuery();
          } else {
            this.router.navigate([DATASET.LIST]);
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  /**
   * Save & Run — opens the save dialog (name/description/justification
   * flow is reused) but flags the follow-up so that once the save
   * commits we re-run the preview inline instead of navigating away.
   * If the SQL changed, the diff review still runs first.
   */
  saveAndRun(): void {
    if (!this.selectedDatasourceObj || !this.datasetId) return;
    this.pendingSaveAndRun = true;
    this.showDatasetDialog = true;
  }


  /**
   * Run the SAVED dataset with the current parameter values via
   * POST /datasets/:id/run. Unlike the ad-hoc editor preview (which hits
   * /queries/execute and can't bind {{name}} tokens), this path lets the
   * BE substitute + bind the params safely. A MISSING_REQUIRED_PARAM /
   * UNKNOWN_PARAM 400 is surfaced back onto the offending param row.
   */
  onRunWithParams(params: Record<string, any>): void {
    if (!this.datasetId) return;
    this.paramRunError = null;
    this.isRunningWithParams = true;
    this.isExecutingQuery = true;
    const startTime = Date.now();

    this.datasetService
      .runDatasetQuery({
        datasetId: this.datasetId,
        params,
        limit: this.resultRows,
      })
      .then((response: any) => {
        if (!response?.status) {
          // Pull the structured param error out of the response body so
          // the panel can highlight the specific param.
          const errData = response?.data;
          if (
            errData &&
            (errData.code === 'MISSING_REQUIRED_PARAM' ||
              errData.code === 'UNKNOWN_PARAM')
          ) {
            this.paramRunError = { code: errData.code, param: errData.param };
          }
          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: `${Date.now() - startTime}ms`,
            error:
              response?.message ||
              this.translate.instant('DATASET.QUERY_EXECUTION_FAILED'),
          };
          this.surfaceResultSheet();
          return;
        }

        // runDatasetQuery returns a BARE array of enriched row objects;
        // derive the column list from the first row's keys.
        const rows: any[] = Array.isArray(response.data) ? response.data : [];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        this.queryResult = {
          columns,
          columnTypes: {},
          rows,
          rowCount: rows.length,
          executionTime: `${Date.now() - startTime}ms`,
        };
        this.columnWidths = measureColumnWidths(
          this.queryResult.columns,
          this.queryResult.rows,
          this.queryResult.columnTypes,
        );
        this.restoreColumnState();
        if (this.showColumnProfile) this.grid.recomputeColumnProfiles();
        if (columns.length > 0) {
          this.surfaceResultSheet();
        }
      })
      .catch((error: any) => {
        // Non-2xx surfaces here too (HttpClient throws). Dig the param
        // code out of the error envelope.
        const errData = error?.error?.data ?? error?.data;
        if (
          errData &&
          (errData.code === 'MISSING_REQUIRED_PARAM' ||
            errData.code === 'UNKNOWN_PARAM')
        ) {
          this.paramRunError = { code: errData.code, param: errData.param };
        }
        this.queryResult = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: `${Date.now() - startTime}ms`,
          error:
            error?.error?.message ||
            error?.message ||
            this.translate.instant('DATASET.QUERY_EXECUTION_FAILED'),
        };
        this.surfaceResultSheet();
      })
      .finally(() => {
        this.isRunningWithParams = false;
        this.isExecutingQuery = false;
        this.cdr.markForCheck();
      });
  }


  insertColumnName(
    dbId: string,
    schemaName: string,
    tableName: string,
    columnName: string,
  ): void {
    if (!this.editor) return;

    const selection = this.editor.getSelection();
    const text = `${schemaName}.${tableName}.${columnName}`;

    this.editor.executeEdits('insert-column', [
      {
        range: selection,
        text: text,
        forceMoveMarkers: true,
      },
    ]);

    this.editor.focus();
  }


  /**
   * Fetch dataset data by ID and populate the form
   */
  private fetchDatasetData(): void {
    if (!this.datasetId) return;

    this.isLoadingDataset = true;

    this.datasetService
      .getDataset(this.datasetId)
      .then(response => {
        this.isLoadingDataset = false;

        if (this.globalService.handleSuccessService(response, false)) {
          const dataset = response.data;

          // Type 2 (Prompt-based): open the v2 composer in edit mode
          if (dataset.type === 2 && dataset.queryBuilderId) {
            this.router.navigate(
              [QUERY_BUILDER.compose(dataset.queryBuilderId)],
              {
                queryParams: {
                  editDatasetId: dataset.id,
                  editDatasetName: dataset.name,
                },
                replaceUrl: true,
              },
            );
            return;
          }

          // Store dataset details
          this.datasetName = dataset.name || '';
          this.datasetDescription = dataset.description || '';
          this.datasetStatus = dataset.status || 1;
          // Seed the saved {{name}} parameter configuration so the panel
          // renders the author's existing types/labels/defaults/sources.
          this.paramsConfig = Array.isArray(dataset.paramsConfig)
            ? dataset.paramsConfig
            : [];

          // Capture the current column set as the diff baseline. Fields
          // carry `columnToUse` (the raw SQL column, matching what
          // preview-columns returns as `name`) + `dataType`.
          const fields = Array.isArray(dataset.datasetFields)
            ? dataset.datasetFields
            : Array.isArray(dataset.fields)
              ? dataset.fields
              : [];
          this.originalFields = fields
            .map((f: any) => ({
              name: (f?.columnToUse ?? f?.name ?? '').toString(),
              dataType: (f?.dataType ?? '').toString(),
            }))
            .filter((c: SimpleColumn) => !!c.name);

          // Seed the live field store and the formula dialog's completion rows.
          // From here, saving a field patches the store instead of reloading, so
          // the sidebar and the editor's {field} suggestions stay current.
          this.datasetFieldRows = fields;
          this.fieldsStore.setAll(fields, dataset.id ?? this.datasetId ?? null);

          // Set database from API response. Spread the full
          // datasource payload (rather than just {id, name}) so the
          // `config.dbType` is available to the
          // selectedDbTypeOption getter — without it the engine
          // badge ("PostgreSQL" chip) silently disappears.
          this.selectedDatasourceObj = {
            id: dataset.connectorId,
            name: dataset.datasource?.name,
            ...(dataset.datasource || {}),
          };
          this.selectedDatasourceName = dataset.datasource?.name || '';
          this.expandedPaths.add(dataset.connectorId);

          // Load schema for the selected database
          this.tree.loadDatasourceSchema(dataset.connectorId).then(() => {
            // Set the SQL query in editor
            const sqlQuery = dataset.sql || SQL_EDITOR_PLACEHOLDER;
            this.initialQuery = sqlQuery;
            this.currentQuery = sqlQuery;
            this.originalQuery = sqlQuery; // Store original query for reset
            // Seed the params panel so tokens are scanned on first paint,
            // not only after the first keystroke.
            this.paramsSql = sqlQuery;

            // Initialize editor with the query
            if (!this.editor) {
              setTimeout(() => this.loadMonacoEditor(), 100);
            } else {
              this.editor.setValue(sqlQuery);
            }

            // Initialize component setup
            this.initializeComponent();
          });
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDataset = false;
        this.cdr.markForCheck();
      });
  }
}
