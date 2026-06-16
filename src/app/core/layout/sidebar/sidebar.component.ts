import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostBinding,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { SIDEBAR_ITEMS_ROUTES } from './sidebar.constant';

interface MenuItem {
  label: string;
  value: string;
  status: boolean;
  icon: string;
  isExpanded?: boolean;
  subPermissions?: MenuItem[];
  route?: string;
}

/**
 * BE PermissionNode shape from buildSessionBootstrap.
 * Modules have no `level`; only leaf permissions do. We only render
 * a node as a clickable nav item when level >= 1 (or when the node
 * has children that themselves passed the filter).
 */
interface PermissionNode {
  id?: string;
  value: string;
  name?: string;
  icon?: string | null;
  sequence?: number;
  scope?: string;
  level?: number;
  children?: PermissionNode[];
  /** Legacy nested shape — older snapshots, still tolerated. */
  subPermissions?: PermissionNode[];
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit {
  /**
   * The sidebar is open when EITHER the user has pinned it open (clicked
   * the toggle) OR the mouse is currently peeking. The template still
   * reads `isExpanded` everywhere; we recompute it whenever either input
   * changes so all the existing bindings keep working unchanged.
   */
  isExpanded = false;
  /**
   * User-controlled pin state (click toggle to flip). Bound to the host
   * via .pinned-open class so the host width can change in lockstep —
   * pinned means we PUSH content; peek floats OVER content.
   */
  @HostBinding('class.pinned-open') isPinnedOpen = false;
  /** Hover-driven temporary expansion. */
  isHoverPeeking = false;
  /** True while floating over content (peeking, not pinned). Drives the
   *  overlay layout in CSS. */
  isPeekOverlay = false;
  @HostBinding('class.is-mobile') isMobile = false;
  menuItems: MenuItem[] = [];

  /** Small enter/leave delays so a mouse twitch across the rail doesn't
   *  open and close the sidebar repeatedly. */
  private static readonly PEEK_ENTER_DELAY = 120;
  private static readonly PEEK_LEAVE_DELAY = 200;
  private peekEnterTimer: ReturnType<typeof setTimeout> | null = null;
  private peekLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * localStorage key holding the set of expanded parent `value`s so the
   * user's open branches survive page refreshes — the small-but-important
   * detail Linear/Notion/Vercel sidebars all do.
   */
  private static readonly EXPANDED_STORAGE_KEY = 'sidebar.expanded';

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private globalService: GlobalService,
    public router: Router,
    private translate: TranslateService,
  ) {
    // Source the menu from the nested PERMISSION_TREE written by
    // Phase 2 of login (buildSessionBootstrap). Falls back to the
    // JWT-embedded flat list if the tree storage key is empty —
    // that only happens transiently during the relay; the tree is
    // populated before the user lands on a real page.
    const tree = this.readPermissionTree();
    this.menuItems = this.processMenuItems(tree);
    // Restore the user's previously-expanded branches from localStorage
    // so a page refresh doesn't reset their open tree.
    this.restoreExpandedState();
  }

  ngOnInit() {
    this.checkScreenSize();

    // Re-run change detection when language changes (required for OnPush + translate pipe)
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
    const resizeHandler = () => this.checkScreenSize();
    window.addEventListener('resize', resizeHandler);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', resizeHandler);
      this.clearPeekTimers();
    });
  }

  /**
   * Mouse enters the sidebar. If the user hasn't pinned it open, schedule
   * a temporary expansion after PEEK_ENTER_DELAY so brief mouse-overs
   * don't snap the rail open.
   */
  onSidebarMouseEnter(): void {
    if (this.isPinnedOpen || this.isMobile) return;
    this.cancelPeekLeave();
    if (this.peekEnterTimer) return; // already scheduled
    this.peekEnterTimer = setTimeout(() => {
      this.peekEnterTimer = null;
      this.isHoverPeeking = true;
      this.isPeekOverlay = true;
      this.expandMenuForCurrentRoute();
      this.recomputeExpanded();
    }, SidebarComponent.PEEK_ENTER_DELAY);
  }

  /**
   * Mouse leaves the sidebar. Schedule the collapse after a slightly
   * longer delay so users moving toward submenu items have time to
   * cross the gap without the peek snapping closed.
   */
  onSidebarMouseLeave(): void {
    if (this.isPinnedOpen || this.isMobile) return;
    this.cancelPeekEnter();
    if (!this.isHoverPeeking) return;
    if (this.peekLeaveTimer) return;
    this.peekLeaveTimer = setTimeout(() => {
      this.peekLeaveTimer = null;
      this.isHoverPeeking = false;
      this.isPeekOverlay = false;
      this.collapseAllMenus();
      this.recomputeExpanded();
    }, SidebarComponent.PEEK_LEAVE_DELAY);
  }

  private cancelPeekEnter(): void {
    if (this.peekEnterTimer) {
      clearTimeout(this.peekEnterTimer);
      this.peekEnterTimer = null;
    }
  }

  private cancelPeekLeave(): void {
    if (this.peekLeaveTimer) {
      clearTimeout(this.peekLeaveTimer);
      this.peekLeaveTimer = null;
    }
  }

  private clearPeekTimers(): void {
    this.cancelPeekEnter();
    this.cancelPeekLeave();
  }

  private recomputeExpanded(): void {
    this.isExpanded = this.isPinnedOpen || this.isHoverPeeking;
    this.cdr.markForCheck();
  }

  /**
   * Read the nested permission tree from storage. Empty array on
   * missing / malformed JSON. The PermissionService caches its own
   * parse for runtime checks; we re-parse here independently because
   * the sidebar only builds its menu once at construction time and
   * doesn't need to share a cache.
   */
  private readPermissionTree(): PermissionNode[] {
    const raw = StorageService.get(StorageType.PERMISSION_TREE);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PermissionNode[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Walk the BE PermissionNode tree and shape it into the MenuItem
   * tree the template renders. A node is included when:
   *   - it carries `level >= 1` (a granted leaf), OR
   *   - it has at least one descendant that does
   *
   * Modules with no granted children are dropped entirely so the
   * sidebar never shows an empty section header.
   */
  processMenuItems(items: PermissionNode[], depth: number = 0): MenuItem[] {
    if (!Array.isArray(items)) return [];

    const result: MenuItem[] = [];
    for (const node of items) {
      const children = node.children ?? node.subPermissions ?? [];
      const processedChildren = this.processMenuItems(children, depth + 1);
      const hasGrant = typeof node.level === 'number' && node.level >= 1;

      // Drop nodes that are neither granted leaves nor parents of one.
      if (!hasGrant && processedChildren.length === 0) continue;

      result.push({
        label: node.name ?? node.value,
        value: node.value,
        status: true,
        icon: node.icon ?? '',
        isExpanded: false,
        subPermissions:
          processedChildren.length > 0 ? processedChildren : undefined,
        route: this.appendRouteToMenu(node),
      });
    }
    return result;
  }

  appendRouteToMenu(node: PermissionNode | MenuItem): string {
    const route = SIDEBAR_ITEMS_ROUTES.find(
      ir => ir.value === node.value,
    )?.route;
    return route || '';
  }

  // Expand only the parent chain of the current route; collapse everything else
  private expandMenuForCurrentRoute() {
    this.collapseAllMenus();

    const currentUrl = this.router.url;

    // Helper function to expand parent items
    const expandParents = (items: MenuItem[]): boolean => {
      for (const item of items) {
        // Check if current route matches this item's route
        if (item.route && currentUrl.includes(item.route)) {
          item.isExpanded = true;
          return true;
        }

        // Check children if they exist
        if (item.subPermissions && expandParents(item.subPermissions)) {
          item.isExpanded = true;
          return true;
        }
      }
      return false;
    };

    expandParents(this.menuItems);
  }

  /**
   * Click the toggle handle: flip the pinned-open state. Pinned wins over
   * hover-peek (clicking to pin always takes priority; clicking to unpin
   * also cancels any in-progress peek timer).
   */
  toggleSidebar() {
    this.clearPeekTimers();
    this.isHoverPeeking = false;
    this.isPeekOverlay = false;
    this.isPinnedOpen = !this.isPinnedOpen;
    if (this.isPinnedOpen) {
      this.expandMenuForCurrentRoute();
    } else {
      this.collapseAllMenus();
    }
    this.recomputeExpanded();
  }

  toggleSidebarAndCollapseAll() {
    this.toggleSidebar();
  }

  collapseAllMenus() {
    this.menuItems.forEach(item => {
      item.isExpanded = false;
      if (item.subPermissions) {
        item.subPermissions.forEach(subItem => {
          subItem.isExpanded = false;
          if (subItem.subPermissions) {
            subItem.subPermissions.forEach(nestedItem => {
              nestedItem.isExpanded = false;
            });
          }
        });
      }
    });
  }

  /**
   * Click toggle. Linear/Notion/Vercel-style: click-only interaction, no
   * hover-expand, no accordion auto-collapse — every branch the user
   * opens stays open until they click it again. Multiple branches can
   * be open simultaneously, which is the modern minimal-sidebar pattern.
   *
   * Closing a parent still cascades to its descendants so re-opening
   * the parent shows it in a clean state.
   */
  toggleSubmenuAndExpand(item: MenuItem) {
    if (!this.isExpanded) {
      // Coming from collapsed → click on a parent icon pins the rail
      // open (deliberate choice). Branch opens on the next tick once
      // the width transition has started.
      this.clearPeekTimers();
      this.isPinnedOpen = true;
      this.recomputeExpanded();
      setTimeout(() => {
        item.isExpanded = true;
        this.persistExpandedState();
        this.cdr.markForCheck();
      }, 100);
      return;
    }
    const opening = !item.isExpanded;
    item.isExpanded = opening;
    if (!opening) this.collapseDescendants(item);
    this.persistExpandedState();
    this.cdr.markForCheck();
  }

  /**
   * Persist the set of currently-expanded parent `value`s to
   * localStorage so the open state survives a page refresh. Matches
   * what every modern SaaS sidebar does — Linear, Notion, Vercel,
   * Supabase, GitHub all remember which branches you opened.
   */
  private persistExpandedState(): void {
    try {
      const open: string[] = [];
      const collect = (items: MenuItem[]) => {
        for (const i of items) {
          if (i.isExpanded && i.value) open.push(i.value);
          if (i.subPermissions?.length) collect(i.subPermissions);
        }
      };
      collect(this.menuItems);
      localStorage.setItem(
        SidebarComponent.EXPANDED_STORAGE_KEY,
        JSON.stringify(open),
      );
    } catch {
      // localStorage can be unavailable (private mode, quota, etc.).
      // Persistence is a nicety, not a correctness requirement.
    }
  }

  /**
   * Restore the expanded set saved by `persistExpandedState`. Walks
   * the freshly-built menu tree and flips `isExpanded` on any parent
   * whose `value` is in the stored set. Falls back to noop when the
   * key isn't present (first-ever visit) or localStorage is blocked.
   */
  private restoreExpandedState(): void {
    try {
      const raw = localStorage.getItem(SidebarComponent.EXPANDED_STORAGE_KEY);
      if (!raw) return;
      const set = new Set<string>(JSON.parse(raw) as string[]);
      const apply = (items: MenuItem[]) => {
        for (const i of items) {
          if (i.value && set.has(i.value)) i.isExpanded = true;
          if (i.subPermissions?.length) apply(i.subPermissions);
        }
      };
      apply(this.menuItems);
    } catch {
      // Stored payload was malformed or storage was blocked — ignore.
    }
  }

  private collapseDescendants(item: MenuItem) {
    if (!item.subPermissions) return;
    for (const child of item.subPermissions) {
      child.isExpanded = false;
      this.collapseDescendants(child);
    }
  }

  isRouteActive(route: string | undefined): boolean {
    if (!route) return false;
    return this.router.url.includes(route);
  }

  /**
   * True when any descendant route under this item matches the current URL.
   * Used to reflect "you are here" on the parent's collapsed-mode icon pill
   * when the submenu itself isn't visible.
   */
  hasActiveDescendant(item: MenuItem): boolean {
    if (!item.subPermissions?.length) return false;
    for (const child of item.subPermissions) {
      if (this.isRouteActive(child.route)) return true;
      if (this.hasActiveDescendant(child)) return true;
    }
    return false;
  }

  getIndentation(level: number): string {
    const baseIndentation = 16;
    return `${level * baseIndentation}px`;
  }

  private checkScreenSize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;

    // If transitioning to mobile/small screen
    if (!wasMobile && this.isMobile) {
      // First collapse all menu items
      this.menuItems.forEach(item => {
        if (item.isExpanded) {
          item.isExpanded = false;
          // Also collapse any sub-items
          if (item.subPermissions) {
            item.subPermissions.forEach(subItem => {
              if (subItem.isExpanded) {
                subItem.isExpanded = false;
                // Handle nested items if any
                if (subItem.subPermissions) {
                  subItem.subPermissions.forEach(nestedItem => {
                    nestedItem.isExpanded = false;
                  });
                }
              }
            });
          }
        }
      });

      // Then collapse the sidebar (force off in mobile — hover peek is
      // disabled at this breakpoint).
      this.isPinnedOpen = false;
      this.isHoverPeeking = false;
      this.isPeekOverlay = false;
      this.clearPeekTimers();
    }

    this.recomputeExpanded();
  }

  trackByIndex(index: number): number {
    return index;
  }

  collapseAllAndToggle() {
    this.toggleSidebar();
  }
}
