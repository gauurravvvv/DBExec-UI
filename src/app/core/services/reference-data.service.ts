import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  map,
  of,
  shareReplay,
  tap,
  catchError,
} from 'rxjs';
import { REFERENCE_DATA } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * One reference-data row as returned by the BE. Rows are pre-sorted by
 * `sequence` ASC and already filtered to active rows only, so the FE
 * renders them verbatim.
 *
 * Mirrors the BE contract for `GET /reference-data`:
 *   { code, label, description?, meta?, sequence }
 */
export interface ReferenceRow {
  code: string;
  label: string;
  description?: string;
  meta?: any;
  sequence: number;
}

/** A family name → its ordered rows. */
export type ReferenceDataMap = Record<string, ReferenceRow[]>;

/**
 * ReferenceDataService — single source of truth for the DB-driven enum
 * option lists (operators, value types, severities, filter types, cron
 * presets, …). Fetches `GET /reference-data` ONCE, caches the whole map,
 * and hands out per-family row lists on demand.
 *
 * Contract (spec / BE agent):
 *   GET /reference-data        → { status, code, message, data: { [family]: Row[] } }
 *   GET /reference-data/:family → { …, data: Row[] }
 *
 * Design notes:
 *   - Lazy: the first `getFamily()` (or explicit `load()`) triggers the
 *     one-time HTTP call so app bootstrap is never blocked.
 *   - Idempotent: an in-flight load is shared; a completed load is not
 *     refetched. `load()` and `getFamily()` both honour this.
 *   - Degrade-not-crash: if the fetch fails we log a warning and fall
 *     back to a tiny hardcoded safety map for the most critical families
 *     (stale-while-revalidate) so operator dropdowns are never empty.
 *   - The DB `label` is what the UI renders — these labels are NOT run
 *     through ngx-translate. Static section headers / field labels keep
 *     their i18n keys in the consuming templates.
 *
 * IMPORTANT: this drives the RENDERED dropdown options only. The mirrored
 * Zod validators under src/app/shared/validators/*.ts remain the save-time
 * contract and are untouched.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceDataService {
  /** Cached family → rows map. Empty until the first successful load. */
  private readonly _data$ = new BehaviorSubject<ReferenceDataMap>({});

  /** Shared in-flight / completed load stream (idempotency guard). */
  private load$: Observable<ReferenceDataMap> | null = null;

  /** True once a load has completed (success or graceful fallback). */
  private loaded = false;

  /**
   * Minimal hardcoded safety net for the families a broken dropdown would
   * hurt the most. Codes mirror the mirrored validators so a failed fetch
   * still yields a usable — if un-prettified — operator list. Labels here
   * are deliberately terse; a live fetch replaces them.
   */
  private static readonly FALLBACK: ReferenceDataMap = {
    alert_operator: [
      { code: 'gt', label: '>', sequence: 1 },
      { code: 'gte', label: '>=', sequence: 2 },
      { code: 'lt', label: '<', sequence: 3 },
      { code: 'lte', label: '<=', sequence: 4 },
      { code: 'eq', label: '=', sequence: 5 },
      { code: 'neq', label: '!=', sequence: 6 },
      { code: 'between', label: 'between', sequence: 7 },
      { code: 'not_between', label: 'not between', sequence: 8 },
      { code: 'is_null', label: 'is null', sequence: 9 },
      { code: 'is_not_null', label: 'is not null', sequence: 10 },
      { code: 'changes_by_pct', label: 'changes by %', sequence: 11 },
    ],
    filter_operator: [
      {
        code: 'EQUALS',
        label: 'Equals',
        meta: { filterType: 'category' },
        sequence: 1,
      },
      {
        code: 'DOES_NOT_EQUAL',
        label: 'Does not equal',
        meta: { filterType: 'category' },
        sequence: 2,
      },
      {
        code: 'CONTAINS',
        label: 'Contains',
        meta: { filterType: 'category' },
        sequence: 3,
      },
      {
        code: 'DOES_NOT_CONTAIN',
        label: 'Does not contain',
        meta: { filterType: 'category' },
        sequence: 4,
      },
      {
        code: 'STARTS_WITH',
        label: 'Starts with',
        meta: { filterType: 'category' },
        sequence: 5,
      },
      {
        code: 'ENDS_WITH',
        label: 'Ends with',
        meta: { filterType: 'category' },
        sequence: 6,
      },
      {
        code: 'EQUALS',
        label: 'Equals',
        meta: { filterType: 'numeric_equality' },
        sequence: 7,
      },
      {
        code: 'NOT_EQUALS',
        label: 'Not equals',
        meta: { filterType: 'numeric_equality' },
        sequence: 8,
      },
      {
        code: 'GREATER_THAN',
        label: 'Greater than',
        meta: { filterType: 'numeric_equality' },
        sequence: 9,
      },
      {
        code: 'GREATER_THAN_OR_EQUAL',
        label: 'Greater than or equal',
        meta: { filterType: 'numeric_equality' },
        sequence: 10,
      },
      {
        code: 'LESS_THAN',
        label: 'Less than',
        meta: { filterType: 'numeric_equality' },
        sequence: 11,
      },
      {
        code: 'LESS_THAN_OR_EQUAL',
        label: 'Less than or equal',
        meta: { filterType: 'numeric_equality' },
        sequence: 12,
      },
      {
        code: 'BETWEEN',
        label: 'Between',
        meta: { filterType: 'numeric_range' },
        sequence: 13,
      },
      {
        code: 'EQUALS',
        label: 'Equals',
        meta: { filterType: 'time_equality' },
        sequence: 14,
      },
      {
        code: 'BEFORE',
        label: 'Before',
        meta: { filterType: 'time_equality' },
        sequence: 15,
      },
      {
        code: 'AFTER',
        label: 'After',
        meta: { filterType: 'time_equality' },
        sequence: 16,
      },
      {
        code: 'BETWEEN',
        label: 'Between',
        meta: { filterType: 'time_range' },
        sequence: 17,
      },
    ],
  };

  constructor(private http: HttpClientService) {}

  /**
   * Trigger (or reuse) the one-time load of the full reference-data map.
   * Idempotent: a shared observable is returned for in-flight / completed
   * loads; the network is hit at most once per app session.
   */
  load(): Observable<ReferenceDataMap> {
    if (this.loaded) return of(this._data$.value);
    if (this.load$) return this.load$;

    this.load$ = this.http
      .apiGet(REFERENCE_DATA.LIST, { skipLoader: true })
      .pipe(
        map((res: any) => {
          const data = (res?.data ?? {}) as ReferenceDataMap;
          return data && typeof data === 'object' ? data : {};
        }),
        tap((data: ReferenceDataMap) => {
          this.loaded = true;
          this._data$.next(data);
        }),
        catchError(() => {
          // Degrade, don't crash: warn, seed the safety map, mark loaded
          // so we don't hammer a failing endpoint on every getFamily call.
          console.warn(
            '[ReferenceDataService] failed to load /reference-data — ' +
              'falling back to hardcoded safety map for critical families',
          );
          this.loaded = true;
          this._data$.next({ ...ReferenceDataService.FALLBACK });
          return of(this._data$.value);
        }),
        shareReplay(1),
      );

    // Kick the HTTP ourselves. `getFamily()`/`getOptions()` return the
    // `_data$` stream (NOT load$), so without this internal subscription the
    // cold apiGet pipe would never execute and `_data$` would stay empty —
    // the "operators never load" bug. shareReplay(1) means any external
    // subscriber to load$ shares this single request; it fires exactly once.
    this.load$.subscribe();

    return this.load$;
  }

  /**
   * Rows for one family, as an observable. Triggers the one-time load if
   * it hasn't happened yet, then emits that family's rows (empty array if
   * the family is absent). Never errors — a failed load degrades to the
   * safety map / empty list.
   */
  getFamily(family: string): Observable<ReferenceRow[]> {
    this.load();
    return this._data$.pipe(map(m => m[family] ?? []));
  }

  /**
   * Synchronous snapshot of a family's rows from the current cache. Returns
   * `[]` when not yet loaded / absent. Handy for components that already
   * subscribed via getFamily and want a one-off read.
   */
  getFamilySnapshot(family: string): ReferenceRow[] {
    return this._data$.value[family] ?? [];
  }

  /**
   * Convenience: rows mapped to the `{ label, value }` shape every shared
   * dropdown/multiselect consumes. `label` is the DB label, `value` the
   * code. Preserves the BE `sequence` ordering.
   */
  getOptions(family: string): Observable<{ label: string; value: string }[]> {
    return this.getFamily(family).pipe(
      map(rows => rows.map(r => ({ label: r.label, value: r.code }))),
    );
  }
}
