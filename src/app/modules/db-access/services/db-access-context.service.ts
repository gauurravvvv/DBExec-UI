import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DbAccessService } from './db-access.service';

/**
 * DbAccessContextService — the SHARED spine across the three DB-access
 * sidebar sections (Database Users / Database Roles / Privileges & Access).
 *
 * It holds:
 *  - the currently selected datasource id (a signal), synced to the
 *    `?ds=<id>` query param by the datasource-picker so a selection
 *    survives navigation between the three sections and deep-links;
 *  - the probed `capability` for that datasource (canManage / unsupported);
 *  - a MEMOISED introspection cache keyed by the DATA tuple, not by any
 *    component/rule id, so N rules on the same schema share ONE fetch:
 *      schemas  → key `${connectorId}`
 *      tables   → key `${connectorId}:${schema}`
 *      columns  → key `${connectorId}:${schema}:${table}`
 *      sequences→ key `${connectorId}:${schema}` (seq namespace)
 *      functions→ key `${connectorId}:${schema}` (fn namespace)
 *
 * Every introspection getter dedupes in-flight requests (returns the same
 * promise) and never re-fetches a resolved tuple. When the datasource
 * changes we clear ALL caches for the old one and bump a generation token
 * so late responses from the previous datasource are ignored
 * (cancel-on-switch). Nothing is fetched while the datasource is unset.
 */

export interface DbAccessCapability {
  canManage?: boolean;
  [k: string]: any;
}

type Option = { label: string; value: string };

@Injectable({ providedIn: 'root' })
export class DbAccessContextService {
  // ── Selected datasource + capability (signals shared across screens) ──
  private _datasourceId = signal<string>('');
  private _capability = signal<DbAccessCapability | null>(null);
  private _unsupported = signal<boolean>(false);
  private _capabilityLoading = signal<boolean>(false);

  readonly connectorId = this._datasourceId.asReadonly();
  readonly capability = this._capability.asReadonly();
  readonly unsupported = this._unsupported.asReadonly();
  readonly capabilityLoading = this._capabilityLoading.asReadonly();

  /** Emits whenever the selected datasource changes (id or ''). */
  readonly datasourceChanged$ = new Subject<string>();

  // ── Memoised introspection caches (keyed by DATA tuple) ────────────────
  private schemaCache = new Map<string, Option[]>();
  private schemaInflight = new Map<string, Promise<Option[]>>();
  private tableCache = new Map<string, Option[]>();
  private tableInflight = new Map<string, Promise<Option[]>>();
  private columnCache = new Map<string, Option[]>();
  private columnInflight = new Map<string, Promise<Option[]>>();
  private sequenceCache = new Map<string, Option[]>();
  private sequenceInflight = new Map<string, Promise<Option[]>>();
  private functionCache = new Map<string, Option[]>();
  private functionInflight = new Map<string, Promise<Option[]>>();

  // Generation token — bumped on datasource change so a response that
  // resolves after a switch is discarded instead of populating the cache.
  private generation = 0;

  constructor(private dbAccess: DbAccessService) {}

  get canManage(): boolean {
    return !!this._capability()?.canManage;
  }

  /**
   * Set (or clear) the active datasource. Clears every downstream cache
   * for the OLD datasource, bumps the generation token (cancel-on-switch),
   * and notifies subscribers. Does NOT auto-probe capability — callers
   * (the picker) drive that so an unset selection fetches nothing.
   */
  setDatasource(id: string): void {
    const next = id || '';
    if (next === this._datasourceId()) return;
    this.generation++;
    this.clearCaches();
    this._capability.set(null);
    this._unsupported.set(false);
    this._datasourceId.set(next);
    this.datasourceChanged$.next(next);
  }

  /** Probe capability for the current datasource (once per selection). */
  async probeCapability(id: string): Promise<void> {
    if (!id) return;
    const gen = this.generation;
    this._capabilityLoading.set(true);
    try {
      const res: any = await this.dbAccess.loadCapability(id);
      if (gen !== this.generation) return; // switched away — ignore.
      this._capability.set(res?.status ? res.data : null);
      this._unsupported.set(false);
    } catch (err: any) {
      if (gen !== this.generation) return;
      // Non-postgres datasources 400 on capability.
      if (err?.status === 400 || err?.error?.code === 400) {
        this._unsupported.set(true);
      }
      this._capability.set(null);
    } finally {
      if (gen === this.generation) this._capabilityLoading.set(false);
    }
  }

  // ── Introspection (memoised, deduped, cancel-on-switch) ────────────────

  /**
   * Map an API payload to distinct { label, value } options.
   *
   * The tables/columns endpoints return GRANT rows (grantee/schema/table/
   * privilege/…), so every row carries a `schema` field. Without a preferred
   * key the generic `name ?? schema ?? table ?? column` chain collapses all
   * of those rows to the single schema name. `preferKey` lets each caller
   * pick the field that actually distinguishes its objects (e.g. 'table' for
   * the table list, 'column' for columns) before the generic fallback.
   */
  private toOptions(
    values: any[],
    preferKey?: 'name' | 'schema' | 'table' | 'column',
  ): Option[] {
    const names = values.map(v => {
      if (typeof v === 'string') return v;
      const preferred = preferKey ? v?.[preferKey] : undefined;
      return preferred ?? v?.name ?? v?.schema ?? v?.table ?? v?.column;
    });
    return Array.from(new Set(names.filter(Boolean))).map((v: string) => ({
      label: v,
      value: v,
    }));
  }

  /** Schemas for the current datasource — one fetch per datasource. */
  loadSchemas(connectorId: string): Promise<Option[]> {
    if (!connectorId) return Promise.resolve([]);
    const key = connectorId;
    if (this.schemaCache.has(key))
      return Promise.resolve(this.schemaCache.get(key)!);
    if (this.schemaInflight.has(key)) return this.schemaInflight.get(key)!;
    const gen = this.generation;
    const p = this.dbAccess
      .loadSchemas(connectorId)
      .then((res: any) => {
        const opts = this.toOptions(res?.status ? (res.data ?? []) : []);
        if (gen === this.generation) this.schemaCache.set(key, opts);
        return opts;
      })
      .catch(() => [] as Option[])
      .finally(() => this.schemaInflight.delete(key));
    this.schemaInflight.set(key, p);
    return p;
  }

  /** Tables for (datasource, schema) — one fetch per tuple, shared by all rules. */
  loadTables(connectorId: string, schema: string): Promise<Option[]> {
    if (!connectorId || !schema) return Promise.resolve([]);
    const key = `${connectorId}:${schema}`;
    if (this.tableCache.has(key))
      return Promise.resolve(this.tableCache.get(key)!);
    if (this.tableInflight.has(key)) return this.tableInflight.get(key)!;
    const gen = this.generation;
    const p = this.dbAccess
      .loadTableGrants(connectorId, schema)
      .then((res: any) => {
        const opts = this.toOptions(
          res?.status ? (res.data ?? []) : [],
          'table',
        );
        if (gen === this.generation) this.tableCache.set(key, opts);
        return opts;
      })
      .catch(() => [] as Option[])
      .finally(() => this.tableInflight.delete(key));
    this.tableInflight.set(key, p);
    return p;
  }

  /** Columns for (datasource, schema, table) — one fetch per tuple. */
  loadColumns(
    connectorId: string,
    schema: string,
    table: string,
  ): Promise<Option[]> {
    if (!connectorId || !schema || !table) return Promise.resolve([]);
    const key = `${connectorId}:${schema}:${table}`;
    if (this.columnCache.has(key))
      return Promise.resolve(this.columnCache.get(key)!);
    if (this.columnInflight.has(key)) return this.columnInflight.get(key)!;
    const gen = this.generation;
    const p = this.dbAccess
      .loadColumnGrants(connectorId, schema, table)
      .then((res: any) => {
        const opts = this.toOptions(
          res?.status ? (res.data ?? []) : [],
          'column',
        );
        if (gen === this.generation) this.columnCache.set(key, opts);
        return opts;
      })
      .catch(() => [] as Option[])
      .finally(() => this.columnInflight.delete(key));
    this.columnInflight.set(key, p);
    return p;
  }

  /** Sequences for (datasource, schema) — one fetch per tuple. */
  loadSequences(connectorId: string, schema: string): Promise<Option[]> {
    if (!connectorId || !schema) return Promise.resolve([]);
    const key = `${connectorId}:${schema}`;
    if (this.sequenceCache.has(key))
      return Promise.resolve(this.sequenceCache.get(key)!);
    if (this.sequenceInflight.has(key)) return this.sequenceInflight.get(key)!;
    const gen = this.generation;
    const p = this.dbAccess
      .loadSequences(connectorId, schema)
      .then((res: any) => {
        const opts = this.toOptions(res?.status ? (res.data ?? []) : []);
        if (gen === this.generation) this.sequenceCache.set(key, opts);
        return opts;
      })
      .catch(() => [] as Option[])
      .finally(() => this.sequenceInflight.delete(key));
    this.sequenceInflight.set(key, p);
    return p;
  }

  /** Functions for (datasource, schema) — one fetch per tuple. */
  loadFunctions(connectorId: string, schema: string): Promise<Option[]> {
    if (!connectorId || !schema) return Promise.resolve([]);
    const key = `${connectorId}:${schema}`;
    if (this.functionCache.has(key))
      return Promise.resolve(this.functionCache.get(key)!);
    if (this.functionInflight.has(key)) return this.functionInflight.get(key)!;
    const gen = this.generation;
    const p = this.dbAccess
      .loadFunctions(connectorId, schema)
      .then((res: any) => {
        const opts = this.toOptions(res?.status ? (res.data ?? []) : []);
        if (gen === this.generation) this.functionCache.set(key, opts);
        return opts;
      })
      .catch(() => [] as Option[])
      .finally(() => this.functionInflight.delete(key));
    this.functionInflight.set(key, p);
    return p;
  }

  /** Synchronous cache peek (no fetch) — for template getters. */
  peekTables(connectorId: string, schema: string): Option[] {
    return this.tableCache.get(`${connectorId}:${schema}`) ?? [];
  }
  peekColumns(connectorId: string, schema: string, table: string): Option[] {
    return this.columnCache.get(`${connectorId}:${schema}:${table}`) ?? [];
  }
  peekSchemas(connectorId: string): Option[] {
    return this.schemaCache.get(connectorId) ?? [];
  }
  peekObjects(
    connectorId: string,
    schema: string,
    level: 'sequence' | 'function',
  ): Option[] {
    const key = `${connectorId}:${schema}`;
    return (
      (level === 'sequence' ? this.sequenceCache : this.functionCache).get(
        key,
      ) ?? []
    );
  }

  /** Drop the cached tables + columns for a schema (used when a rule's schema clears). */
  invalidateSchema(connectorId: string, schema: string): void {
    if (!schema) return;
    const prefix = `${connectorId}:${schema}`;
    this.tableCache.delete(prefix);
    this.sequenceCache.delete(prefix);
    this.functionCache.delete(prefix);
    for (const k of Array.from(this.columnCache.keys())) {
      if (k.startsWith(prefix + ':')) this.columnCache.delete(k);
    }
  }

  private clearCaches(): void {
    this.schemaCache.clear();
    this.schemaInflight.clear();
    this.tableCache.clear();
    this.tableInflight.clear();
    this.columnCache.clear();
    this.columnInflight.clear();
    this.sequenceCache.clear();
    this.sequenceInflight.clear();
    this.functionCache.clear();
    this.functionInflight.clear();
  }
}
