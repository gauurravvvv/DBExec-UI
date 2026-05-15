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
import { GlobalService } from 'src/app/core/services/global.service';
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

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private globalService: GlobalService,
    public router: Router,
    private translate: TranslateService,
  ) {
    const permissions = this.globalService.getTokenDetails('permission');
    this.menuItems = this.processMenuItems(permissions);
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

  processMenuItems(items: MenuItem[], level: number = 0): MenuItem[] {
    if (!items) return [];

    return items
      .filter(item => item.status)
      .map(item => ({
        ...item,
        isExpanded: false,
        subPermissions: item.subPermissions
          ? this.processMenuItems(item.subPermissions, level + 1)
          : undefined,
        route: this.appendRouteToMenu(item),
      }));
  }

  appendRouteToMenu(item: MenuItem): string {
    const route = SIDEBAR_ITEMS_ROUTES.find(
      ir => ir.value === item.value,
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

  toggleSubmenuAndExpand(item: MenuItem) {
    if (!this.isExpanded) {
      // Coming from collapsed → click on a parent icon should pin the
      // sidebar open (the user made a deliberate choice) and then open
      // this branch on the next tick once the width transition kicks in.
      this.clearPeekTimers();
      this.isPinnedOpen = true;
      this.recomputeExpanded();
      setTimeout(() => {
        item.isExpanded = true;
        this.cdr.markForCheck();
      }, 100);
    } else {
      const opening = !item.isExpanded;
      item.isExpanded = opening;
      // Closing a parent must also close everything under it, otherwise
      // descendants keep their isExpanded=true state and pop back open the
      // next time the parent is re-opened.
      if (!opening) this.collapseDescendants(item);
      this.cdr.markForCheck();
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
