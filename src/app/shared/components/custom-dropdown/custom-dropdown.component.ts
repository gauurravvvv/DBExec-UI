import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ContentChild,
  DestroyRef,
  EventEmitter,
  forwardRef,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  TemplateRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

/**
 * Server-driven fetcher contract. Each call returns one page of items and the
 * total row count so the dropdown knows when to stop loading more.
 *
 * The component invokes this on three events: panel open (initial page),
 * filter-text change (debounced; replaces options with page 1), and near-end
 * scroll (appends the next page).
 */
export type DropdownFetcher = (args: {
  search: string;
  page: number;
  limit: number;
}) => Promise<{ items: any[]; total: number }>;

@Component({
  selector: 'app-custom-dropdown',
  templateUrl: './custom-dropdown.component.html',
  styleUrls: ['./custom-dropdown.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomDropdownComponent),
      multi: true,
    },
  ],
  // Default change detection (was OnPush). OnPush prevented the wrapper
  // from observing the bound ngModel value when it landed mid-stream
  // (after the inner <p-dropdown> initialised), so dropdowns rendering
  // a pre-populated value showed blank until the user interacted with
  // something else. With Default CD the wrapper re-checks on every
  // tick the parent triggers, so the inner [ngModel]="value" picks up
  // the bound value immediately. The wrapper has no heavy work in its
  // template, so Default CD has negligible cost here.
})
export class CustomDropdownComponent
  implements ControlValueAccessor, OnChanges, AfterViewInit, OnInit
{
  private destroyRef = inject(DestroyRef);

  @Input() label = '';
  @Input() placeholder = '';
  /**
   * Optional leading icon class (e.g. "pi-building"). Renders as a
   * <i class="pi pi-X"> absolutely positioned at the left edge of the
   * dropdown trigger, mirroring app-custom-input's icon prop. Ignored
   * when a custom selectedItem/trigger template is supplied — those
   * templates render their own glyph and shouldn't compete with this.
   */
  @Input() icon = '';
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue: string | null = '';
  @Input() required = false;
  @Input() filter = true;
  @Input() filterBy = '';
  @Input() filterPlaceholder = '';
  /**
   * Template-driven disabled control. The CVA path
   * (`setDisabledState`) still works for reactive forms; this `@Input`
   * lets template-only callers gate the dropdown via `[disabled]=…`
   * without wiring a FormControl. The setter routes through the
   * same internal field both surfaces read from.
   */
  @Input() set disabled(value: boolean) {
    this._disabled = !!value;
  }
  get disabled(): boolean {
    return this._disabled;
  }
  @Input() filterMatchMode:
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'equals'
    | 'notEquals'
    | 'in'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte' = 'contains';
  @Input() resetFilterOnHide = false;
  @Input() showClear = false;
  @Input() editable = false;
  @Input() autoDisplayFirst = true;
  @Input() scrollHeight = '200px';
  // Empty / loading / filter-placeholder strings.
  //
  // Empty-string default is a sentinel meaning "use the translation".
  // The component resolves them in ngOnInit from i18n keys and
  // re-resolves whenever the user changes locale (subscribed via
  // TranslateService.onLangChange). Consumers can still override per
  // call site if they want a custom string — the explicit value wins.
  @Input() emptyMessage = '';
  @Input() emptyFilterMessage = '';
  // Internal resolved strings — bound into the template instead of the
  // raw inputs so PrimeNG sees the translated value.
  resolvedEmptyMessage = '';
  resolvedEmptyFilterMessage = '';
  resolvedLoadingMessage = '';
  resolvedFilterPlaceholder = '';
  @Input() virtualScroll = false;
  @Input() virtualScrollItemSize = 38;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo: any = null;
  @Input() style: { [key: string]: string } = {};
  @Input() panelStyle: { [key: string]: string } | null = null;
  // CSS class applied to the dropdown panel — useful when the panel
  // appends to body (so it escapes view-encapsulation) and the host
  // page needs to target items in it. Consumers pass e.g.
  // panelStyleClass="locale-dropdown-panel" and define styles in a
  // global SCSS scope or via ::ng-deep.
  @Input() panelStyleClass = '';
  @Input() styleClass = '';

  // ── Server-driven mode ──────────────────────────────────────────────────
  // When serverMode=true, the dropdown ignores [options] and instead calls
  // [fetcher] to paginate from the BE. The parent passes a fetcher closure
  // (typically wrapping a service.list({page, limit, filter}) call). Keeps
  // the dropdown's API surface identical for static-data callers — they just
  // don't set serverMode.
  @Input() serverMode = false;
  @Input() fetcher: DropdownFetcher | null = null;
  @Input() pageSize = 10;
  @Input() searchDebounceMs = 300;

  /**
   * Optional pre-loaded items + total. When the parent has already fetched
   * page 1 (typically to discover the selected entity's label before the panel
   * is opened), it passes the result here. The dropdown seeds its server state
   * from this, so:
   *   - the selected value renders its label immediately, before any open
   *   - opening the panel does NOT re-fetch page 1 (no duplicate request)
   *   - scroll-to-load and filter still work normally from page 2 onward
   */
  @Input() preloadedItems: any[] | null = null;
  @Input() preloadedTotal: number | null = null;

  /**
   * Optional async resolver for edit screens. When the dropdown has a value
   * (e.g. roleId stored on an existing record) but no matching item in either
   * preloadedItems or the cache, this fetches just that one item so the label
   * can render. Single network call, called once per writeValue+missing combo.
   *
   * Typical implementation: `(id) => roleService.getRole(id).then(r => r.data)`.
   */
  @Input() resolveSelected: ((value: any) => Promise<any>) | null = null;

  /**
   * Optional caller-supplied template for rendering each option AND the
   * trigger's selected-item slot. Receives the full option object as
   * `$implicit`, so consumers can show icons, multi-line content, etc.
   *
   * Two usage modes:
   *
   *   1. Single template — same content for trigger and panel rows:
   *      <app-custom-dropdown ...>
   *        <ng-template let-opt>
   *          <i [class]="opt.iconClass"></i>{{ opt.label }}
   *        </ng-template>
   *      </app-custom-dropdown>
   *
   *   2. Two templates — different trigger vs row (use template refs):
   *      <app-custom-dropdown ...>
   *        <ng-template #selectedItemTemplate let-opt>
   *          {{ opt.shortCode }}
   *        </ng-template>
   *        <ng-template #itemTemplate let-opt>
   *          <i [class]="opt.flagClass"></i>{{ opt.label }}
   *        </ng-template>
   *      </app-custom-dropdown>
   *
   * Resolution order for each slot:
   *   selectedItem slot  →  selectedItemTemplate ?? itemTemplate ?? default
   *   panel item slot    →  itemTemplate ?? default
   *
   * The unnamed `@ContentChild(TemplateRef)` fallback below picks up the
   * single-template call sites that pre-date the named refs.
   */
  @ContentChild('itemTemplate')
  namedItemTemplate: TemplateRef<any> | null = null;

  @ContentChild('selectedItemTemplate')
  selectedItemTemplate: TemplateRef<any> | null = null;

  @ContentChild(TemplateRef)
  private firstUnnamedTemplate: TemplateRef<any> | null = null;

  /** Resolved template for panel rows. */
  get itemTemplate(): TemplateRef<any> | null {
    return this.namedItemTemplate ?? this.firstUnnamedTemplate;
  }

  /** Resolved template for the trigger's selected-item slot. */
  get triggerTemplate(): TemplateRef<any> | null {
    return this.selectedItemTemplate ?? this.itemTemplate;
  }

  @Output() onChangeEvent = new EventEmitter<any>();

  value: any = null;
  /**
   * Backing field for both `@Input() disabled` and the
   * ControlValueAccessor.setDisabledState() path. Single source of
   * truth that the template's `[disabled]=disabled` reads from.
   */
  private _disabled = false;
  inputId = `dropdown-${Math.random().toString(36).substring(2, 11)}`;

  // Server-mode internal state
  serverOptions: any[] = [];
  serverLoading = false;
  private serverTotal = 0;
  private serverPage = 0;
  private serverSearch = '';
  private searchDebounceHandle: any = null;

  // Cached reference to the currently-selected item, kept independent of
  // serverOptions. Server-mode dropdowns replace serverOptions on every
  // filter (and a filter that returns nothing leaves the list empty). Without
  // this cache, PrimeNG would lose the label for an existing selection any
  // time the user types a non-matching filter and closes the panel.
  private selectedItem: any = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.resolveTranslations();
    // Re-resolve when the user switches locale at runtime so the
    // empty / loading / placeholder strings update without needing a
    // dropdown re-mount.
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.resolveTranslations();
        this.cdr.markForCheck();
      });
  }

  /**
   * Resolve translated strings for empty / loading / filter-placeholder
   * states. Consumer overrides (non-empty inputs) win; the sentinel
   * empty string falls back to the i18n key.
   */
  private resolveTranslations(): void {
    this.resolvedEmptyMessage =
      this.emptyMessage ||
      this.translate.instant('COMMON.NO_OPTIONS_AVAILABLE');
    this.resolvedEmptyFilterMessage =
      this.emptyFilterMessage ||
      this.translate.instant('COMMON.NO_RESULTS_FOUND');
    this.resolvedLoadingMessage = this.translate.instant('COMMON.LOADING');
    this.resolvedFilterPlaceholder =
      this.filterPlaceholder ||
      this.translate.instant('COMMON.SEARCH_PLACEHOLDER');
  }

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  /**
   * After the inner PrimeNG <p-dropdown> has mounted, nudge it to
   * re-resolve its selected option label. PrimeNG initialises with
   * options=[] (our @Input default) BEFORE the parent's actual
   * options array arrives via ngOnChanges; when options finally
   * appear, p-dropdown does NOT re-attempt to match the bound value
   * against the new options, so the trigger stays blank until the
   * user opens the panel. Forcing a value re-stamp here flushes
   * the inner binding.
   */
  ngAfterViewInit(): void {
    this.flushValueBinding();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When the static options array arrives (or changes), p-dropdown
    // does not auto-re-match the bound value against the new options.
    // Re-stamp the value so its display label refreshes.
    if (
      changes['options'] &&
      !changes['options'].firstChange &&
      this.value !== null &&
      this.value !== undefined &&
      this.value !== ''
    ) {
      this.flushValueBinding();
    }

    // If the parent toggles into serverMode after init, reset internal state.
    if (changes['serverMode'] && this.serverMode) {
      this.resetServerState();
    }

    // When preloaded items arrive (typically async after the parent's first
    // page fetch resolves), seed the server state so the selected label
    // renders without waiting for the user to open the panel.
    if (
      this.serverMode &&
      (changes['preloadedItems'] || changes['preloadedTotal']) &&
      this.preloadedItems &&
      this.preloadedItems.length > 0 &&
      // Only seed once — if the user has already paginated, don't clobber.
      this.serverPage === 0
    ) {
      this.serverOptions = [...this.preloadedItems];
      this.serverTotal = this.preloadedTotal ?? this.preloadedItems.length;
      this.serverPage = 1;
      // Resolve selectedItem now that we have options to look in.
      this.refreshSelectedItem();
      this.ensureSelectedInOptions();
    }
  }

  writeValue(value: any): void {
    const prev = this.value;
    this.value = value;
    if (this.serverMode) {
      this.refreshSelectedItem();
      this.ensureSelectedInOptions();
      // If we have a value but no matching item, try the parent's resolver.
      // Guarded so we only call once per (new value, missing match) pair.
      if (
        value !== null &&
        value !== undefined &&
        value !== '' &&
        value !== prev &&
        !this.selectedItem &&
        this.resolveSelected
      ) {
        this.resolveSelectedItem(value);
      }
    }
    // OnPush: writeValue runs outside Angular zone for the wrapper, so the
    // PrimeNG <p-dropdown> child never sees [(ngModel)] change unless we
    // mark this view for re-check. Without this, dropdowns that bind to a
    // pre-populated config value render blank on initial paint until the
    // user clicks elsewhere.
    this.cdr.markForCheck();
    // Belt-and-braces: re-push the value on the next microtask. Some
    // OnPush parent chains (visual-config-sidebar uses ngDoCheck JSON
    // snapshot diffing and doesn't propagate ref changes for nested
    // mutations) won't observe the immediate markForCheck, so the
    // inner <p-dropdown> initialises with value=undefined and renders
    // blank. Re-marking after the current tick gives the inner
    // dropdown a chance to pick up the bound model.
    Promise.resolve().then(() => this.cdr.markForCheck());
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabled = isDisabled;
  }

  onValueChange(value: any): void {
    this.value = value;
    if (this.serverMode) {
      // Cache the selected item from the currently-rendered options so it
      // survives a later filter that wipes serverOptions.
      this.refreshSelectedItem();
    }
    this.onChange(this.value);
    this.onChangeEvent.emit(value);
  }

  onBlur(): void {
    this.onTouched();
  }

  // ── Server-mode handlers ───────────────────────────────────────────────

  onPanelShow(): void {
    if (!this.serverMode || !this.fetcher) return;
    // Load only on first open or when prior load was cleared.
    if (this.serverOptions.length === 0) {
      this.fetchPage(1, this.serverSearch, false);
    }
  }

  onServerFilter(event: { originalEvent: Event; filter: string }): void {
    if (!this.serverMode || !this.fetcher) return;
    const term = (event?.filter ?? '').toString();
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => {
      this.serverSearch = term;
      this.fetchPage(1, term, false);
    }, this.searchDebounceMs);
  }

  /**
   * PrimeNG's p-dropdown emits (onScrollIndexChange) on virtual scroll OR
   * (onLazyLoad) on the cdk-scroller it wraps. We listen on (onScroll) which
   * fires plain scroll events with the scroll position. Trigger next page
   * when the user is within 5 items of the end of the loaded set and more
   * remain server-side.
   */
  onServerScroll(event: any): void {
    if (!this.serverMode || !this.fetcher) return;
    if (this.serverLoading) return;
    if (this.serverOptions.length >= this.serverTotal) return;

    const target = event?.target as HTMLElement | undefined;
    if (!target) return;
    const remaining =
      target.scrollHeight - (target.scrollTop + target.clientHeight);
    if (remaining < 80) {
      this.fetchPage(this.serverPage + 1, this.serverSearch, true);
    }
  }

  private resetServerState(): void {
    this.serverOptions = [];
    this.serverTotal = 0;
    this.serverPage = 0;
    this.serverSearch = '';
    this.serverLoading = false;
    this.selectedItem = null;
  }

  /**
   * Force the inner p-dropdown to re-resolve its display label. We
   * cache the current value, null it, run CD, then restore. The
   * round-trip triggers p-dropdown's internal selection lookup
   * against the current options array.
   *
   * Only useful for static-options dropdowns (server-mode uses
   * refreshSelectedItem instead). Guarded so it does not fire
   * during the initial mount when value is null/undefined/empty.
   */
  private flushValueBinding(): void {
    if (this.serverMode) return;
    if (this.value === null || this.value === undefined || this.value === '') {
      return;
    }
    // Defer past the current CD pass so the inner dropdown has
    // settled with the current options before we re-stamp.
    setTimeout(() => {
      const cached = this.value;
      this.value = null;
      this.cdr.detectChanges();
      this.value = cached;
      this.cdr.detectChanges();
    }, 0);
  }

  private async fetchPage(
    page: number,
    search: string,
    append: boolean,
  ): Promise<void> {
    if (!this.fetcher) return;
    this.serverLoading = true;
    this.cdr.markForCheck();
    try {
      const res = await this.fetcher({
        search,
        page,
        limit: this.pageSize,
      });
      const incoming = res?.items ?? [];
      this.serverTotal = res?.total ?? incoming.length;
      this.serverPage = page;
      this.serverOptions = append
        ? [...this.serverOptions, ...incoming]
        : incoming;
      // After any fetch (especially filter-replace), make sure the currently-
      // selected item is still present so its label renders. If a filter wipes
      // it from the list, we add it back invisibly to the option array.
      this.ensureSelectedInOptions();
    } catch (err) {
      // Swallow: the dropdown shouldn't crash the host page on a transient
      // server error. The empty list + "no results" template is the visible
      // fallback. Real diagnostics live in the network panel.
    } finally {
      this.serverLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Fetch a single item by value via the parent's resolveSelected callback.
   * Used by edit screens where a value is set (e.g. existing roleId) but
   * the matching item isn't in the panel's preload. Cached on success and
   * inserted into serverOptions so PrimeNG renders the label.
   */
  private async resolveSelectedItem(value: any): Promise<void> {
    if (!this.resolveSelected) return;
    try {
      const item = await this.resolveSelected(value);
      // Stale guard: only apply if the dropdown's value hasn't changed since.
      if (item && this.value === value) {
        this.selectedItem = item;
        this.ensureSelectedInOptions();
        this.cdr.markForCheck();
      }
    } catch {
      // Same swallow rationale as fetchPage — a failed resolver shouldn't
      // crash the host page. The dropdown will fall back to showing the raw
      // value or blank, but the rest of the form remains usable.
    }
  }

  /**
   * Re-resolve selectedItem from the current options. Called whenever the
   * value changes (writeValue / onValueChange) so we capture the item object
   * while it's still in serverOptions.
   */
  private refreshSelectedItem(): void {
    if (this.value === null || this.value === undefined) {
      this.selectedItem = null;
      return;
    }
    const match = this.serverOptions.find(opt =>
      this.matchesValue(opt, this.value),
    );
    // Only update the cache if we found a match — otherwise keep whatever we
    // had before (the value was likely set before options loaded, or the
    // current options are filtered).
    if (match) this.selectedItem = match;
  }

  /**
   * Ensure the cached selectedItem is present in serverOptions so PrimeNG can
   * resolve its label. If a filter result excluded it, prepend it back. The
   * user won't visually notice — the dropdown shows the label in the input,
   * and the panel shows the filtered results plus the selected item at the
   * top (which is the correct UX for "your current selection").
   */
  private ensureSelectedInOptions(): void {
    if (!this.selectedItem) return;
    const exists = this.serverOptions.some(opt =>
      this.matchesValue(opt, this.value),
    );
    if (!exists) {
      this.serverOptions = [this.selectedItem, ...this.serverOptions];
    }
  }

  /**
   * Compare an option object against the current ngModel value. When
   * optionValue is set (e.g. 'id'), we compare option[optionValue] === value.
   * When optionValue is null/empty, PrimeNG treats the whole option as the
   * value — we compare by reference.
   */
  private matchesValue(option: any, value: any): boolean {
    if (option === null || option === undefined) return false;
    if (this.optionValue) {
      return option[this.optionValue] === value;
    }
    return option === value;
  }
}
