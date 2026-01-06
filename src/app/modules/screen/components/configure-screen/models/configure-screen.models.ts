/**
 * Configure Screen Models
 * Interfaces and types used throughout the configure-screen component
 */

export interface TabData {
  id: string | number;
  name: string;
  description: string;
  sections: Section[];
  sequence?: number;
  [key: string]: any;
}

export interface Section {
  id: string | number;
  name: string;
  prompts: Prompt[];
  selectAll?: boolean;
  expanded?: boolean;
  sequence: number;
  currentGroupId?: number;
  selectedGroupId?: number | null;
  [key: string]: any;
}

export interface Prompt {
  id: string | number;
  name: string;
  type: string;
  selected?: boolean;
  sequence?: number;
  groupId?: number;
  colorIndex?: number;
  isMandatory?: boolean;
  [key: string]: any;
}

export interface GroupData {
  [key: number]: number;
}

export interface ConfigPrompt {
  id: string | number;
  sequence: number;
  isGrouped: boolean;
  groupId: number;
  color: string | null;
  isMandatory?: boolean;
}

export interface SectionGroupColor {
  groupId: number;
  colorIndex: number;
  sectionId: number | string;
}

export interface SectionGroupData {
  sectionId: number | string;
  groupId: number;
  color: string;
}

/** Drag state for tabs, sections, and prompts */
export interface DragState {
  draggedTabIndex: number | null;
  dragOverIndex: number | null;
  draggedSectionIndex: number | null;
  draggedTabId: string | number | null;
  draggedPromptIndex: number | null;
  draggedPromptTabId: string | number | null;
  draggedPromptSectionId: string | number | null;
}

/** Group colors palette */
export const GROUP_COLORS: string[] = [
  '#8BB9DD', // Soft blue
  '#98D4BB', // Mint green
  '#F2B6B6', // Soft pink
  '#B6CCF2', // Light periwinkle
  '#E2C799', // Warm sand
  '#C3B1E1', // Soft purple
  '#9DDBAD', // Sage green
  '#F2D4C2', // Peach
  '#FFB6C1', // Light pink
  '#87CEEB', // Sky blue
  '#DDA0DD', // Plum
  '#F0E68C', // Khaki
  '#B0E0E6', // Powder blue
  '#FFDAB9', // Peach puff
  '#C9E4CA', // Pale green
  '#E6E6FA', // Lavender
];
