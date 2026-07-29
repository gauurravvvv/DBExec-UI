import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, Subject, TimeoutError } from 'rxjs';
import { debounceTime, first, timeout } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { DATASET } from 'src/app/core/constants/routes.constant';
import { IAPIResponse } from 'src/app/core/models/global.model';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from 'src/app/modules/datasource/constants/database-types.constant';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
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
import {
  ContextMenuItem,
  ContextMenuPosition,
} from '../../models/query-tab.model';
import { DatasetService } from '../../services/dataset.service';
import { MonacoIntelliSenseService } from '../../services/monaco-intellisense.service';
import { QueryService } from '../../services/query.service';
import { SqlFormatterService } from '../../services/sql-formatter.service';
import { SqlLinterService } from '../../services/sql-linter.service';
import { SqlValidatorService } from '../../services/sql-validator.service';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';
import { DatasetParamConfig } from '../../helpers/param-tokens.helper';
import {
  ColumnProfile,
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

// Declare Monaco and window for TypeScript
declare const monaco: any;
declare const window: any;

import { expandAnimation } from '../../animations/expand.animation';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
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
export class AddDatasetComponent
  extends DatasetSqlWorkbenchBase
  implements
    OnInit,
    OnDestroy,
    AfterViewInit,
    OnChanges,
    HasUnsavedChanges,
    ResultSheetHost,
    ResultGridHost,
    SchemaTreeHost
{
  /**
   * Size cap for an imported .sql / .txt script.
   *
   * edit-dataset uses 22 here. That divergence is preserved deliberately — see
   * the drift reconciliation plan — so the value stays per-screen rather than
   * moving into the shared helper.
   */
  private static readonly SQL_UPLOAD_MAX_MB = 2;

  // Removed ViewChild as we now use dynamic containers per tab
  @Input() datasourceId?: string;
  @Input() initialQuery?: string;


  /**
   * Per-column pixel width for the result grid's <colgroup>, measured by
   * ResultGridToolsService. PrimeNG's [resizableColumns] then lets the user drag
   * borders; the live width during a drag is PrimeNG's own DOM state, not this map.
   */
  get columnWidths(): Record<string, number> {
    return this.grid.columnWidths;
  }

  // The pane ResizeObserver, its debounce timer and the last observed width live
  // on ResultSheetLayoutService, which also disposes them.


  // ── Query parameters ({{name}}) ───────────────────────────────────

  // Theme monitoring. Default to the app's light theme ('vs'), not
  // 'vs-dark' — Monaco's setTheme is GLOBAL, so a stale dark default
  // corrects this at create time; the light default avoids a flash.


  /**
   * When the user opens add-dataset via the list-page popup we pass
   * a `schema` query param. The sidebar filter pipe (filterSchemas)
   * reads this and shows only that schema; cross-schema queries
   * still work (the editor doesn't reject them) but the tree is
   * scoped. Null = no scoping; show every schema as before.
   */
  get scopedSchema(): string | null {
    return this.tree.scopedSchema;
  }
  set scopedSchema(schema: string | null) {
    this.tree.scopedSchema = schema;
  }

  /**
   * True when the user arrived via `?schema=X` AND that schema's
   * tables fetch came back with a 404 / failure. Used to grey out
   * the SQL editor and block Run — without the scoped schema we
   * can't trust the autocomplete OR resolve unqualified table
   * references, so letting the user type into the editor would
   * produce queries that can't validate. Calculated on every
   * change-detection cycle by checking the matching schema row's
   * `tablesError` flag.
   */
  get scopedSchemaUnavailable(): boolean {
    if (!this.scopedSchema || !this.selectedDatasourceObj?.id) return false;
    const tree = this.datasourceSchemas[this.selectedDatasourceObj.id];
    const schema = tree?.schemas?.find(
      (s: any) => s.name === this.scopedSchema,
    ) as any;
    return !!schema?.tablesError;
  }

  /** Convenience for the template — the actual error message
   *  pulled from the scoped schema's tablesError, if any. */
  get scopedSchemaErrorMessage(): string | null {
    if (!this.scopedSchema || !this.selectedDatasourceObj?.id) return null;
    const tree = this.datasourceSchemas[this.selectedDatasourceObj.id];
    const schema = tree?.schemas?.find(
      (s: any) => s.name === this.scopedSchema,
    ) as any;
    return schema?.tablesError || null;
  }
  selectedDatasource: string = '';
  selectedSchema: string = '';


  // ── Result export + profiling (Slice 4) ───────────────────────────


  // (Removed: isPaginatorNeeded getter that conditionally hid the
  // paginator on single-page results. With the docked sheet, the
  // footer's vertical position should be stable between queries —
  // a 7-row result followed by a 1000-row result shouldn't make
  // the pagination chrome appear out of nowhere. PrimeNG greys out
  // the navigation arrows automatically when rowCount fits one
  // page; the page-size selector + range report stay readable.)

  // Change Confirmation Dialog
  showChangeConfirmDialog = false;
  pendingDatasourceChange: any = null;


  availableDatasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;


  isLoadingDatasources: boolean = false;


  get filteredAvailableDatasources(): any[] {
    if (!this.schemaSearchText) {
      return this.availableDatasources;
    }
    const search = this.schemaSearchText.toLowerCase();
    return this.availableDatasources.filter(db =>
      db.name.toLowerCase().includes(search),
    );
  }


  private _saved = false;

  hasUnsavedChanges(): boolean {
    return !this.isQueryEmpty && !this._saved;
  }


  constructor(
    private datasourceService: DatasourceService,
    private sqlFormatterService: SqlFormatterService,
    private sqlValidatorService: SqlValidatorService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    super();
  }

  /**
   * Lazy-fetch behaviour this screen asks for: skip a fetch already in flight,
   * and show the row spinner up front. edit-dataset passes neither.
   */
  private static readonly ENSURE_TABLES: EnsureTablesOptions = {
    guardReentry: true,
    markLoading: true,
  };

  // ── SchemaTreeHost ──────────────────────────────────────────────


  /** Loaded list first, then preloaded — the order this screen already used. */
  dbTypeCandidates(): any[] {
    return [
      ...(this.availableDatasources ?? []),
      ...(this.preloadedDatasources ?? []),
    ];
  }

  cachedSchemaDbType(dbId: string): string | null {
    return this.tree.getDbTypeFor(dbId);
  }

  /** This screen inserts `table.column` for the public schema. */
  omitPublicSchemaPrefix(): boolean {
    return true;
  }

  /** A scoped tree landed — the editor's read-only state may need to flip. */
  onScopedTreeChanged(): void {
    this.syncEditorReadOnlyState();
  }

  // ── ResultSheetHost / ResultGridHost ────────────────────────────
  //
  // The two result-pane services reach back through these rather than taking an
  // ElementRef or a ChangeDetectorRef of their own, which keeps them free of any
  // dependency on this screen in particular.


  ngOnInit(): void {
    // Restore the user's preferred result-grid page size so a
    // returning user doesn't have to flip the dropdown from the
    // default every time. localStorage may be unavailable in
    // Safari private mode → fail silently.
    this.loadPersistedPageSize();
    // Same idea for the bottom sheet's height + collapsed state.
    // First-run users get a sensible 45vh default.
    this.sheet.attach(this);
    this.grid.attach(this);
    this.tree.attach(this, AddDatasetComponent.ENSURE_TABLES);
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

    // Debounced SQL → params panel. Re-scanning on every keystroke would
    // thrash the tokenizer; 400ms matches the feel of the dialect lint.
    this.sqlParamScan$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(sql => {
        this.paramsSql = sql;
        this.cdr.markForCheck();
      });

    // The popup flow forwards `datasourceId` and an optional `schema`
    // on the query string. The BE derives the org from the JWT.
    const qp = this.route.snapshot.queryParamMap;
    const queryDatasourceId = qp.get('datasourceId');
    const querySchema = qp.get('schema');
    if (querySchema) {
      // Scope the editor to a single schema. The sidebar filter
      // pipe reads `scopedSchema` and hides every other schema row;
      // the picked one auto-expands on load so the user lands
      // straight in the tables list.
      this.scopedSchema = querySchema;
      this.expandedPaths.add(`${queryDatasourceId}.${querySchema}`);
    }

    if (queryDatasourceId) {
      // Preselected path: skip the datasource list page entirely; just
      // fetch the one record and bootstrap straight into the editor.
      this.bootstrapPreselectedDatasource(queryDatasourceId);
    } else {
      this.loadDatasources();
    }
    this.initializeComponent();
  }

  /**
   * Fetch the preselected datasource record (set via ?datasourceId=
   * from the list-dataset popup) and treat it as the active selection.
   * No dropdown UI; the dbType badge picks it up from
   * `selectedDatasourceObj.config.dbType`.
   */
  private bootstrapPreselectedDatasource(datasourceId: string): void {
    // Fast path — the list-dataset popup carries the full datasource
    // record through router state when the user clicks Continue.
    // That record already has id / name / config (with dbType), which
    // is everything the toolbar needs. Avoids hitting GET
    // /datasources/:org/:id, which builds an expensive stats blob
    // (size MB, row counts, per-table index counts) we don't render
    // on this page.
    const navState = this.router.getCurrentNavigation()?.extras?.state as
      { datasource?: any } | undefined;
    const stateDs =
      navState?.datasource ??
      // Angular replays state via window.history.state on refresh of
      // the same SPA navigation; also check that fallback.
      window.history?.state?.datasource ??
      null;

    if (stateDs?.id && String(stateDs.id) === String(datasourceId)) {
      this.applyPreselectedDatasource(stateDs);
      return;
    }

    // Slow path — direct deep-link / browser refresh / external
    // navigation that didn't pass router state. Fall back to the
    // full fetch; the toolbar still needs the dbType to render
    // dialect-aware autocomplete.
    this.isLoadingDatasources = true;
    this.datasourceService
      .viewDatasource(datasourceId)
      .then((res: any) => {
        this.isLoadingDatasources = false;
        if (this.globalService.handleSuccessService(res, false)) {
          const ds = res?.data;
          if (ds?.id) this.applyPreselectedDatasource(ds);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDatasources = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Common landing point for both fast (router state) and slow
   * (fetched) bootstrap paths — wires the selected datasource into
   * the component, mirrors it into the lookup lists used by the
   * dbType badge resolver, and triggers the lazy schema load.
   */
  private applyPreselectedDatasource(ds: any): void {
    this.selectedDatasourceObj = ds;
    this.preloadedDatasources = [ds];
    this.preloadedDatasourcesTotal = 1;
    this.availableDatasources = [ds];
    this.proceedWithDatasourceChange(ds);
  }


  onDatasourceChange(event: any): void {
    const selectedDb = event.value;
    if (!selectedDb || !selectedDb.id) return;

    // Check if editor has unsaved content
    const editorValue = this.editor ? this.editor.getValue().trim() : '';
    const hasContent = editorValue.length > 0;
    const defaultContent = SQL_EDITOR_PLACEHOLDER;
    const isDefaultContent = editorValue === defaultContent.trim();

    // Only show confirmation if there's actual user content (not empty and not default)
    if (hasContent && !isDefaultContent && this.selectedDatasourceObj) {
      // Show confirmation dialog
      this.pendingDatasourceChange = selectedDb;
      this.showChangeConfirmDialog = true;
      // Revert dropdown to current selection
      setTimeout(() => {
        this.selectedDatasourceObj = this.selectedDatasourceObj;
      }, 0);
      return;
    }

    this.proceedWithDatasourceChange(selectedDb);
  }

  private proceedWithDatasourceChange(selectedDb: any): void {
    // Bump the selection token so any in-flight schema responses for the
    // previously-selected datasource will be discarded when they return.
    const token = ++this.schemaSelectionToken;

    // Reset editor and results
    this.resetEditor();

    // Push the new dbType into the IntelliSense service so keyword /
    // function suggestions match the dialect the user is now writing
    // against. Cheap — providers stay registered and read this lazily.
    this.monacoIntelliSenseService.setActiveDbType(
      selectedDb?.config?.dbType ?? null,
    );

    // Expand the database in the tree
    this.expandedPaths.add(selectedDb.id);

    // Always load schema from API (don't use cached data)
    this.tree.loadDatasourceSchema(selectedDb.id).then(() => {
      // If the user switched away while we were loading, don't initialize
      // the editor based on stale state.
      if (token !== this.schemaSelectionToken) return;
      // Initialize editor if not already done
      if (!this.editor) {
        setTimeout(() => this.loadMonacoEditor(), 100);
      }
    });
  }

  loadDatasources(): void {
    this.isLoadingDatasources = true;
    this.selectedDatasourceObj = null;
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        this.isLoadingDatasources = false;
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.availableDatasources = items;

          // Auto-select the first database and load its schema
          if (this.availableDatasources.length > 0) {
            this.selectedDatasourceObj = this.availableDatasources[0];
            this.proceedWithDatasourceChange(this.selectedDatasourceObj);
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingDatasources = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  refreshDatasources(): void {
    // Collapse all expanded nodes
    this.expandedPaths.clear();

    // Clear all cached schema data
    this.datasourceSchemas = {};
    this.loadingDatasources = {};

    // Clear the datasources array for IntelliSense
    this.datasources = [];
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;

    // Reload the database list
    this.loadDatasources();
  }


  ngOnChanges(changes: SimpleChanges): void {
    // Update editor content if initialQuery changes
    if (
      changes['initialQuery'] &&
      this.editor &&
      changes['initialQuery'].currentValue
    ) {
      this.editor.setValue(changes['initialQuery'].currentValue);
    }
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

    // Cancel any pending lint pass so it doesn't fire after the
    // editor (and its model) have been torn down.
    if (this.dialectLintTimer) {
      clearTimeout(this.dialectLintTimer);
      this.dialectLintTimer = null;
    }

    // Dispose formatter and validator
    this.sqlFormatterService.dispose();
    this.sqlValidatorService.dispose();

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
          readOnly: this.scopedSchemaUnavailable,
                    autoFocus: true,
        });
        this.handle = handle;
        // Existing call sites keep using this.editor; the handle is what
        // disposal goes through.
        this.editor = handle.editor;
        this.currentQuery = initialValue;

        // Focus the editor
        this.editor.focus();

        // Register IntelliSense
        this.registerIntelliSenseProviders();

        // Register SQL Formatter
        this.sqlFormatterService.registerFormattingProvider();
        this.sqlFormatterService.registerContextMenuActions(this.editor);

        // Setup SQL Validator with real-time validation. Monaco events fire
        // outside Angular's zone, so OnPush won't notice the currentQuery
        // change without an explicit markForCheck — the Run button stays
        // greyed out as the user types otherwise.
        this.editor.onDidChangeModelContent(() => {
          this.currentQuery = this.editor.getValue();
          this.sqlValidatorService.validateDebounced(this.editor.getModel());
          this.scheduleDialectLint();
          this.sqlParamScan$.next(this.currentQuery);
          this.cdr.markForCheck();
        });

        // Initial validation
        this.sqlValidatorService.validate(this.editor.getModel());
        this.scheduleDialectLint();
        // Seed the params panel with the initial editor content.
        this.paramsSql = this.currentQuery;

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

    const result = await readSqlFile(file, AddDatasetComponent.SQL_UPLOAD_MAX_MB);
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
              params: { size: AddDatasetComponent.SQL_UPLOAD_MAX_MB },
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


  onConfirmChange(saveFirst: boolean): void {
    if (saveFirst) {
      // Open save dataset dialog
      this.showChangeConfirmDialog = false;
      this.showDatasetDialog = true;
      return;
    }

    // Proceed with change without saving
    this.showChangeConfirmDialog = false;

    if (this.pendingDatasourceChange) {
      this.proceedWithDatasourceChange(this.pendingDatasourceChange);
      this.pendingDatasourceChange = null;
    }
  }

  onCancelChange(): void {
    this.showChangeConfirmDialog = false;
    this.pendingDatasourceChange = null;
  }


  onResultsLazyLoad(event: any): void {
    this.lastResultsLazyEvent = event;
    const page =
      Math.floor((event.first || 0) / (event.rows || this.resultRows)) + 1;
    const limit = event.rows || this.resultRows;

    if (!this.lastExecutedQuery) return;

    this.resultPage = page;
    if (this.resultRows !== limit) {
      this.resultRows = limit;
      // User changed page size — persist so the new choice
      // survives reload. Page changes alone don't persist (those
      // are session-scoped navigation, not preferences).
      this.persistPageSize(limit);
    }

    // Build filter object from non-empty filter values
    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    this.executeQueryForDatasource(this.lastExecutedQuery, page, limit, filter);
  }

  /** localStorage key for the persisted page size. Namespaced to
   *  avoid collisions with other features that may add their own
   *  prefs later. */
  private static readonly PAGE_SIZE_STORAGE_KEY = 'dbexec.queryResult.pageSize';
  /** Whitelist of page-size values we accept from storage. Anything
   *  outside this set (corruption, an old version with different
   *  options) falls through to the default. */
  private static readonly ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

  private loadPersistedPageSize(): void {
    try {
      const raw = localStorage.getItem(
        AddDatasetComponent.PAGE_SIZE_STORAGE_KEY,
      );
      if (!raw) return;
      const parsed = parseInt(raw, 10);
      if (AddDatasetComponent.ALLOWED_PAGE_SIZES.includes(parsed)) {
        this.resultRows = parsed;
      }
    } catch (_) {
      // Safari private mode + a couple of locked-down enterprise
      // configs throw on localStorage access. Treat as "no
      // persisted value" and keep the default.
    }
  }

  private persistPageSize(value: number): void {
    if (!AddDatasetComponent.ALLOWED_PAGE_SIZES.includes(value)) return;
    try {
      localStorage.setItem(
        AddDatasetComponent.PAGE_SIZE_STORAGE_KEY,
        String(value),
      );
    } catch (_) {
      // See loadPersistedPageSize — same defensive fallback. The
      // user's session-level choice still works; only the
      // cross-session persistence is lost.
    }
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
    // Stale JSON-cell expand state would point at the previous
    // result's row indices; nuke it before the new rows arrive.
    if (this.expandedJsonCells.size > 0) {
      this.expandedJsonCells = new Set();
    }

    const startTime = Date.now();

    const payload: any = {
      datasourceId: this.selectedDatasourceObj.id,
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
            // Surface the error in the sheet so the user sees what
            // failed instead of staring at a Run button that
            // appeared to do nothing.
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
            // Show the message banner (DDL, "0 rows affected", etc.)
            // in the sheet even though there are no rows to render.
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

          // Auto-fit column widths to this result's content.
          this.grid.recalculateColumnWidths();

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

          // Extract error message — check for RxJS TimeoutError first so we can
          // surface a helpful message instead of an opaque "timeout" string.
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
          // Same reason as the response-status:false branch above
          // — surface the failure in the sheet so it's visible.
          this.surfaceResultSheet();

          this.isExecutingQuery = false;
          this.cdr.markForCheck();
        },
      });
  }

  onDatasetDialogClose(formData: DatasetFormData | null): void {
    this.showDatasetDialog = false;

    if (formData) {
      if (!this.selectedDatasourceObj) return;

      // Get the SQL query
      const sql = this.editor?.getValue() || this.currentQuery;

      const payload: any = {
        name: formData.name,
        description: formData.description,
        datasource: this.selectedDatasourceObj.id,
        sql,
      };
      // Persist the {{name}} parameter configuration alongside the SQL.
      // Empty when the SQL declares no tokens, so param-less datasets
      // send the same payload as before.
      if (this.paramsConfig.length > 0) {
        payload.paramsConfig = this.paramsConfig;
      }

      this.datasetService
        .addDataset(payload)
        .then(response => {
          if (this.globalService.handleSuccessService(response, true)) {
            // Navigate to dataset list
            this._saved = true;
            this.router.navigate([DATASET.LIST]);
            // Dataset saved successfully
            // Now proceed with pending change if any
            if (this.pendingDatasourceChange) {
              this.proceedWithDatasourceChange(this.pendingDatasourceChange);
              this.pendingDatasourceChange = null;
            }
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }


  /**
   * Push the current `scopedSchemaUnavailable` state into Monaco's
   * `readOnly` option. Called after every lazy-load resolution so
   * the editor flips locked/unlocked in step with the sidebar's
   * error state. No-op if the editor hasn't been created yet
   * (loadMonacoEditor handles initial state via the same path).
   */
  private syncEditorReadOnlyState(): void {
    if (!this.editor) return;
    const readOnly = this.scopedSchemaUnavailable;
    this.editor.updateOptions({ readOnly });
  }


  insertColumnName(
    dbId: string,
    schemaName: string,
    tableName: string,
    columnName: string,
  ): void {
    if (!this.editor) return;

    const selection = this.editor.getSelection();
    const text =
      schemaName.toLowerCase() === 'public'
        ? `${tableName}.${columnName}`
        : `${schemaName}.${tableName}.${columnName}`;

    this.editor.executeEdits('insert-column', [
      {
        range: selection,
        text: text,
        forceMoveMarkers: true,
      },
    ]);

    this.editor.focus();
  }


  // ── Client-side result export + profiling (Slice 4) ───────────────

  /** Base file name for exports — derived from the datasource. */
  protected exportBaseName(): string {
    return buildExportBaseName([this.selectedDatasourceObj?.name]);
  }


}
