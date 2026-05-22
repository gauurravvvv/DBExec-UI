import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  forwardRef,
  inject,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

/**
 * Server-driven fetcher contract for the multi-select. Identical to the
 * single-select dropdown's fetcher — returns one page of items + total.
 */
export type MultiselectFetcher = (args: {
  search: string;
  page: number;
  limit: number;
}) => Promise<{ items: any[]; total: number }>;

@Component({
  selector: 'app-custom-multiselect',
  templateUrl: './custom-multiselect.component.html',
  styleUrls: ['./custom-multiselect.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomMultiselectComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomMultiselectComponent
  implements ControlValueAccessor, OnChanges, OnInit
{
  @Input() label = '';
  @Input() placeholder = '';
  /**
   * Optional leading icon class (e.g. "pi-users"). Renders as an
   * absolutely-positioned <i> at the trigger's left edge — mirrors the
   * pattern used by app-custom-input and app-custom-dropdown.
   */
  @Input() icon = '';
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue: string | null = '';
  @Input() required = false;
  @Input() filter = true;
  @Input() filterBy = '';
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
  @Input() display: 'chip' | 'comma' = 'chip';
  @Input() showToggleAll = true;
  @Input() showHeader = true;
  @Input() maxSelectedLabels: number = 3;
  @Input() selectedItemsLabel = '{0} items selected';
  @Input() selectionLimit!: number;
  @Input() scrollHeight = '200px';
  // Empty / loading / filter-placeholder strings. Empty-string default
  // is a sentinel for "use the translation"; explicit consumer values
  // win. Resolved fields below are what the template binds.
  @Input() emptyMessage = '';
  @Input() emptyFilterMessage = '';
  @Input() filterPlaceholder = '';
  @Input() virtualScroll = false;
  @Input() virtualScrollItemSize = 38;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo: any = null;

  // ── Server-driven mode ──────────────────────────────────────────────────
  // Same contract as app-custom-dropdown's serverMode. The crucial difference
  // is that VALUE here is an array of IDs, and we must keep an array of cached
  // selected items so that ALL chips render (not just the one currently in
  // serverOptions). A filter that wipes the option list still leaves selected
  // chips visible at the top of the panel.
  @Input() serverMode = false;
  @Input() fetcher: MultiselectFetcher | null = null;
  @Input() pageSize = 10;
  @Input() searchDebounceMs = 300;
  @Input() preloadedItems: any[] | null = null;
  @Input() preloadedTotal: number | null = null;
  @Input() resolveSelected: ((value: any) => Promise<any | null>) | null = null;

  value: any[] = [];
  disabled = false;
  inputId = `multiselect-${Math.random().toString(36).substring(2, 11)}`;

  serverOptions: any[] = [];
  serverLoading = false;
  private serverTotal = 0;
  private serverPage = 0;
  private serverSearch = '';
  private searchDebounceHandle: any = null;

  // Map of value → cached item. Survives filter operations so chips stay
  // labelled even when the current page doesn't include them.
  private selectedItems = new Map<any, any>();

  // Translated strings bound by the template — kept in sync with the
  // active locale via TranslateService.onLangChange.
  resolvedEmptyMessage = '';
  resolvedEmptyFilterMessage = '';
  resolvedLoadingMessage = '';
  resolvedFilterPlaceholder = '';

  private destroyRef = inject(DestroyRef);

  constructor(
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.resolveTranslations();
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.resolveTranslations();
        this.cdr.markForCheck();
      });
  }

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

  private onChange: (value: any[]) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['serverMode'] && this.serverMode) {
      this.resetServerState();
    }

    if (
      this.serverMode &&
      (changes['preloadedItems'] || changes['preloadedTotal']) &&
      this.preloadedItems &&
      this.preloadedItems.length > 0 &&
      this.serverPage === 0
    ) {
      this.serverOptions = [...this.preloadedItems];
      this.serverTotal = this.preloadedTotal ?? this.preloadedItems.length;
      this.serverPage = 1;
      this.cacheSelectedItemsFromOptions();
      this.ensureSelectedInOptions();
    }
  }

  writeValue(value: any[]): void {
    this.value = value || [];
    if (this.serverMode) {
      this.cacheSelectedItemsFromOptions();
      this.ensureSelectedInOptions();
      this.resolveMissingSelections();
    }
  }

  registerOnChange(fn: (value: any[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: any[]): void {
    this.value = value;
    if (this.serverMode) {
      // Recache: capture any newly selected items while they're still in
      // serverOptions; drop deselected entries from the cache.
      this.cacheSelectedItemsFromOptions();
      this.pruneSelectedItemsCache();
    }
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }

  // ── Server-mode handlers ───────────────────────────────────────────────

  onPanelShow(): void {
    if (!this.serverMode || !this.fetcher) return;
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
    this.selectedItems.clear();
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
      const res = await this.fetcher({ search, page, limit: this.pageSize });
      const incoming = res?.items ?? [];
      this.serverTotal = res?.total ?? incoming.length;
      this.serverPage = page;
      this.serverOptions = append
        ? [...this.serverOptions, ...incoming]
        : incoming;
      this.cacheSelectedItemsFromOptions();
      this.ensureSelectedInOptions();
    } catch {
      // Swallow — same reasoning as app-custom-dropdown.
    } finally {
      this.serverLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * For each currently-selected value, if the matching item is present in
   * serverOptions and not yet cached, cache it. We only ADD to the cache here;
   * never remove (that's pruneSelectedItemsCache's job).
   */
  private cacheSelectedItemsFromOptions(): void {
    if (!this.value || this.value.length === 0) return;
    for (const v of this.value) {
      if (this.selectedItems.has(v)) continue;
      const match = this.serverOptions.find(opt => this.matchesValue(opt, v));
      if (match) this.selectedItems.set(v, match);
    }
  }

  /**
   * Drop cache entries whose values are no longer selected. Keeps the cache
   * from growing unboundedly as the user selects/deselects in a long session.
   */
  private pruneSelectedItemsCache(): void {
    if (this.value === null || this.value === undefined) {
      this.selectedItems.clear();
      return;
    }
    const valueSet = new Set(this.value);
    for (const cachedKey of Array.from(this.selectedItems.keys())) {
      if (!valueSet.has(cachedKey)) this.selectedItems.delete(cachedKey);
    }
  }

  /**
   * Make sure every cached selected item appears in serverOptions so PrimeNG
   * can render its chip. Items appended to the front if missing.
   */
  private ensureSelectedInOptions(): void {
    if (this.selectedItems.size === 0) return;
    const missing: any[] = [];
    for (const item of this.selectedItems.values()) {
      const present = this.serverOptions.some(opt =>
        this.matchesValue(
          opt,
          this.optionValue ? item[this.optionValue] : item,
        ),
      );
      if (!present) missing.push(item);
    }
    if (missing.length > 0) {
      this.serverOptions = [...missing, ...this.serverOptions];
    }
  }

  /**
   * For edit screens: when writeValue arrives with IDs we don't have cached
   * (and that aren't in the preload either), call the parent's resolveSelected
   * once per missing value to fetch the item.
   */
  private async resolveMissingSelections(): Promise<void> {
    if (!this.resolveSelected) return;
    if (!this.value || this.value.length === 0) return;
    const missing = this.value.filter(v => !this.selectedItems.has(v));
    if (missing.length === 0) return;

    const results = await Promise.all(
      missing.map(async v => {
        try {
          const item = await this.resolveSelected!(v);
          return { v, item };
        } catch {
          return { v, item: null };
        }
      }),
    );

    let added = false;
    for (const { v, item } of results) {
      if (item) {
        this.selectedItems.set(v, item);
        added = true;
      }
    }
    if (added) {
      this.ensureSelectedInOptions();
      this.cdr.markForCheck();
    }
  }

  private matchesValue(option: any, value: any): boolean {
    if (option === null || option === undefined) return false;
    if (this.optionValue) {
      return option[this.optionValue] === value;
    }
    return option === value;
  }
}
