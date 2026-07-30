/**
 * run-query-builder — the business-user screen.
 *
 * Hydrates the form schema, drives the normalized tree store, and wires the
 * compile pipeline: a debounced preview (server-generated SQL), row count,
 * execute, and inline validation keyed by node id. Undo/redo come from the store.
 *
 * The SQL is always server-generated; the browser never builds SQL. All controls
 * are the shared app-custom-* kit.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
} from 'rxjs';
import { GlobalService } from 'src/app/core/services/global.service';
import { QueryBuilderStore } from '../../services/query-builder-store';
import { QbRuntimeService } from '../../services/qb-runtime.service';

@Component({
  selector: 'app-run-query-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-query-builder.component.html',
  styleUrls: ['./run-query-builder.component.scss'],
  providers: [QueryBuilderStore],
})
export class RunQueryBuilderComponent implements OnInit, OnDestroy {
  readonly store = inject(QueryBuilderStore);
  private readonly runtime = inject(QbRuntimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly global = inject(GlobalService);

  private readonly destroy$ = new Subject<void>();

  readonly loading = signal(true);
  readonly sql = signal('');
  readonly warnings = signal<string[]>([]);
  readonly totalCount = signal<number | null>(null);
  readonly counting = signal(false);
  readonly executing = signal(false);
  readonly result = signal<{
    columns: string[];
    rows: any[];
    rowCount: number;
    truncated: boolean;
    durationMs: number;
  } | null>(null);

  readonly schema = computed(() => this.store.schema());
  readonly canEdit = computed(() => this.schema()?.queryBuilder.canEdit ?? false);
  readonly hasErrors = computed(() => this.store.serverErrors().length > 0);

  constructor() {
    // Recompile the SQL preview whenever the definition changes (debounced).
    const def$ = toObservable(
      computed(() => JSON.stringify(this.store.definition())),
    );
    def$
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap(async () => {
          const def = this.store.definition();
          if (!def.queryBuilderId) return null;
          try {
            const res = await this.runtime.preview(def);
            return res?.data ?? null;
          } catch {
            return null;
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(data => {
        if (data) {
          this.sql.set(data.sql ?? '');
          this.warnings.set(data.warnings ?? []);
        }
        // Reset the stale count when the definition changes.
        this.totalCount.set(null);
      });
  }

  async ngOnInit(): Promise<void> {
    const id =
      this.route.snapshot.paramMap.get('id') ||
      this.route.snapshot.paramMap.get('queryBuilderId');
    if (!id) {
      this.loading.set(false);
      return;
    }
    try {
      const res = await this.runtime.getSchema(id);
      const schema = res?.data;
      if (schema) this.store.hydrate(schema);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load the form');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  undo(): void {
    this.store.undo();
  }
  redo(): void {
    this.store.redo();
  }

  async validateNow(): Promise<void> {
    const res = await this.runtime.validate(this.store.definition());
    this.store.serverErrors.set(res?.data?.errors ?? []);
  }

  async runCount(): Promise<void> {
    this.counting.set(true);
    try {
      const res = await this.runtime.count(this.store.definition());
      if (res?.status) this.totalCount.set(res.data?.total ?? 0);
      else this.applyErrors(res);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Count failed');
    } finally {
      this.counting.set(false);
    }
  }

  async runExecute(): Promise<void> {
    this.executing.set(true);
    this.store.serverErrors.set([]);
    try {
      const res = await this.runtime.execute(this.store.definition());
      if (res?.status) {
        this.result.set(res.data);
      } else {
        this.applyErrors(res);
      }
    } catch (e: any) {
      this.applyErrors(e?.error);
      this.global.showWarn(e?.error?.message || 'Execution failed');
    } finally {
      this.executing.set(false);
    }
  }

  private applyErrors(res: any): void {
    const errors = res?.data?.errors;
    if (Array.isArray(errors)) this.store.serverErrors.set(errors);
  }

  get resultColumns(): string[] {
    return this.result()?.columns ?? [];
  }
}
