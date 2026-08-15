/**
 * qb-value-control — renders the right input for a condition's value(s), chosen
 * by prompt type x operator arity (spec 6.6.3).
 *
 * arity 'none' renders no input. arity 'two' renders two controls. Otherwise a
 * single control appropriate to the prompt type. Every control is a shared
 * app-custom-* component, so the composer inherits the app's styling and a11y.
 *
 * Value sourcing (spec 6.6):
 *  - static prompts render their curated options inline.
 *  - lookup prompts (server typeahead above the cardinality threshold) use the
 *    dropdown/multiselect serverMode + a fetcher backed by /values/search.
 *  - many-arity conditions get a "Paste values" dialog backed by /values/resolve
 *    so a user can bulk-enter thousands of values with matched/unmatched report.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  QbRuntimeService,
  QbSchemaPrompt,
  QbValueOption,
} from '../../services/qb-runtime.service';

@Component({
  selector: 'qb-value-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-value-control.component.html',
  styleUrls: ['./qb-value-control.component.scss'],
})
export class QbValueControlComponent {
  @Input({ required: true }) prompt!: QbSchemaPrompt;
  /** Operator arity — drives which control (and how many) to render. */
  @Input({ required: true }) arity!: 'none' | 'one' | 'two' | 'many';
  @Input() values: any[] = [];
  @Input() invalid = false;
  /** Parent selections for cascading lookups: { parentPromptId: [values] }. */
  @Input() dependsOnValues: Record<string, string[]> = {};

  @Output() valuesChange = new EventEmitter<any[]>();

  private readonly runtime = inject(QbRuntimeService);
  private readonly global = inject(GlobalService);

  // Bulk-paste dialog state
  readonly pasteOpen = signal(false);
  readonly pasteText = signal('');
  readonly pasteResolving = signal(false);
  readonly pasteMatched = signal<QbValueOption[]>([]);
  readonly pasteUnmatched = signal<string[]>([]);

  /** Options list for static select-style controls, sorted per appearance. */
  get options(): { label: string; value: string }[] {
    const vs = this.prompt.valueSource;
    if (vs.kind === 'static') {
      const opts = vs.values.map(o => ({ label: o.display, value: o.value }));
      // Form placements carry no appearance blob (appearance:{}), so default-safe.
      const sort = (this.prompt.appearance ?? {}).sortValues;
      if (sort === 'asc') opts.sort((a, b) => a.label.localeCompare(b.label));
      if (sort === 'desc') opts.sort((a, b) => b.label.localeCompare(a.label));
      return opts;
    }
    return [];
  }

  /** Whether this prompt offers a curated (inline) option list. */
  get hasOptions(): boolean {
    return this.prompt.valueSource.kind === 'static';
  }

  /** Whether this prompt sources options from the server (typeahead). */
  get isLookup(): boolean {
    return this.prompt.valueSource.kind === 'lookup';
  }

  /** Whether a bulk-paste affordance applies (many-arity + a curated/lookup set). */
  get canBulkPaste(): boolean {
    return (
      this.arity === 'many' &&
      (this.hasOptions || this.isLookup)
    );
  }

  /**
   * Server-mode fetcher for app-custom-dropdown / -multiselect (lookup prompts).
   * Bound as an arrow so `this` stays the component.
   */
  fetcher = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    try {
      const res = await this.runtime.searchValues(this.prompt.promptId, {
        search,
        page,
        pageSize: limit,
        dependsOn: this.dependsOnValues,
      });
      if (res?.status) {
        const opts = (res.data?.options ?? []) as QbValueOption[];
        return {
          items: opts.map(o => ({ label: o.display, value: o.value })),
          total: res.data?.total ?? opts.length,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** The single-value control kind for arity one, from the prompt type. */
  get singleControl():
    | 'dropdown'
    | 'multiselect'
    | 'text'
    | 'number'
    | 'date'
    | 'calendar'
    | 'checkbox'
    | 'radio'
    | 'rangeslider' {
    return (this.prompt.type as any) ?? 'text';
  }

  get first(): any {
    return this.values?.[0] ?? null;
  }
  get second(): any {
    return this.values?.[1] ?? null;
  }

  emitSingle(v: any): void {
    this.valuesChange.emit(v == null || v === '' ? [] : [v]);
  }

  emitMany(v: any[]): void {
    this.valuesChange.emit(Array.isArray(v) ? v : []);
  }

  emitFirst(v: any): void {
    this.valuesChange.emit([v, this.second]);
  }
  emitSecond(v: any): void {
    this.valuesChange.emit([this.first, v]);
  }

  get appearance(): any {
    return this.prompt.appearance ?? {};
  }

  // ── Bulk paste (spec 6.6.4) ────────────────────────────────────────────

  openPaste(): void {
    this.pasteText.set('');
    this.pasteMatched.set([]);
    this.pasteUnmatched.set([]);
    this.pasteOpen.set(true);
  }

  closePaste(): void {
    this.pasteOpen.set(false);
  }

  async resolvePaste(): Promise<void> {
    const raw = this.pasteText().trim();
    if (!raw) return;
    this.pasteResolving.set(true);
    try {
      const res = await this.runtime.resolveValues(this.prompt.promptId, raw);
      if (res?.status) {
        this.pasteMatched.set(res.data?.matched ?? []);
        this.pasteUnmatched.set(res.data?.unmatched ?? []);
      } else {
        this.global.showWarn(res?.message || 'Could not resolve values');
      }
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Could not resolve values');
    } finally {
      this.pasteResolving.set(false);
    }
  }

  /** Add the matched values (merged with existing) and close the dialog. */
  applyPaste(): void {
    const matchedValues = this.pasteMatched().map(m => m.value);
    const merged = Array.from(new Set([...(this.values ?? []), ...matchedValues]));
    this.valuesChange.emit(merged);
    this.pasteOpen.set(false);
  }
}
