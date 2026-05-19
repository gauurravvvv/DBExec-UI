import { Injectable } from '@angular/core';
import { AnalysesService } from './analyses.service';

/**
 * FilterOptionsCache — in-memory store for analysis-filter dropdown
 * options, scoped to a single analysis at a time.
 *
 * Why a service and not a component field? Two reasons:
 *   1. The filter sidebar component is destroyed and re-created when
 *      the user navigates away and back. A service-level cache
 *      survives that, so reopening the same analysis within the
 *      session reuses the values fetched on the previous visit.
 *   2. The chart-renderer and the filter sidebar both want options
 *      for the same filters; centralising the fetch avoids duplicate
 *      calls when both ask at once.
 *
 * Cache shape: keyed by `${filterId}|${search}|${page}` so a
 * filter's "page 1, no search" entry is distinct from "page 1,
 * search=apac" and from "page 2, no search". Bounded TTL (60s) so
 * data changes propagate without manual invalidation; can be
 * cleared explicitly when the user hits Refresh.
 */

const TTL_MS = 60 * 1000;

export interface FilterOption {
  value: string | number | null;
  label: string;
}

export interface FilterValuesResultOk {
  ok: true;
  values: FilterOption[];
  total: number;
  totalApproximate: boolean;
  truncated: boolean;
  nextPage: number | null;
}

export interface FilterValuesResultErr {
  ok: false;
  error: 'column_missing' | 'sql_error' | 'forbidden';
  message: string;
}

export type FilterValuesResult = FilterValuesResultOk | FilterValuesResultErr;

interface CacheEntry {
  result: FilterValuesResult;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class FilterOptionsCacheService {
  private store = new Map<string, CacheEntry>();
  /** In-flight requests so concurrent callers share a single fetch. */
  private inFlight = new Map<string, Promise<FilterValuesResult>>();

  constructor(private analysesService: AnalysesService) {}

  private key(filterId: string, search: string, page: number): string {
    return `${filterId}|${search}|${page}`;
  }

  /** Drop the entire cache. Call when the user hits Refresh Data, or
   *  when navigating away from the analysis route. */
  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  /** Drop cached entries for one filter only. Used after edit/save so
   *  the next dropdown open re-fetches with the latest config. */
  clearFilter(filterId: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(`${filterId}|`)) this.store.delete(key);
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key.startsWith(`${filterId}|`)) this.inFlight.delete(key);
    }
  }

  /**
   * Get options for one filter. Serves from the cache when possible;
   * otherwise fires a batched request (with this single filter in
   * the batch) so the cache and batched endpoints share the same
   * fetch path.
   *
   * `coalesceWith` lets callers prefetch a group of filters in one
   * request: pass the other filterIds you'd like to fetch alongside,
   * and the cache will batch them together when none of them are
   * already in cache.
   */
  async get(
    analysisId: string,
    filterId: string,
    options: {
      search?: string;
      page?: number;
      pageSize?: number;
      coalesceWith?: string[];
    } = {},
  ): Promise<FilterValuesResult> {
    const search = options.search ?? '';
    const page = options.page ?? 1;
    const k = this.key(filterId, search, page);

    // Cache hit (and fresh)?
    const cached = this.store.get(k);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return cached.result;
    }
    // Already a request in flight for this exact key?
    const pending = this.inFlight.get(k);
    if (pending) return pending;

    // Build the batch — include this filter plus any coalesce-with
    // filters that aren't already cached for the same search/page.
    const ids = new Set<string>([filterId]);
    for (const id of options.coalesceWith ?? []) {
      const kk = this.key(id, search, page);
      const c = this.store.get(kk);
      if (!c || Date.now() - c.ts >= TTL_MS) ids.add(id);
    }

    const requests = Array.from(ids).map(id => ({
      filterId: id,
      search: search || undefined,
      page,
      pageSize: options.pageSize,
    }));

    const fetchPromise = (async () => {
      try {
        const res: any = await this.analysesService.getFilterValuesBatch({
          analysisId,
          requests,
        });
        const results: Record<string, FilterValuesResult> =
          res?.data?.results || {};
        const now = Date.now();
        for (const [id, result] of Object.entries(results)) {
          this.store.set(this.key(id, search, page), { result, ts: now });
        }
        // Default to a structured error when the BE didn't include
        // this filter in the response (shouldn't happen, but cheap
        // defensive).
        return (
          results[filterId] ??
          ({
            ok: false,
            error: 'sql_error',
            message: 'No result returned for filter',
          } as FilterValuesResult)
        );
      } catch (err: any) {
        const message =
          err?.error?.message || err?.message || 'Network error';
        const result: FilterValuesResult = {
          ok: false,
          error: 'sql_error',
          message,
        };
        // Don't cache network errors — caller will retry on next open.
        return result;
      } finally {
        for (const id of ids) this.inFlight.delete(this.key(id, search, page));
      }
    })();

    // Share the same in-flight promise for every requested id so two
    // simultaneous callers don't re-issue.
    for (const id of ids) this.inFlight.set(this.key(id, search, page), fetchPromise);

    return fetchPromise;
  }

  /**
   * Eager prefetch — used on analysis-open to populate all visible
   * dropdown filters in a single network round trip without forcing
   * the caller to await each one. Returns a Promise that resolves
   * when every requested filter is in the cache.
   */
  async prefetch(
    analysisId: string,
    filterIds: string[],
    pageSize?: number,
  ): Promise<void> {
    if (!filterIds.length) return;
    // Fire one consolidated request via get() with coalesceWith so
    // the cache + in-flight machinery handle deduplication.
    await this.get(analysisId, filterIds[0], {
      pageSize,
      coalesceWith: filterIds.slice(1),
    });
  }
}
