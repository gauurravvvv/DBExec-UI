/**
 * The datasource schema tree for the dataset workbench screens: loading a
 * datasource's schemas, lazily fetching a schema's tables and a table's columns,
 * expand/collapse state, the search filter, and keeping the IntelliSense cache in
 * step with all of it.
 *
 * This was ~650 lines duplicated across add-dataset and edit-dataset. Sixteen of
 * the twenty-three members were already behaviourally identical; the seven that
 * had drifted are reconciled here **by parameterising the difference, not by
 * picking a winner** — each screen passes what it does today, so neither changes
 * behaviour. Every such point is commented, and the outstanding decisions are
 * tracked in `docs/superpowers/plans/2026-07-29-dataset-drift-reconciliation.md`.
 *
 * The drift that is now explicit rather than buried in two copies:
 *
 *  - `dbTypeCandidates()` — add searches its loaded + preloaded datasource lists
 *    before falling back to the selection; edit only ever had the fall-back.
 *  - `cachedSchemaDbType()` — add resolves per dbId; edit reads the current
 *    selection regardless of dbId.
 *  - `EnsureTablesOptions.guardReentry` — add skips a fetch already in flight;
 *    edit does not, and fires two requests on two rapid expands.
 *  - `EnsureTablesOptions.markLoading` — add flips the row to a spinner up front.
 *  - `scopedSchema` — add's scoped launch filters the tree to one schema; edit
 *    leaves it null, so the filter is inert there.
 *  - `onScopedTreeChanged()` — add re-evaluates the editor's read-only state after
 *    a scoped tree lands; edit has no such state.
 *  - `omitPublicSchemaPrefix()` — add inserts `table.column` for the public
 *    schema; edit always inserts `schema.table.column`.
 *
 * **Provide it on the component, not in root.** Expand state and a loaded tree
 * belong to one screen:
 *
 *     @Component({ providers: [DatasetSchemaTreeService] })
 */
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { first } from 'rxjs/operators';

import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from '../../datasource/services/datasource.service';
import { SchemaTransformerHelper } from '../helpers/schema-transformer.helper';
import { DatasourceSchema } from '../models/dataset-schema.model';
import { MonacoIntelliSenseService } from './monaco-intellisense.service';
import { QueryService } from './query.service';
import {
  AddDatasetActions,
  SchemaLoadingStatus,
  selectIsSchemaStale,
  selectSchemaByKey,
} from '../store';

/** Per-call behaviour for a lazy table fetch. See the class comment. */
export interface EnsureTablesOptions {
  /**
   * Skip the fetch when one is already in flight for this schema.
   *
   * `true` on add-dataset, `false` on edit-dataset. `false` means two rapid
   * expands issue two identical requests; that is a defect, but changing it is a
   * behaviour change and belongs to the drift reconciliation.
   */
  guardReentry: boolean;
  /** Flip the row to a spinner before the request goes out. add-dataset only. */
  markLoading: boolean;
  /** Suppress the global loader for a prefetch. add-dataset only. */
  background?: boolean;
}

/** What the schema tree needs from whichever screen is hosting it. */
export interface SchemaTreeHost {
  /** The component's `cdr.markForCheck()` — these screens are OnPush. */
  requestRender(): void;
  /** The Monaco instance, for inserting a column name at the cursor. */
  editorInstance(): any;
  /** The datasource record currently selected, if any. */
  selectedDatasourceRecord(): any | null;
  /**
   * Records to search when resolving a dbId's engine, in priority order.
   * add-dataset returns its loaded then preloaded lists; edit-dataset returns [].
   */
  dbTypeCandidates(): any[];
  /** dbType to stamp on a cached schema record. Differs per screen. */
  cachedSchemaDbType(dbId: string): string | null;
  /** Whether to insert `table.column` rather than `public.table.column`. */
  omitPublicSchemaPrefix(): boolean;
  /**
   * A scoped tree was (re)placed. add-dataset re-evaluates the editor's
   * read-only state here; edit-dataset does not implement it.
   */
  onScopedTreeChanged?(): void;
}

@Injectable()
export class DatasetSchemaTreeService {
  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService,
    private readonly globalService: GlobalService,
    private readonly datasourceService: DatasourceService,
    private readonly queryService: QueryService,
    private readonly intelliSense: MonacoIntelliSenseService,
  ) {}

  private host!: SchemaTreeHost;

  /** Loaded tree per datasource id. */
  datasourceSchemas: { [dbId: string]: DatasourceSchema } = {};

  /** Per-datasource in-flight flag, so each sidebar row spins independently. */
  loadingDatasources: { [dbId: string]: boolean } = {};

  /** `Object.values(datasourceSchemas)` — the shape IntelliSense consumes. */
  datasources: DatasourceSchema[] = [];

  /** Expanded node paths, as `dbId`, `dbId::schema`, `dbId::schema::table`. */
  expandedPaths = new Set<string>();

  /**
   * Whether a datasource's tree arrived whole or tables-only.
   *
   * 'lazy' means a schema's tables and a table's columns are fetched on expand.
   */
  schemaTreeMode: { [dbId: string]: 'eager' | 'lazy' } = {};

  /**
   * Monotonic token for the active datasource selection.
   *
   * A slow response for a datasource the user has since switched away from must
   * not overwrite the current tree; the token identifies stale replies.
   */
  schemaSelectionToken = 0;

  /**
   * When set, the tree is filtered to this one schema.
   *
   * add-dataset sets it from a `schema` query param (scoped launch). edit-dataset
   * leaves it null, which makes every filter guarded by it inert.
   */
  scopedSchema: string | null = null;

  /** Free-text filter applied to schema and table names in the sidebar. */
  schemaSearchText = '';

  /**
   * Per-screen defaults for a lazy table fetch triggered from inside the tree
   * (expanding a schema), where there is no caller to pass options.
   */
  private ensureTablesDefaults: EnsureTablesOptions = {
    guardReentry: false,
    markLoading: false,
  };

  /** Wire the service to its host component. Call once, from ngOnInit. */
  attach(host: SchemaTreeHost, ensureTablesDefaults: EnsureTablesOptions): void {
    this.host = host;
    this.ensureTablesDefaults = ensureTablesDefaults;
  }

  /** Recompute the IntelliSense-facing projection after a tree mutation. */
  private syncDatasources(): void {
    this.datasources = Object.values(this.datasourceSchemas);
    this.intelliSense.setDatasources(this.datasources);
  }

  schemaPath(dbId: string, schemaName: string): string {
    return `${dbId}.${schemaName}`;
  }

  tablePath(dbId: string, schemaName: string, tableName: string): string {
    return `${dbId}.${schemaName}.${tableName}`;
  }

  isExpanded(path: string): boolean {
    return this.expandedPaths.has(path);
  }

  isTableExpanded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): boolean {
    return this.expandedPaths.has(this.tablePath(dbId, schemaName, tableName));
  }

  /** Remove `dbId` and every descendant path under it from the expansion set. */
  collapseSubtree(dbId: string): void {
    const prefix = `${dbId}.`;
    for (const path of Array.from(this.expandedPaths)) {
      if (path === dbId || path.startsWith(prefix)) {
        this.expandedPaths.delete(path);
      }
    }
  }

  /** Remove `${dbId}.${schemaName}` and every table path under it. */
  private collapseSchemaSubtree(dbId: string, schemaName: string): void {
    const schemaKey = this.schemaPath(dbId, schemaName);
    const tablePrefix = `${schemaKey}.`;
    for (const path of Array.from(this.expandedPaths)) {
      if (path === schemaKey || path.startsWith(tablePrefix)) {
        this.expandedPaths.delete(path);
      }
    }
  }

  toggleDatasource(db: any): void {
    if (this.expandedPaths.has(db.id)) {
      // Collapse cascades to all schemas/tables under this DB.
      this.collapseSubtree(db.id);
    } else {
      this.expandedPaths.add(db.id);
      if (!this.datasourceSchemas[db.id]) {
        this.loadDatasourceSchema(db.id);
      }
    }
  }

  toggleSchema(dbId: string, schemaName: string): void {
    const key = this.schemaPath(dbId, schemaName);
    if (this.expandedPaths.has(key)) {
      this.collapseSchemaSubtree(dbId, schemaName);
      return;
    }
    this.expandedPaths.add(key);
    // Lazy-load: first expand triggers the table fetch. Subsequent
    // expands of the same schema hit the cached node and skip the
    // network call. Failures leave the node in an 'error' state with
    // the existing collapsed tables list visible (empty) — the user
    // can collapse + re-expand to retry.
    this.ensureTablesLoaded(dbId, schemaName, this.ensureTablesDefaults);
  }

  toggleTable(dbId: string, schemaName: string, tableName: string): void {
    const key = this.tablePath(dbId, schemaName, tableName);
    if (this.expandedPaths.has(key)) {
      this.expandedPaths.delete(key);
      return;
    }
    this.expandedPaths.add(key);
    this.ensureColumnsLoaded(dbId, schemaName, tableName);
  }

  getFilteredSchemas(schemas: any[] | undefined): any[] {
    if (!schemas || !this.schemaSearchText) {
      return schemas || [];
    }
    const search = this.schemaSearchText.toLowerCase();
    return schemas.filter(schema => {
      // Show schema if its name matches or if any of its tables match
      const schemaNameMatches = schema.name.toLowerCase().includes(search);
      const hasMatchingTable = schema.tables.some((table: any) =>
        table.name.toLowerCase().includes(search),
      );
      return schemaNameMatches || hasMatchingTable;
    });
  }

  getFilteredTables(tables: any[]): any[] {
    if (!this.schemaSearchText) {
      return tables;
    }
    const search = this.schemaSearchText.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(search));
  }

  /**
   * Resolve the dbType of a datasource id from whichever list is
   * authoritative right now — preloaded results first, then the active
   * selection if it matches.
   */
  getDbTypeFor(dbId: string): string | null {
    // add-dataset supplies its loaded + preloaded datasource records here, in
    // that order, so a dbId that is not the current selection still resolves.
    // edit-dataset supplies none, leaving only the selection fall-back — exactly
    // what that screen did before.
    const fromList = this.host
      .dbTypeCandidates()
      .find((d: any) => String(d?.id) === String(dbId))?.config?.dbType;
    if (fromList) return fromList;
    const selected = this.host.selectedDatasourceRecord();
    if (String(selected?.id) === String(dbId)) {
      return selected?.config?.dbType ?? null;
    }
    return null;
  }

  /**
   * Apply cached schema data from store to component state
   */
  applyCachedSchemaData(dbId: string, schemaData: any): void {
    // Tag the schema record with its dbType so hover / completion can
    // resolve the right dialect even when several datasources are loaded
    // into the IntelliSense cache simultaneously. The transformer doesn't
    // know the dbType (the API schema response doesn't include it), so
    // we annotate post-hoc from the matching datasource record.
    // add-dataset resolves this per dbId; edit-dataset reads the current
    // selection regardless of dbId. Preserved per screen via the host.
    const dbType = this.host.cachedSchemaDbType(dbId);
    if (schemaData && dbType) {
      schemaData = { ...schemaData, dbType };
    }
    this.datasourceSchemas[dbId] = schemaData;

    // Push fresh schema into the IntelliSense cache. The completion/hover
    // providers read this lazily on each invocation, so no re-registration
    // is needed — they pick up the new schema on the next keystroke.
    this.datasources = Object.values(this.datasourceSchemas);
    this.intelliSense.setDatasources(this.datasources);

    this.loadingDatasources[dbId] = false;
    this.host.requestRender();
  }

  async loadDatasourceSchema(dbId: string): Promise<void> {
    if (!dbId) return Promise.resolve();

    const dbIdStr = dbId.toString();

    // Check if we have cached data in the store
    return new Promise((resolve, reject) => {
      this.store
        .select(selectSchemaByKey(dbIdStr))
        .pipe(first())
        .subscribe((cachedEntry: any) => {
          if (!cachedEntry || !cachedEntry.data) {
            // No cached data, load from API
            this.loadDatasourceSchemaFromAPI(dbId).then(resolve).catch(reject);
          } else {
            // Check if data is stale
            this.store
              .select(selectIsSchemaStale(dbIdStr))
              .pipe(first())
              .subscribe((isStale: boolean) => {
                if (isStale) {
                  // Data is stale, refresh from API
                  this.loadDatasourceSchemaFromAPI(dbId)
                    .then(resolve)
                    .catch(reject);
                } else {
                  // Use cached data
                  this.applyCachedSchemaData(dbId, cachedEntry.data);
                  resolve();
                }
              });
          }
        });
    });
  }

  /**
   * Load datasource schema from API and update store
   */
  async loadDatasourceSchemaFromAPI(dbId: string): Promise<void> {
    if (!dbId) return Promise.resolve();

    const dbIdStr = dbId.toString();
    // Capture the selection token so we can detect a stale response on return.
    const token = this.schemaSelectionToken;

    this.loadingDatasources[dbId] = true;

    // Dispatch loading action
    this.store.dispatch(
      AddDatasetActions.loadSchemaData({
        dbId: dbIdStr,
      }),
    );

    return new Promise((resolve, reject) => {
      try {
        // Single bulk call — schemas, tables, AND columns in one
        // round-trip. The BE's getDatasourceStructure controller
        // walks information_schema (dialect-aware) and returns the
        // whole tree pre-shaped. Monaco's IntelliSense, the sidebar,
        // and hover/completion all get populated at once instead of
        // the previous schemas-first / tables-on-expand / columns-on-
        // expand cascade — which forced the user to click every row
        // before completion worked on pasted SQL.
        //
        // Uses queryPostNoLoader under the hood so the global loader
        // stays out of the way; the sidebar shows skeleton rows
        // while the request is in flight.
        this.queryService.getDatasourceStructure(dbIdStr).subscribe({
          next: (response: any) => {
            // Envelope check first — BE returns HTTP 200 with
            // status:false on application-level failures (bad
            // datasource, broken connection, etc.). Surface to
            // user via the standard service helper.
            if (response && response.status === false) {
              const msg =
                response.message ||
                this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
              this.globalService.handleSuccessService(response, false);
              this.store.dispatch(
                AddDatasetActions.loadSchemaDataFailure({
                  dbId: dbIdStr,
                  error: msg,
                }),
              );
              this.loadingDatasources[dbId] = false;
              this.host.requestRender();
              reject(new Error(msg));
              return;
            }

            const { datasources: transformed, mode } =
              SchemaTransformerHelper.transformSchemaResponseWithMode(response);
            // Mode = 'eager': columns shipped inline; every node
            // gets tablesStatus + columnsStatus = 'loaded' so the
            // lazy expand paths become no-ops.
            // Mode = 'lazy': BE auto-degraded (warehouse-scale
            // database). Schemas + tables are present; columns
            // are NOT. Mark tables loaded but columns idle so
            // ensureColumnsLoaded fires per-table on first
            // expand / IntelliSense reference. Track the mode on
            // the tree so the sidebar can hint at it.
            const loadedTree =
              mode === 'eager'
                ? this.markTreeFullyLoaded(
                    transformed[0],
                    this.getDbTypeFor(dbId),
                  )
                : this.markTreeTablesOnlyLoaded(
                    transformed[0],
                    this.getDbTypeFor(dbId),
                  );
            this.schemaTreeMode[dbId] = mode;

            // When the user picked a schema in the popup, narrow
            // the tree to just that schema so the sidebar matches
            // the editor's scope. The bulk endpoint returns
            // everything — cheaper to filter in JS than to ship a
            // separate scoped endpoint.
            const finalTree = this.scopedSchema
              ? {
                  ...loadedTree,
                  schemas: loadedTree.schemas.filter(
                    (s: any) => s.name === this.scopedSchema,
                  ),
                }
              : loadedTree;

            this.store.dispatch(
              AddDatasetActions.loadSchemaDataSuccess({
                dbId: dbIdStr,
                data: finalTree,
              }),
            );
            this.datasourceSchemas[dbId] = finalTree;

            if (token === this.schemaSelectionToken) {
              this.datasources = Object.values(this.datasourceSchemas);
              this.intelliSense.setDatasources(this.datasources);
              // Scoped-schema may have flipped to available/unavailable
              // depending on whether the schema name exists in the
              // returned tree — re-evaluate the editor lock.
              this.host.onScopedTreeChanged?.();
            }

            this.loadingDatasources[dbId] = false;
            this.host.requestRender();
            resolve();
          },
          error: (error: any) => {
            this.store.dispatch(
              AddDatasetActions.loadSchemaDataFailure({
                dbId: dbIdStr,
                error:
                  error?.message ||
                  this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
              }),
            );
            this.loadingDatasources[dbId] = false;
            this.host.requestRender();
            reject(error);
          },
        });
      } catch (error: any) {
        // Dispatch failure action
        this.store.dispatch(
          AddDatasetActions.loadSchemaDataFailure({
            dbId: dbIdStr,
            error:
              error.message ||
              this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA'),
          }),
        );

        this.loadingDatasources[dbId] = false;
        this.host.requestRender();
        reject(error);
      }
    });
  }

  /**
   * Kick off the lazy `tables-for-schema` fetch if this schema row
   * hasn't been populated yet. Idempotent: subsequent calls during
   * the same load (or after a successful load) are no-ops.
   *
   * With the bulk `getDatasourceStructure` call now driving the
   * initial load, every schema arrives already populated and this
   * method's already-loaded guard short-circuits in the common case.
   * It's still useful as a safety net for any future per-schema
   * refresh path or for trees that fall through with empty tables.
   *
   * `background` toggles the global loader off so manual single-
   * schema reloads can choose between blocking (default) and quiet
   * (true) behaviour.
   */
  ensureTablesLoaded(
    dbId: string,
    schemaName: string,
    options: EnsureTablesOptions,
  ): void {
    const { background = false, guardReentry, markLoading } = options;
    const dbIdStr = String(dbId);
    const tree = this.datasourceSchemas[dbId];
    const existing = tree?.schemas?.find(s => s.name === schemaName) as any;
    // Already-loaded guard: if we have tables, skip the fetch.
    // Network is the expensive part — checking against the in-memory
    // copy is cheaper than subscribing to the store.
    if (
      existing &&
      Array.isArray(existing.tables) &&
      existing.tables.length > 0
    ) {
      return;
    }
    // Already in-flight guard: a parallel pre-warm fetch is enough; a second
    // click while loading would duplicate the round-trip.
    //
    // add-dataset has this guard; edit-dataset does not, and so fires two
    // requests on two rapid expands. Both behaviours are preserved by the
    // caller's flag rather than one being silently adopted — see the drift
    // reconciliation plan.
    if (guardReentry && existing?.tablesStatus === 'loading') {
      return;
    }
    // Flip the per-row status to 'loading' immediately so the sidebar shows the
    // inline spinner before the store action propagates back. Without it the row
    // reads as "idle" for a few hundred ms and looks frozen. add-dataset only.
    if (markLoading) {
      this.replaceSchemaNode(dbId, schemaName, prev => ({
        ...prev,
        tablesStatus: 'loading',
        tablesError: null,
      }));
    }

    this.store.dispatch(
      AddDatasetActions.loadTablesForSchema({
        dbId: dbIdStr,
        schemaName,
      }),
    );

    this.datasourceService
      .listSchemaTables(
        {
          datasourceId: dbIdStr,
          schemaName,
        },
        background,
      )
      .then((response: any) => {
        // BE always returns HTTP 200; check the envelope's `status`
        // field for application-level failure. A typo in the URL
        // (e.g. ?schema=does_not_exist) returns
        // `{status: false, code: 404, message: 'Schema not found
        // in this datasource'}` — surface the message to the user
        // instead of silently rendering 0 tables.
        if (response && response.status === false) {
          const msg =
            response.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
          this.globalService.handleSuccessService(response, false);
          this.store.dispatch(
            AddDatasetActions.loadTablesForSchemaFailure({
              dbId: dbIdStr,
              schemaName,
              error: msg,
            }),
          );
          // Persist the error on the in-memory tree so the sidebar
          // can render an inline message under the schema row.
          this.replaceSchemaNode(dbId, schemaName, prev => ({
            ...prev,
            tablesError: msg,
            tablesStatus: 'error',
          }));
          this.host.requestRender();
          return;
        }

        const tables =
          SchemaTransformerHelper.transformLazyTablesResponse(response);
        // OnPush + pure pipes mean we MUST swap references at every
        // level — mutating `schema.tables = newArr` works for the
        // direct property but the parent schemas array reference
        // stays the same, so the *ngFor + filterSchemas pipe both
        // see a cached input and don't re-render. Rebuild the chain.
        this.replaceSchemaNode(dbId, schemaName, prev => ({
          ...prev,
          tables,
          tablesError: null,
          tablesStatus: 'loaded',
        }));

        this.store.dispatch(
          AddDatasetActions.loadTablesForSchemaSuccess({
            dbId: dbIdStr,
            schemaName,
            tables: tables.map(t => ({ name: t.name, alias: t.alias })),
          }),
        );
        this.host.requestRender();
      })
      .catch((error: any) => {
        const msg =
          error?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.store.dispatch(
          AddDatasetActions.loadTablesForSchemaFailure({
            dbId: dbIdStr,
            schemaName,
            error: msg,
          }),
        );
        this.replaceSchemaNode(dbId, schemaName, prev => ({
          ...prev,
          tablesError: msg,
          tablesStatus: 'error',
        }));
        this.host.requestRender();
      });
  }

  /**
   * Same shape as ensureTablesLoaded, one level deeper.
   */
  ensureColumnsLoaded(
    dbId: string,
    schemaName: string,
    tableName: string,
  ): void {
    const dbIdStr = String(dbId);
    const schema = this.datasourceSchemas[dbId]?.schemas?.find(
      s => s.name === schemaName,
    ) as any;
    const table = schema?.tables?.find((t: any) => t.name === tableName);
    if (table && Array.isArray(table.columns) && table.columns.length > 0) {
      return;
    }

    this.store.dispatch(
      AddDatasetActions.loadColumnsForTable({
        dbId: dbIdStr,
        schemaName,
        tableName,
      }),
    );

    this.datasourceService
      .listTableColumns({
        datasourceId: dbIdStr,
        schemaName,
        tableName,
      })
      .then((response: any) => {
        // Same envelope-status check as ensureTablesLoaded — see the
        // matching comment there for why a successful HTTP can still
        // be an application-level failure (BE always returns 200).
        if (response && response.status === false) {
          const msg =
            response.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
          this.globalService.handleSuccessService(response, false);
          this.store.dispatch(
            AddDatasetActions.loadColumnsForTableFailure({
              dbId: dbIdStr,
              schemaName,
              tableName,
              error: msg,
            }),
          );
          this.replaceTableNode(dbId, schemaName, tableName, prev => ({
            ...prev,
            columnsError: msg,
            columnsStatus: 'error',
          }));
          this.host.requestRender();
          return;
        }

        const columns =
          SchemaTransformerHelper.transformLazyColumnsResponse(response);
        // Same immutable-rebuild rationale as ensureTablesLoaded — see
        // replaceSchemaNode / replaceTableNode comments above.
        this.replaceTableNode(dbId, schemaName, tableName, prev => ({
          ...prev,
          columns,
          columnsError: null,
          columnsStatus: 'loaded',
        }));
        this.store.dispatch(
          AddDatasetActions.loadColumnsForTableSuccess({
            dbId: dbIdStr,
            schemaName,
            tableName,
            columns: columns.map(c => ({
              name: c.name,
              type: c.type,
              nullable: c.nullable,
              defaultValue: c.defaultValue ?? null,
            })),
          }),
        );
        this.host.requestRender();
      })
      .catch((error: any) => {
        const msg =
          error?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.store.dispatch(
          AddDatasetActions.loadColumnsForTableFailure({
            dbId: dbIdStr,
            schemaName,
            tableName,
            error: msg,
          }),
        );
        this.replaceTableNode(dbId, schemaName, tableName, prev => ({
          ...prev,
          columnsError: msg,
          columnsStatus: 'error',
        }));
        this.host.requestRender();
      });
  }

  /**
   * Tag every node in a freshly-arrived bulk-load tree as 'loaded'
   * (tablesStatus on each schema, columnsStatus on each table). This
   * keeps the per-row lazy spinners off and short-circuits any
   * subsequent `ensureTablesLoaded` / `ensureColumnsLoaded` calls
   * because their already-loaded guards see populated arrays.
   *
   * Pure function — returns a new tree object; original input is
   * not mutated, so callers can keep their own reference if needed.
   */
  private markTreeFullyLoaded(tree: any, dbType?: string | null): any {
    if (!tree) return tree;
    return {
      ...tree,
      ...(dbType ? { dbType } : {}),
      schemas: (tree.schemas ?? []).map((schema: any) => ({
        ...schema,
        tablesStatus: 'loaded',
        tablesError: null,
        tables: (schema.tables ?? []).map((table: any) => ({
          ...table,
          columnsStatus: 'loaded',
          columnsError: null,
        })),
      })),
    };
  }

  /**
   * Lazy-mode counterpart: tables are present (BE shipped them) but
   * columns are NOT. Mark tables loaded so the schema-expand spinner
   * stays off, but leave column status idle so `ensureColumnsLoaded`
   * fires the per-table fetch the first time the user expands the
   * row (or the first time Monaco's IntelliSense / hover needs that
   * table's columns). This is the warehouse-scale path.
   */
  private markTreeTablesOnlyLoaded(tree: any, dbType?: string | null): any {
    if (!tree) return tree;
    return {
      ...tree,
      ...(dbType ? { dbType } : {}),
      schemas: (tree.schemas ?? []).map((schema: any) => ({
        ...schema,
        tablesStatus: 'loaded',
        tablesError: null,
        tables: (schema.tables ?? []).map((table: any) => ({
          ...table,
          columnsStatus: 'idle',
          columnsError: null,
          columns: table.columns ?? [],
        })),
      })),
    };
  }

  /**
   * Immutably replace one schema row inside the cached tree. Rebuilds
   * the schemas array reference, the parent tree reference, and
   * `this.datasourceSchemas` itself so every reference Angular's
   * change-detector inspects (and every input the pure filterSchemas
   * / filterTables pipes cache against) actually changes. Also
   * refreshes the IntelliSense's mirrored copy so column hover /
   * completion picks up the new tables.
   */
  replaceSchemaNode(
    dbId: string,
    schemaName: string,
    patch: (schema: any) => any,
  ): void {
    const tree = this.datasourceSchemas[dbId];
    if (!tree) return;
    const idx =
      tree.schemas?.findIndex((s: any) => s.name === schemaName) ?? -1;
    if (idx < 0) return;
    const nextSchemas = tree.schemas.slice();
    nextSchemas[idx] = patch(tree.schemas[idx]);
    const nextTree = { ...tree, schemas: nextSchemas };
    this.datasourceSchemas = {
      ...this.datasourceSchemas,
      [dbId]: nextTree,
    };
    this.datasources = Object.values(this.datasourceSchemas);
    this.intelliSense.setDatasources(this.datasources);
    // If the patched schema is the one the URL scoped us to, the
    // editor's read-only state may need to flip (error appeared /
    // cleared). Cheap to re-evaluate every time; idempotent.
    if (schemaName === this.scopedSchema) {
      this.host.onScopedTreeChanged?.();
    }
  }

  /**
   * Same idea as replaceSchemaNode but one level deeper — replaces
   * one table row inside the matching schema.
   */
  private replaceTableNode(
    dbId: string,
    schemaName: string,
    tableName: string,
    patch: (table: any) => any,
  ): void {
    this.replaceSchemaNode(dbId, schemaName, schema => {
      const idx =
        schema.tables?.findIndex((t: any) => t.name === tableName) ?? -1;
      if (idx < 0) return schema;
      const nextTables = schema.tables.slice();
      nextTables[idx] = patch(schema.tables[idx]);
      return { ...schema, tables: nextTables };
    });
  }

  refreshSingleDatasource(dbId: string): void {
    if (!dbId) return;

    const dbIdStr = dbId.toString();

    // Dispatch refresh action to clear cache and reload
    this.store.dispatch(
      AddDatasetActions.refreshSchemaData({
        dbId: dbIdStr,
      }),
    );

    // Collapse this database's tree (datasource itself + schemas + tables).
    // One pass over the path set handles all three levels.
    this.collapseSubtree(dbId);

    // Clear local cache
    delete this.datasourceSchemas[dbId];
    delete this.loadingDatasources[dbId];

    // Remove from IntelliSense datasources array
    this.datasources = this.datasources.filter(
      db => db.name !== dbId.toString(),
    );

    // Re-fetch schema for this database from API
    this.loadDatasourceSchemaFromAPI(dbId);
  }

  insertColumnName(
    dbId: string,
    schemaName: string,
    tableName: string,
    columnName: string,
  ): void {
    const editor = this.host.editorInstance();
    if (!editor) return;

    const selection = editor.getSelection();
    // add-dataset drops a leading `public.`, because an unqualified name is what
    // a Postgres user expects to type; edit-dataset always qualifies. Kept
    // per-screen rather than unified.
    const text =
      this.host.omitPublicSchemaPrefix() &&
      schemaName.toLowerCase() === 'public'
        ? `${tableName}.${columnName}`
        : `${schemaName}.${tableName}.${columnName}`;

    editor.executeEdits('insert-column', [
      {
        range: selection,
        text: text,
        forceMoveMarkers: true,
      },
    ]);

    editor.focus();
  }}
