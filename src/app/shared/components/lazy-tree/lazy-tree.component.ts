import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  TemplateRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ChipComponent } from '../chip/chip.component';
import { SearchInputComponent } from '../search-input/search-input.component';

/**
 * A single node in the lazy tree. Callers return these from `loadNodes`. The
 * component owns all expand/lazy-load/paging state internally — callers only
 * describe each node's identity, label, child-count and whether it can expand.
 */
export interface LazyTreeNode {
  /** Stable id, unique among siblings — used as the parent key for children. */
  id: string;
  /** Human label rendered on the row. */
  label: string;
  /** 0-based depth; the component sets this, callers may ignore it. */
  level?: number;
  /** Optional count badge on the right (children count, priv count, …). */
  count?: number | null;
  /** Whether this node can be expanded (drives the chevron + lazy load). */
  hasChildren?: boolean;
  /** True → this is a leaf whose body is rendered via `leafTemplate`. */
  isLeaf?: boolean;
  /** Arbitrary payload passed back to templates + loadNodes + (selected). */
  data?: any;
}

/** Context passed to `loadNodes` for each fetch — everything server-lazy. */
export interface LazyTreeLoadContext {
  /** Depth being loaded: 0 = roots, 1 = children of a root, … */
  level: number;
  /** The parent node whose children are requested (undefined for roots). */
  parent?: LazyTreeNode;
  page: number;
  limit: number;
  /** Current search term (already trimmed), or '' . */
  search: string;
  /** Free-form params the host injects (provenance, includeSystem, …). */
  params?: Record<string, unknown>;
}

/** Per-level display config (icon + optional aria label). */
export interface LazyTreeLevelConfig {
  /** PrimeIcons class for the node icon, e.g. 'pi-folder'. */
  icon?: string;
  /** Render the label in monospace (schema/table/identifier names). */
  mono?: boolean;
}

interface InternalNode extends LazyTreeNode {
  level: number;
  expanded: boolean;
  loading: boolean;
  loaded: boolean;
  children: InternalNode[];
  page: number;
  total: number;
}

/**
 * app-lazy-tree — a data-agnostic, server-lazy, scrollable tree.
 *
 * The component knows NOTHING about the domain: the host supplies a
 * `loadNodes(ctx)` function that returns `{ nodes, total }` for a given level +
 * parent + page + search, plus optional templates for node badges and leaf
 * bodies, and a projected toolbar (`[lazyTreeToolbar]`) for domain controls
 * (a provenance segmented control, a "show system" toggle, …).
 *
 * Everything is lazy: roots load on init (and on `reload()`), a node's children
 * load on first expand, each level pages via "load more". The root list scrolls
 * within `maxHeight` so the tree never grows the page. Search re-queries the
 * server at the current level.
 *
 * Standalone so any feature module can `imports: [LazyTreeComponent]`.
 */
@Component({
  selector: 'app-lazy-tree',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ChipComponent,
    SearchInputComponent,
  ],
  templateUrl: './lazy-tree.component.html',
  styleUrls: ['./lazy-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LazyTreeComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** REQUIRED: fetch nodes for a level/parent/page/search. Server-lazy. */
  @Input({ required: true }) loadNodes!: (
    ctx: LazyTreeLoadContext,
  ) => Promise<{ nodes: LazyTreeNode[]; total: number }>;

  /** Host params forwarded verbatim into every loadNodes ctx (provenance…). */
  @Input() params: Record<string, unknown> = {};

  /** Per-depth icon/mono config; index = level. */
  @Input() levels: LazyTreeLevelConfig[] = [];

  // Inner-scroll height. Left EMPTY by default so the shared SCSS owns the
  // responsive default (clamp on .lt-scroll). Pass a number/px string to
  // OVERRIDE it, or 'none' to disable the inner scroll (an ancestor becomes
  // the single scroll container). Ignored when `fill` is true.
  @Input() maxHeight: string | number = '';

  // Fill mode: the scroll region FLEXES to fill whatever height its
  // (flex-column, bounded) parent gives it — the tree body takes exactly the
  // remaining space on every screen size, so there's no vh guesswork, no empty
  // gap on tall screens, and no card scroll on short ones. The host must place
  // the tree in a bounded flex-column ancestor. Preferred over `maxHeight` for
  // full-page usage (e.g. the role detail page).
  @Input() fill = false;

  /** Show the built-in search box. */
  @Input() searchable = true;
  @Input() searchPlaceholder = '';
  @Input() searchDebounce = 300;

  /** Page size per level. */
  @Input() pageSize = 100;

  /** i18n key (or literal) for the empty state. */
  @Input() emptyText = 'COMMON.NO_DATA';
  /** i18n key (or literal) for the loading state. */
  @Input() loadingText = 'COMMON.LOADING';
  /** i18n key (or literal) for "load more". */
  @Input() loadMoreText = 'COMMON.LOAD_MORE';

  /** Emitted when a leaf/row is activated (click on a non-expandable node). */
  @Output() nodeSelected = new EventEmitter<LazyTreeNode>();
  /** Emitted whenever a node is expanded (after its children load). */
  @Output() nodeExpanded = new EventEmitter<LazyTreeNode>();

  /** Badge shown on the right of a node row (host-defined). */
  @ContentChild('nodeBadge', { read: TemplateRef })
  nodeBadgeTpl?: TemplateRef<{ $implicit: LazyTreeNode }>;
  /** Body rendered under an expanded leaf node (host-defined). */
  @ContentChild('leaf', { read: TemplateRef })
  leafTpl?: TemplateRef<{ $implicit: LazyTreeNode }>;
  /**
   * Optional host-provided search control (e.g. the shared app-search-input).
   * When present it REPLACES the built-in text input — the host wires its
   * (searchChange) to `applySearch($event)`. The template receives
   * `{ $implicit: applySearch }` so it can bind the handler.
   */
  @ContentChild('search', { read: TemplateRef })
  searchTpl?: TemplateRef<{ $implicit: (term: string) => void }>;

  roots: InternalNode[] = [];
  loading = false;
  loaded = false;
  search = '';
  private searchTimer: any = null;

  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Re-read from scratch when the host swaps params (e.g. picks a new role)
    // or the loader itself changes, but not on the very first change.
    if (
      (changes['params'] && !changes['params'].firstChange) ||
      (changes['loadNodes'] && !changes['loadNodes'].firstChange)
    ) {
      this.reload();
    }
  }

  /** Host class so the component box itself flexes in fill mode. */
  @HostBinding('class.lt-fill') get isFill(): boolean {
    return this.fill;
  }

  /** No inner scroll when 'none'/0 → an ancestor (page card) scrolls instead.
   *  Fill mode always scrolls (it flexes to its parent, then overflows). */
  get scrollDisabled(): boolean {
    if (this.fill) return false;
    return (
      this.maxHeight === 'none' || this.maxHeight === 0 || this.maxHeight === '0'
    );
  }

  /**
   * Inline max-height OVERRIDE, or null to let the SCSS default apply. In fill
   * mode there is NO max-height (the flex parent bounds it). Empty input → null
   * (SCSS clamp default); a number/px/any-length string → that value.
   */
  get maxHeightCss(): string | null {
    if (this.fill || this.scrollDisabled || this.maxHeight === '' || this.maxHeight == null)
      return null;
    return typeof this.maxHeight === 'number'
      ? `${this.maxHeight}px`
      : this.maxHeight;
  }

  /** Bound to the projected search control's (searchChange). Already debounced
   *  by app-search-input, so re-query immediately. */
  applySearch = (term: string): void => {
    this.search = (term ?? '').trim();
    this.loadRoots();
  };

  /** Public: reload roots from scratch (host calls after external changes). */
  reload(): void {
    this.roots = [];
    this.loaded = false;
    this.loadRoots();
  }

  onSearchInput(value: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search = (value ?? '').trim();
      this.loadRoots();
    }, this.searchDebounce);
  }

  clearSearch(): void {
    this.search = '';
    this.loadRoots();
  }

  private async loadRoots(): Promise<void> {
    if (!this.loadNodes) return;
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const res = await this.loadNodes({
        level: 0,
        page: 1,
        limit: this.pageSize,
        search: this.search,
        params: this.params,
      });
      this.roots = (res?.nodes ?? []).map(n => this.toInternal(n, 0));
    } catch {
      this.roots = [];
    } finally {
      this.loading = false;
      this.loaded = true;
      this.cdr.markForCheck();
    }
  }

  private toInternal(n: LazyTreeNode, level: number): InternalNode {
    return {
      ...n,
      level,
      count: n.count ?? null,
      hasChildren: !!n.hasChildren,
      isLeaf: !!n.isLeaf,
      expanded: false,
      loading: false,
      loaded: false,
      children: [],
      page: 1,
      total: 0,
    };
  }

  toggle(node: InternalNode): void {
    // A node with no children and not a leaf → pure selection (e.g. a picker).
    if (!node.hasChildren && !node.isLeaf) {
      this.nodeSelected.emit(node);
      return;
    }
    node.expanded = !node.expanded;
    // Both branches AND expandable leaves lazy-load on first expand. A leaf's
    // "children" are its leaf payload (e.g. privilege chips) exposed to the
    // host `leafTpl` via node.data / node.children.
    if (node.expanded && !node.loaded && !node.loading) {
      this.loadChildren(node);
    }
    if (!node.isLeaf) this.nodeSelected.emit(node);
    this.cdr.markForCheck();
  }

  private async loadChildren(node: InternalNode): Promise<void> {
    node.loading = true;
    this.cdr.markForCheck();
    try {
      const res = await this.loadNodes({
        level: node.level + 1,
        parent: node,
        page: node.page,
        limit: this.pageSize,
        // Carry the active search into BRANCH children so drilling into a
        // matched schema stays filtered to matching tables. Leaves (privilege
        // chips) load unfiltered — the user wants all privs of a matched table.
        search: node.isLeaf ? '' : this.search,
        params: this.params,
      });
      if (node.isLeaf) {
        // Leaf: stash the payload for the host template; no child rows.
        node.data = { ...(node.data ?? {}), leaf: res?.nodes?.[0]?.data ?? res };
      } else {
        const kids = (res?.nodes ?? []).map(n =>
          this.toInternal(n, node.level + 1),
        );
        node.children = node.page === 1 ? kids : [...node.children, ...kids];
        node.total = res?.total ?? node.children.length;
      }
    } catch {
      /* leave as-is */
    } finally {
      node.loading = false;
      node.loaded = true;
      this.nodeExpanded.emit(node);
      this.cdr.markForCheck();
    }
  }

  loadMore(node: InternalNode): void {
    node.page += 1;
    this.loadChildren(node);
  }

  hasMore(node: InternalNode): boolean {
    return node.loaded && node.children.length < node.total;
  }

  levelIcon(level: number): string {
    return this.levels[level]?.icon ?? 'pi-angle-right';
  }

  levelMono(level: number): boolean {
    return !!this.levels[level]?.mono;
  }

  trackById = (_: number, n: InternalNode): string => `${n.level}:${n.id}`;
}
