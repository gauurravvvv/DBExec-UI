/**
 * Tab Management Helper
 * Contains utility methods for tab operations
 */

import { QueryTab, ContextMenuItem } from '../models/query-tab.model';

export class TabManagementHelper {
  /**
   * Get tab context menu items
   */
  static getTabContextMenuItems(
    tabIndex: number,
    totalTabs: number,
    renameCallback: () => void,
    closeCallback: () => void,
    closeOthersCallback: () => void,
    closeToRightCallback: () => void,
    closeToLeftCallback: () => void
  ): ContextMenuItem[] {
    return [
      {
        label: 'Rename',
        icon: 'pi-pencil',
        command: renameCallback,
      },
      {
        label: 'Close',
        icon: 'pi-times',
        command: closeCallback,
      },
      {
        label: 'Close Others',
        icon: 'pi-times-circle',
        command: closeOthersCallback,
        disabled: totalTabs <= 1,
      },
      {
        label: 'Close to the Right',
        icon: 'pi-arrow-right',
        command: closeToRightCallback,
        disabled: tabIndex === totalTabs - 1,
      },
      {
        label: 'Close to the Left',
        icon: 'pi-arrow-left',
        command: closeToLeftCallback,
        disabled: tabIndex === 0,
      },
    ];
  }

  /**
   * Get database context menu items
   */
  static getDatabaseContextMenuItems(
    newScriptCallback: () => void,
    refreshCallback: () => void,
    isNewScriptDisabled: boolean = false
  ): ContextMenuItem[] {
    return [
      {
        label: 'New Script',
        icon: 'pi-plus',
        command: newScriptCallback,
        disabled: isNewScriptDisabled,
      },
      {
        label: 'Refresh',
        icon: 'pi-refresh',
        command: refreshCallback,
      },
    ];
  }

  /**
   * Create a new query tab
   */
  static createQueryTab(
    tabCounter: number,
    title: string,
    databaseId?: number,
    databaseName: string = 'database'
  ): QueryTab {
    const tabId = `tab_${tabCounter}`;
    return {
      id: tabId,
      title: title,
      databaseId: databaseId,
      databaseName: databaseName,
      query: '-- Write your SQL query here',
      result: null,
      isActive: true,
      isExecuting: false,
    };
  }

  /**
   * Dispose editor for a tab
   */
  static disposeTabEditor(tab: QueryTab): void {
    if (tab.editor) {
      tab.editor.dispose();
      tab.editor = null;
    }
  }

  /**
   * Dispose editors for multiple tabs
   */
  static disposeTabEditors(tabs: QueryTab[]): void {
    tabs.forEach(tab => this.disposeTabEditor(tab));
  }

  /**
   * Deactivate all tabs
   */
  static deactivateAllTabs(tabs: QueryTab[]): void {
    tabs.forEach(tab => (tab.isActive = false));
  }

  /**
   * Find active tab
   */
  static findActiveTab(tabs: QueryTab[]): QueryTab | undefined {
    return tabs.find(tab => tab.isActive);
  }

  /**
   * Get tabs to the right of a given index
   */
  static getTabsToRight(tabs: QueryTab[], index: number): QueryTab[] {
    return tabs.slice(index + 1);
  }

  /**
   * Get tabs to the left of a given index
   */
  static getTabsToLeft(tabs: QueryTab[], index: number): QueryTab[] {
    return tabs.slice(0, index);
  }

  /**
   * Get all tabs except the one with given id
   */
  static getOtherTabs(tabs: QueryTab[], excludeTabId: string): QueryTab[] {
    return tabs.filter(tab => tab.id !== excludeTabId);
  }

  /**
   * Maximum allowed tabs constant
   */
  static readonly MAX_TABS = 10;

  /**
   * Check if max tabs limit is reached
   */
  static isMaxTabsReached(currentTabCount: number): boolean {
    return currentTabCount >= this.MAX_TABS;
  }
}
