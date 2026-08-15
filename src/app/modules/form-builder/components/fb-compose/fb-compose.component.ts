/**
 * fb-compose — the business-user screen: a PUBLISHED form running as a Query
 * Builder.
 *
 * Hydrates the frozen published version, then builds an AND/OR condition tree via
 * the reused qb-* components (the per-condition operator dropdown offers the
 * field's resolved operators[] = dataType-applicable ∩ placement allowedOperators).
 * A debounced preview shows server-generated SQL; count then execute return rows.
 * Rules (Phase 5) + field RBAC (Phase 6) apply live through FormRuntimeStore and
 * are re-enforced by the server on execute. The browser never builds SQL.
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
import { QueryBuilderStore } from 'src/app/modules/query-builder/services/query-builder-store';
import { FormRuntimeStore } from '../../services/form-runtime-store';
import { FbRuntimeService } from '../../services/fb-runtime.service';

@Component({
  selector: 'app-fb-compose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fb-compose.component.html',
  styleUrls: ['./fb-compose.component.scss'],
  // The reused qb-* runtime components inject QueryBuilderStore; alias it to this
  // component's FormRuntimeStore instance so they drive the SAME tree.
  providers: [
    FormRuntimeStore,
    { provide: QueryBuilderStore, useExisting: FormRuntimeStore },
  ],
})
export class FbComposeComponent implements OnInit, OnDestroy {
  readonly store = inject(FormRuntimeStore);
  private readonly runtime = inject(FbRuntimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly global = inject(GlobalService);

  private readonly destroy$ = new Subject<void>();
  private formId = '';

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

  readonly schema = computed(() => this.store.formSchema());

  constructor() {
    // Keep the fieldKey-keyed rule/RBAC values map in sync with the tree, so
    // live rules (Phase 5) + RBAC recompute as the user fills the composer.
    // syncRuleValues writes the store's `values` signal, so allowSignalWrites.
    effect(
      () => {
        // Read the definition so this effect re-runs on every tree mutation.
        this.store.definition();
        this.store.syncRuleValues();
      },
      { allowSignalWrites: true },
    );

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
            const res = await this.runtime.preview(this.formId, def);
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
        // A definition change invalidates any prior count.
        this.totalCount.set(null);
      });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.formId = id;
    // ?preview=1 lets a designer run an unpublished draft (WRITE-guarded server-side).
    const preview = this.route.snapshot.queryParamMap.get('preview') === '1';
    try {
      const res = await this.runtime.getSchema(
        id,
        preview ? { preview: true } : undefined,
      );
      if (res?.data) this.store.hydrateForm(res.data);
      else this.global.showWarn(res?.message || 'Failed to load the form');
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

  async runCount(): Promise<void> {
    this.counting.set(true);
    try {
      const res = await this.runtime.count(this.formId, this.store.definition());
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
      // Send the tree + the fieldKey-keyed values so the server re-runs the
      // Phase-5 rule enforcement (required-but-empty → 422) before compile.
      const def = { ...this.store.definition(), values: this.store.values() };
      const res = await this.runtime.execute(this.formId, def);
      if (res?.status) this.result.set(res.data);
      else this.applyErrors(res);
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
