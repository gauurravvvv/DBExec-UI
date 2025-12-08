/**
 * Interface for Query Tab
 */
export interface QueryTab {
  id: string;
  title: string;
  databaseId?: number;
  databaseName: string;
  query: string;
  result: any | null;
  isActive: boolean;
  isExecuting: boolean;
  editor?: any; // Monaco editor instance
}

/**
 * Interface for Context Menu Item
 */
export interface ContextMenuItem {
  label: string;
  icon: string;
  command: () => void;
  disabled?: boolean;
}

/**
 * Interface for Context Menu Position
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}
