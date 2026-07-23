import {
  Observable,
  Subject,
  Subscription,
  firstValueFrom,
  from,
  isObservable,
} from 'rxjs';
import { signal } from '@angular/core';
import { DEFAULT_PAGE_SIZE } from 'src/app/core/constants/global.constant';

/**
 * UsServerListAdapter — bridge between AG Grid Community (which only
 * ships the Client-Side Row Model in the Community license) and the
 * BE-paginated `/list` contract every existing listing in the app
 * already implements.
 *
 * The adapter holds the current `{page, limit, sort, filter}` state,
 * fires the BE call on every state change, and exposes the resulting
 * page of rows as a signal that `<us-data-grid>` binds to. The grid
 * renders ONE BE page at a time (Client-Side row model with a single
 * page worth of rows) and a host-owned `<us-paginator>` below it
 * drives `page` / `limit` changes.
 *
 * AG Grid's own sort / floating-filter events are translated by
 * `<us-data-grid>` into `setSort()` / `patchFilter()` calls on this
 * adapter, which trigger a reload.
 *
 * Why an adapter class and not a service? Each listing has its own
 * filter shape, sort field map, and response unwrap logic. A class
 * lets the consumer configure those at construction time without
 * leaking module-specific knowledge into the shared grid component.
 */
export interface UsListLoadParams {
  page: number;
  limit: number;
  /** JSON-stringified array of `{field, order}` objects — the same
   *  shape the BE `list*` controllers parse today via the existing
   *  ListSortHelper.serialize() output. */
  sort?: string;
  /** JSON-stringified filter payload — the same shape current
   *  listings produce via `JSON.stringify(filterValues)`. */
  filter?: string;
}

export interface UsListResponse<TRow> {
  rows: TRow[];
  total: number;
}

export interface UsServerListAdapterConfig<TRow> {
  /** Required: fires the BE call. Return whatever your service
   *  returns — Observable or Promise — and `unwrap` peels it into
   *  `{rows, total}`. Most listings in the app use async/await over
   *  `lastValueFrom`, so Promise support is essential. */
  load: (params: UsListLoadParams) => Observable<unknown> | Promise<unknown>;

  /** Optional: peel the service response into `{rows, total}`.
   *  Default unwrap handles the canonical
   *  `{ data: { count, <plural>: [] } }` shape — override for
   *  bare-array endpoints (query-builders, tabs, sections, prompts,
   *  rls-rules) or any other non-standard shape. */
  unwrap?: (res: unknown) => UsListResponse<TRow>;

  /** Optional: AG Grid colId → BE sort-field map. Identity by
   *  default. Use when the UI colId differs from the BE field
   *  (e.g. UI `lastLoginAt` → BE `lastLogin`). */
  sortFieldMap?: Record<string, string>;

  /** Optional: AG Grid filter colId → BE filter slice builder. Each
   *  function takes the current filter cell value and returns the
   *  partial filter payload it owns. The adapter merges the slices
   *  into one filter object before JSON.stringify.
   *
   *  Default builder is the identity map `{[colId]: cellValue}`. */
  filterBuilders?: Record<
    string,
    (cellValue: unknown) => Record<string, unknown>
  >;

  /** Optional starting state. */
  initial?: {
    page?: number;
    limit?: number;
    sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
    filterModel?: Record<string, unknown>;
  };
}

/** Default unwrap — covers the canonical `{count, <plural>: []}` shape.
 *  Plural keys are searched in this priority: explicit `rows`, then
 *  `items`, then the first non-`count` non-`status` array-valued key
 *  in `data`. Falls back to an empty list + 0 count if nothing
 *  matches (the adapter never throws — it surfaces an empty page
 *  instead). */
function defaultUnwrap<TRow>(res: unknown): UsListResponse<TRow> {
  const r = res as { data?: Record<string, unknown> } | undefined;
  const data = r?.data ?? {};
  const total =
    typeof data['count'] === 'number'
      ? (data['count'] as number)
      : typeof data['total'] === 'number'
        ? (data['total'] as number)
        : 0;
  const explicit =
    (data['rows'] as TRow[] | undefined) ??
    (data['items'] as TRow[] | undefined);
  if (explicit && Array.isArray(explicit)) return { rows: explicit, total };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'count' || k === 'total' || k === 'status') continue;
    if (Array.isArray(v)) return { rows: v as TRow[], total };
  }
  // If `data` is itself the array (bare-array endpoints with no
  // `count` wrapper), use it directly and synthesise total from
  // length. Wave B modules rely on this branch.
  if (Array.isArray(r?.data)) {
    const arr = r!.data as unknown as TRow[];
    return { rows: arr, total: arr.length };
  }
  return { rows: [], total: 0 };
}

export class UsServerListAdapter<TRow = unknown> {
  /* ── reactive state surfaced to <us-data-grid> ─────────── */

  readonly rows = signal<TRow[]>([]);
  readonly total = signal<number>(0);
  readonly loading = signal<boolean>(false);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(DEFAULT_PAGE_SIZE);
  readonly sortModel = signal<Array<{ colId: string; sort: 'asc' | 'desc' }>>(
    [],
  );
  readonly filterModel = signal<Record<string, unknown>>({});

  /** Emits an opaque token when the host should re-render. Most
   *  consumers won't subscribe — the rows signal already drives the
   *  grid — but useful for hooking external behaviours. */
  readonly loaded$ = new Subject<UsListResponse<TRow>>();

  private inflight: Subscription | null = null;
  private readonly cfg: UsServerListAdapterConfig<TRow>;

  constructor(config: UsServerListAdapterConfig<TRow>) {
    this.cfg = config;
    if (config.initial?.page) this.page.set(config.initial.page);
    if (config.initial?.limit) this.limit.set(config.initial.limit);
    if (config.initial?.sortModel) this.sortModel.set(config.initial.sortModel);
    if (config.initial?.filterModel)
      this.filterModel.set(config.initial.filterModel);
  }

  /* ── state setters — each one triggers a reload ───────── */

  setPage(page: number): void {
    if (page === this.page()) return;
    this.page.set(Math.max(1, page));
    this.reload();
  }

  setLimit(limit: number): void {
    if (limit === this.limit()) return;
    this.limit.set(Math.max(1, limit));
    // Resetting to page 1 mirrors the existing PrimeNG paginator
    // behaviour — a page-size change while viewing page 5 would
    // otherwise leave the user on an out-of-range page until the
    // next reload completes.
    this.page.set(1);
    this.reload();
  }

  setSort(sortModel: Array<{ colId: string; sort: 'asc' | 'desc' }>): void {
    this.sortModel.set(sortModel);
    // Sorting from page N is fine — the BE applies the new sort to
    // the full table, then we ask for page N of the new order. The
    // user's mental model is "I'm still on page N", so we DON'T
    // reset to page 1 here (this matches the existing behaviour).
    this.reload();
  }

  /** Replace the entire filter model. Called by <us-data-grid> when
   *  AG Grid's `filterChanged` fires. */
  setFilter(filterModel: Record<string, unknown>): void {
    this.filterModel.set(filterModel);
    // Filter changes always go back to page 1 — staying on page 7
    // when you've just filtered down to 12 rows is a footgun.
    this.page.set(1);
    this.reload();
  }

  /** Merge a partial filter slice into the current model. Useful
   *  for host-driven filters that live OUTSIDE the grid (e.g. a
   *  page-header date-range picker). */
  patchFilter(slice: Record<string, unknown>): void {
    this.filterModel.set({ ...this.filterModel(), ...slice });
    this.page.set(1);
    this.reload();
  }

  /* ── BE roundtrip ─────────────────────────────────────── */

  reload(): void {
    // Cancel any in-flight call so race conditions (user spam-clicks
    // sort while the previous request is still pending) don't ever
    // surface an older page after a newer one.
    if (this.inflight) {
      this.inflight.unsubscribe();
      this.inflight = null;
    }

    this.loading.set(true);
    const params = this.buildParams();
    const unwrap = this.cfg.unwrap ?? defaultUnwrap<TRow>;
    // Normalise Promise → Observable so both paths flow through the
    // same subscribe-with-cancellation pipe. `from(promise)`
    // produces a cold Observable that emits once + completes, which
    // is exactly what we want.
    const result = this.cfg.load(params);
    const obs$: Observable<unknown> = isObservable(result)
      ? result
      : from(result as Promise<unknown>);
    this.inflight = obs$.subscribe({
      next: res => {
        const out = unwrap(res);
        this.rows.set(out.rows);
        this.total.set(out.total);
        this.loaded$.next(out);
        this.loading.set(false);
      },
      error: () => {
        // Don't clobber rows on error — the user keeps seeing the
        // previous page rather than an empty grid. The HTTP
        // interceptor surfaces the actual error message via the
        // existing notification toast.
        this.loading.set(false);
      },
    });
  }

  private buildParams(): UsListLoadParams {
    const sortModel = this.sortModel();
    const filterModel = this.filterModel();

    const sortPayload = sortModel.map(s => ({
      field: this.cfg.sortFieldMap?.[s.colId] ?? s.colId,
      order: s.sort,
    }));

    const filterPayload: Record<string, unknown> = {};
    for (const [colId, cell] of Object.entries(filterModel)) {
      if (cell === null || cell === undefined || cell === '') continue;
      const builder = this.cfg.filterBuilders?.[colId];
      if (builder) {
        // The builder owns its slice of the payload — could span
        // multiple BE fields (e.g. a date range maps to
        // `lastLoginFrom` + `lastLoginTo`).
        Object.assign(filterPayload, builder(cell));
      } else if (
        typeof cell === 'object' &&
        cell &&
        'filter' in (cell as object)
      ) {
        // AG Grid cell-filter shape: {filter, type, filterType}.
        // Default behaviour — just lift the `filter` value under
        // the colId. Modules with richer needs supply a builder.
        filterPayload[colId] = (cell as { filter: unknown }).filter;
      } else {
        filterPayload[colId] = cell;
      }
    }

    return {
      page: this.page(),
      limit: this.limit(),
      sort: sortPayload.length ? JSON.stringify(sortPayload) : undefined,
      filter: Object.keys(filterPayload).length
        ? JSON.stringify(filterPayload)
        : undefined,
    };
  }

  /**
   * One-shot fetch that does NOT touch the grid's page / sort / filter
   * state or its `rows`/`total` signals. Runs the configured `load` +
   * `unwrap` for an arbitrary params payload and resolves to
   * `{ rows, total }`. The Finder explorer uses this for its flat
   * "Favourites / Recents / by tag" views, reusing each module's own
   * list endpoint + unwrap logic instead of duplicating them.
   */
  async loadOnce(params: UsListLoadParams): Promise<UsListResponse<TRow>> {
    const unwrap = this.cfg.unwrap ?? defaultUnwrap<TRow>;
    const result = this.cfg.load(params);
    const obs$: Observable<unknown> = isObservable(result)
      ? result
      : from(result as Promise<unknown>);
    const res = await firstValueFrom(obs$);
    return unwrap(res);
  }

  /** Tear-down hook — call from the host component's ngOnDestroy
   *  so an in-flight load doesn't try to write to a destroyed
   *  component's signals. */
  destroy(): void {
    if (this.inflight) {
      this.inflight.unsubscribe();
      this.inflight = null;
    }
    this.loaded$.complete();
  }
}
