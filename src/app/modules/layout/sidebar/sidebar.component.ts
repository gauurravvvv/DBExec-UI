import { Component, OnInit } from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { SIDEBAR_ITEMS_ROUTES } from './sidebar.constant';

interface MenuItem {
  label: string;
  route: string;
  icon: string;
  children?: MenuItem[];
  isExpanded?: boolean;
  level?: number;
  subPermissions?: any;
  value: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit {
  menuItems: { children: MenuItem[] }[] = [];
  isExpanded = true;
  isMobile = false;

  constructor(private globalService: GlobalService) {
    this.menuItems = [
      {
        children: this.processMenuItems(
          this.globalService.getTokenDetails('permission')
        ),
      },
    ];
  }

  ngOnInit() {
    this.checkScreenSize();
    window.addEventListener('resize', () => this.checkScreenSize());
  }

  processMenuItems(items: MenuItem[], level: number = 0): MenuItem[] {
    return items.map(item => ({
      ...item,
      level,
      isExpanded: false,
      children: item.subPermissions
        ? this.processMenuItems(item.subPermissions, level + 1)
        : undefined,
      route: this.appendRouteToMenu(item),
    }));
  }

  appendRouteToMenu(item: MenuItem) {
    const route = SIDEBAR_ITEMS_ROUTES.find(
      (ir: any) => ir.value == item.value
    )?.route;
    return route ? route : '';
  }

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  toggleSidebarAndCollapseAll() {
    this.collapseAllItems();
    this.toggleSidebar();
  }

  private collapseAllItems() {
    this.menuItems.forEach(mainItem => {
      if (mainItem.children) {
        mainItem.children.forEach(item => {
          this.collapseItemAndChildren(item);
        });
      }
    });
  }

  private collapseItemAndChildren(item: any) {
    item.isExpanded = false;
    if (item.children) {
      item.children.forEach((child: any) => {
        this.collapseItemAndChildren(child);
      });
    }
  }

  toggleSubmenu(item: MenuItem) {
    if (item.children) {
      item.isExpanded = !item.isExpanded;
    }
  }

  toggleSubmenuAndExpand(item: any) {
    if (!this.isExpanded) {
      this.isExpanded = true;
    }
    this.toggleSubmenu(item);
  }

  getIndentation(level: number = 0): string {
    return `${1.5 + level * 1}rem`;
  }

  private checkScreenSize() {
    this.isMobile = window.innerWidth <= 768;
    if (this.isMobile) {
      this.isExpanded = false;
    }
  }
}
