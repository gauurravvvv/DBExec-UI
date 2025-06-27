import { Component, OnInit } from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { SIDEBAR_ITEMS_ROUTES } from './sidebar.constant';
import { Router } from '@angular/router';

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
})
export class SidebarComponent implements OnInit {
  isExpanded = true;
  isMobile = false;
  menuItems: MenuItem[] = [];

  constructor(private globalService: GlobalService, public router: Router) {
    const permissions = this.globalService.getTokenDetails('permission');
    this.menuItems = this.processMenuItems(permissions);
    // Set initial expanded state based on current route
    this.expandMenuForCurrentRoute();
  }

  ngOnInit() {
    this.checkScreenSize();
    window.addEventListener('resize', () => this.checkScreenSize());
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
      ir => ir.value === item.value
    )?.route;
    return route || '';
  }

  // Simplified method to expand menu based on current URL
  private expandMenuForCurrentRoute() {
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
    }
  }

  toggleSidebarAndCollapseAll() {
    this.isExpanded = !this.isExpanded;
    if (!this.isExpanded) {
      this.collapseAllMenus();
    } else {
      this.expandMenuForCurrentRoute();
    }
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
      this.isExpanded = true;
      setTimeout(() => {
        item.isExpanded = !item.isExpanded;
      }, 100);
    } else {
      item.isExpanded = !item.isExpanded;
    }
  }

  isRouteActive(route: string | undefined): boolean {
    if (!route) return false;
    return this.router.url.includes(route);
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
  }

  collapseAllAndToggle() {
    // First collapse all expanded items
    this.menuItems.forEach(item => {
      if (item.isExpanded) {
        item.isExpanded = false;
        // Also collapse any sub-items
        if (item.subPermissions) {
          item.subPermissions.forEach(subItem => {
            if (subItem.isExpanded) {
              subItem.isExpanded = false;
            }
          });
        }
      }
    });

    // Then toggle the sidebar
    this.toggleSidebar();
  }
}
