import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
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
  isExpanded = false;
  isMobile = false;
  menuItems: MenuItem[] = [];

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
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('resize', resizeHandler),
    );
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

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.expandMenuForCurrentRoute();
    } else {
      this.collapseAllMenus();
    }
    this.cdr.markForCheck();
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
      // Coming from collapsed → open the rail first, then expand this branch
      // on the next tick so the width transition kicks in cleanly. OnPush
      // change-detection means we must explicitly mark for check after the
      // setTimeout, otherwise the flag flips but the view doesn't refresh.
      this.isExpanded = true;
      this.cdr.markForCheck();
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

      // Then collapse the sidebar
      this.isExpanded = false;
    }

    this.cdr.markForCheck();
  }

  trackByIndex(index: number): number {
    return index;
  }

  collapseAllAndToggle() {
    this.toggleSidebar();
  }
}
