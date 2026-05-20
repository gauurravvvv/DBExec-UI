/**
 * Analyses Filter Slice — effects.
 *
 * Translates dispatched actions into network calls and dispatches
 * the Success/Failure follow-ups. Components stay pure: they tell
 * the store what they want, effects make it happen.
 *
 * mergeMap vs concatMap:
 *   loadOpen$    — concatMap. Only one open at a time per analysis;
 *                  serializing prevents races on tab-switch.
 *   fetchValues$ — mergeMap. Many independent dropdowns can fetch in
 *                  parallel; deduplication is done by the action
 *                  itself (callers shouldn't double-dispatch).
 */
import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  catchError,
  concatMap,
  EMPTY,
  from,
  map,
  mergeMap,
  of,
  take,
} from 'rxjs';
import { AnalysesService } from '../services/analyses.service';
import * as A from './analyses-filter.actions';
import { selectLane } from './analyses-filter.selectors';
import {
  FilterOptionsEntry,
  FILTER_CACHE_CONFIG,
} from './analyses-filter.state';

@Injectable()
export class AnalysesFilterEffects {
  constructor(
    private actions$: Actions,
    private analysesService: AnalysesService,
    private store: Store,
  ) {}

  /**
   * Open-mode: returns both the filter list and first-page values
   * for every dropdown in one round trip. Wired to the analysis-open
   * lifecycle so the bar can paint immediately on a warm cache and
   * still refresh on TTL expiry.
   */
  loadOpen$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.loadOpen),
      // Freshness gate — for each loadOpen action, peek the current
      // lane state once; if it's loaded AND within TTL, short-circuit.
      // take(1) is essential — store.select is a hot stream that
      // never completes, so without it the chain would hang.
      concatMap(action =>
        this.store.select(selectLane(action.analysisId)).pipe(
          take(1),
          mergeMap(lane => {
            const fresh =
              lane.status === 'loaded' &&
              lane.loadedAt != null &&
              Date.now() - lane.loadedAt < FILTER_CACHE_CONFIG.TTL_MS;
            return fresh ? EMPTY : of(action);
          }),
        ),
      ),
      // Now we have a stream of loadOpen actions that genuinely need
      // a network call.
      concatMap(({ analysisId, organisation }) =>
        from(
          this.analysesService.getFilterValuesBatch({
            organisation,
            analysisId,
            mode: 'open' as any,
            // BE derives the request list in 'open' mode; the
            // service interface still requires the field so we pass
            // an empty array.
            requests: [],
          }),
        ).pipe(
          map((res: any) => {
            if (!res?.status) {
              return A.loadOpenFailure({
                analysisId,
                error: res?.message || 'Failed to load filters',
              });
            }
            const payload = res.data || {};
            const filters = Array.isArray(payload.filters)
              ? payload.filters
              : [];
            // Normalise the BE per-filter result into the slice's
            // FilterOptionsEntry shape — fold `ok: true/false` into
            // a flat object with an optional `error` field.
            const results: Record<string, FilterOptionsEntry> = {};
            const raw = payload.results || {};
            for (const [filterId, r] of Object.entries<any>(raw)) {
              results[filterId] = beResultToEntry(r);
            }
            return A.loadOpenSuccess({ analysisId, filters, results });
          }),
          catchError(err =>
            of(
              A.loadOpenFailure({
                analysisId,
                error: err?.message || 'Network error',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * Per-dropdown fetch — search keystroke, page change, scroll-to-end.
   * Allowed to run in parallel across filters; per-filter dedupe
   * (no double-dispatch for the same key) is the component's job.
   */
  fetchValues$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchValues),
      mergeMap(
        ({ analysisId, organisation, filterId, search, page, pageSize }) =>
          from(
            this.analysesService.getFilterValuesBatch({
              organisation,
              analysisId,
              mode: 'fetch' as any,
              requests: [
                {
                  filterId,
                  search: search || undefined,
                  page: page ?? 1,
                  pageSize,
                },
              ],
            }),
          ).pipe(
            map((res: any) => {
              const raw = res?.data?.results?.[filterId];
              if (!res?.status || !raw) {
                return A.fetchValuesFailure({
                  analysisId,
                  filterId,
                  search: search ?? '',
                  page: page ?? 1,
                  error: {
                    code: 'sql_error',
                    message: res?.message || 'Failed to fetch filter values',
                  },
                });
              }
              // Per-filter error vs success — encode each into the
              // matching action so the reducer doesn't have to peek
              // inside the entry to decide.
              if (raw.ok === false) {
                return A.fetchValuesFailure({
                  analysisId,
                  filterId,
                  search: search ?? '',
                  page: page ?? 1,
                  error: {
                    code: (raw.error as any) || 'sql_error',
                    message: raw.message || 'Filter values unavailable',
                  },
                });
              }
              return A.fetchValuesSuccess({
                analysisId,
                filterId,
                search: search ?? '',
                page: page ?? 1,
                entry: beResultToEntry(raw),
              });
            }),
            catchError(err =>
              of(
                A.fetchValuesFailure({
                  analysisId,
                  filterId,
                  search: search ?? '',
                  page: page ?? 1,
                  error: {
                    code: 'sql_error',
                    message: err?.message || 'Network error',
                  },
                }),
              ),
            ),
          ),
      ),
    ),
  );
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Convert the BE per-filter result into the slice's FilterOptionsEntry
 * shape. The BE returns `{ ok: true, values, total, ... }` for hits
 * and `{ ok: false, error, message }` for misses; we flatten both
 * into the same object with an optional `error` field so reducers
 * and selectors don't have to discriminate the union.
 */
function beResultToEntry(r: any): FilterOptionsEntry {
  if (r?.ok === false) {
    return {
      values: [],
      total: 0,
      totalApproximate: false,
      truncated: false,
      nextPage: null,
      fetchedAt: Date.now(),
      error: {
        code: r.error || 'sql_error',
        message: r.message || 'Unknown error',
      },
    };
  }
  return {
    values: r?.values ?? [],
    total: r?.total ?? 0,
    totalApproximate: !!r?.totalApproximate,
    truncated: !!r?.truncated,
    nextPage: r?.nextPage ?? null,
    fetchedAt: Date.now(),
  };
}
