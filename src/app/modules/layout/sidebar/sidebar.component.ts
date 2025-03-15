import { Component, OnInit } from '@angular/core';
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
})
export class SidebarComponent implements OnInit {
  isExpanded = true;
  isMobile = false;
  menuItems: MenuItem[] = [];

  constructor(private globalService: GlobalService) {
    const permissions = this.globalService.getTokenDetails('permission');
    this.menuItems = this.processMenuItems(permissions);
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

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  toggleSidebarAndCollapseAll() {
    this.isExpanded = !this.isExpanded;
    if (!this.isExpanded) {
      this.collapseAllMenus();
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
    // If sidebar is collapsed, expand it first
    if (!this.isExpanded) {
      this.isExpanded = true;
      // Small delay to allow sidebar expansion animation
      setTimeout(() => {
        this.expandItemAndCollapseSiblings(item);
      }, 100);
    } else {
      this.expandItemAndCollapseSiblings(item);
    }
  }

  // New helper method to handle expansion logic
  private expandItemAndCollapseSiblings(item: MenuItem) {
    // First collapse all sibling items at the same level
    const parent = this.findParentItem(item, this.menuItems);
    if (parent) {
      parent.subPermissions?.forEach(sibling => {
        if (sibling !== item) {
          sibling.isExpanded = false;
          this.collapseChildren(sibling);
        }
      });
    } else {
      // If no parent found, this is a top-level item
      // Collapse all other top-level items
      this.menuItems.forEach(menuItem => {
        if (menuItem !== item) {
          menuItem.isExpanded = false;
          this.collapseChildren(menuItem);
        }
      });
    }

    item.isExpanded = !item.isExpanded;
  }

  private findParentItem(item: MenuItem, items: MenuItem[]): MenuItem | null {
    for (const menuItem of items) {
      if (menuItem.subPermissions?.includes(item)) {
        return menuItem;
      }
      if (menuItem.subPermissions) {
        const parent = this.findParentItem(item, menuItem.subPermissions);
        if (parent) {
          return parent;
        }
      }
    }
    return null;
  }

  private collapseChildren(item: MenuItem) {
    if (item.subPermissions) {
      item.subPermissions.forEach(child => {
        child.isExpanded = false;
        this.collapseChildren(child);
      });
    }
  }

  getIndentation(level: number): string {
    const baseIndentation = 16;
    return `${level * baseIndentation}px`;
  }

  private checkScreenSize() {
    this.isMobile = window.innerWidth <= 768;
    if (this.isMobile) {
      this.isExpanded = false;
    }
  }
}
