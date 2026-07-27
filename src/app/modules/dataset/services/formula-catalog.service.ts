/**
 * FormulaCatalogService — the formula function catalog, fetched from the API.
 *
 * This is why the frontend holds NO formula knowledge. The palette, Monaco's
 * IntelliSense completions and the hover documentation all render from this
 * payload, so a function added to the backend registry appears in the editor
 * with no UI change and the two can never drift.
 *
 * It replaces the 962-line `constants/functions-reference.ts` that used to
 * duplicate the backend's function list by hand.
 *
 * The catalog describes the engine, not any customer's data, so it is static and
 * organisation-independent: fetched once per app session and shared.
 */
import { Injectable, computed, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { DATASET } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/** Where a function runs, which decides what the author can do with the field. */
export type FormulaStage = 'ROW' | 'AGG' | 'WINDOW';

export interface FormulaFunction {
  name: string;
  category: string;
  usage: string;
  description: string;
  stage: FormulaStage;
  minArgs: number;
  maxArgs: number | null;
  argTypes: string[];
  returnType: string;
}

export interface FormulaCategory {
  id: string;
  name: string;
  functions: FormulaFunction[];
}

export interface FormulaLimits {
  formulaMaxLength: number;
  maxDepth: number;
  maxArgs: number;
}

@Injectable({ providedIn: 'root' })
export class FormulaCatalogService {
  private _categories = signal<FormulaCategory[]>([]);
  private _limits = signal<FormulaLimits | null>(null);
  private _dateUnits = signal<string[]>([]);
  private _loading = signal(false);
  private _loaded = false;
  /**
   * The in-flight request, shared.
   *
   * Without this, a second caller arriving while the first was still loading got
   * `of(this._categories())` — an empty array at that moment — and set its
   * palette to nothing. Two dialogs opening together was enough to trigger it.
   */
  private _inFlight: Observable<FormulaCategory[]> | null = null;

  readonly categories = this._categories.asReadonly();
  readonly limits = this._limits.asReadonly();
  readonly dateUnits = this._dateUnits.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Flat list, for completion providers and name lookups. */
  readonly functions = computed<FormulaFunction[]>(() =>
    this._categories().flatMap(c => c.functions),
  );

  /** Function names, used to warn when a field name would shadow a function. */
  readonly functionNames = computed<string[]>(() =>
    this.functions().map(f => f.name),
  );

  constructor(private http: HttpClientService) {}

  /**
   * Fetch once per session. Safe to call from every component's ngOnInit —
   * subsequent calls are no-ops.
   */
  load(): Observable<FormulaCategory[]> {
    if (this._loaded) return of(this._categories());
    if (this._inFlight) return this._inFlight;

    this._loading.set(true);
    this._inFlight = this.http
      .apiGet(DATASET.FORMULA_CATALOG, { skipLoader: true })
      .pipe(
        tap({
          next: (res: any) => {
            const data = res?.data ?? res;
            this._categories.set(data?.categories ?? []);
            this._limits.set(data?.limits ?? null);
            this._dateUnits.set(data?.dateUnits ?? []);
            this._loaded = true;
            this._loading.set(false);
          },
          error: () => {
            this._loading.set(false);
            // Allow a retry on the next open rather than caching the failure.
            this._inFlight = null;
          },
        }),
        // Late subscribers get the same response instead of firing a second
        // request or, worse, an empty snapshot.
        shareReplay({ bufferSize: 1, refCount: false }),
      ) as unknown as Observable<FormulaCategory[]>;

    return this._inFlight;
  }

  find(name: string): FormulaFunction | undefined {
    return this.functions().find(f => f.name === name);
  }

  isFunctionName(name: string): boolean {
    if (!name) return false;
    const trimmed = name.trim();
    return this.functions().some(f => f.name === trimmed);
  }
}
