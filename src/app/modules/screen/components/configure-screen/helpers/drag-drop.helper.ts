/**
 * Drag Drop Helper
 * Handles drag and drop operations for tabs, sections, and prompts
 */

import {
  TabData,
  Section,
  Prompt,
  DragState,
} from '../models/configure-screen.models';

/**
 * Result of a tab reorder operation
 */
export interface TabReorderResult {
  tabs: TabData[];
  newDragIndex: number;
  newActiveIndex: number;
}

/**
 * Result of a section reorder operation
 */
export interface SectionReorderResult {
  sections: Section[];
  newDragIndex: number;
}

/**
 * Reorder tabs when dragging
 */
export function reorderTabs(
  tabs: TabData[],
  originalIndex: number,
  dropIndex: number,
  activeTabIndex: number
): TabReorderResult {
  const updatedTabs = [...tabs];
  const draggedTab = updatedTabs[originalIndex];

  // Remove tab from original position
  updatedTabs.splice(originalIndex, 1);
  // Insert at new position
  updatedTabs.splice(dropIndex, 0, draggedTab);

  // Update sequences
  updatedTabs.forEach((tab: TabData, idx: number) => {
    tab.sequence = idx + 1;
  });

  // Calculate new active tab index
  let newActiveIndex = activeTabIndex;
  if (activeTabIndex === originalIndex) {
    newActiveIndex = dropIndex;
  } else if (activeTabIndex > originalIndex && activeTabIndex <= dropIndex) {
    newActiveIndex--;
  } else if (activeTabIndex < originalIndex && activeTabIndex >= dropIndex) {
    newActiveIndex++;
  }

  return {
    tabs: updatedTabs,
    newDragIndex: dropIndex,
    newActiveIndex,
  };
}

/**
 * Reorder sections within a tab
 */
export function reorderSections(
  sections: Section[],
  originalIndex: number,
  dropIndex: number
): SectionReorderResult {
  const updatedSections = [...sections];
  const draggedSection = updatedSections[originalIndex];

  // Remove section from original position
  updatedSections.splice(originalIndex, 1);
  // Insert at new position
  updatedSections.splice(dropIndex, 0, draggedSection);

  // Update sequences
  updatedSections.forEach((section: Section, idx: number) => {
    section.sequence = idx + 1;
  });

  return {
    sections: updatedSections,
    newDragIndex: dropIndex,
  };
}

/**
 * Reorder prompts within a section
 */
export function reorderPrompts(
  section: Section,
  originalIndex: number,
  dropIndex: number
): number {
  const updatedPrompts = [...section.prompts];
  const draggedPrompt = updatedPrompts[originalIndex];

  // Remove prompt from original position
  updatedPrompts.splice(originalIndex, 1);
  // Insert at new position
  updatedPrompts.splice(dropIndex, 0, draggedPrompt);

  // Update section prompts
  section.prompts = updatedPrompts;

  // Update prompt sequences
  section.prompts.forEach((prompt: Prompt, idx: number) => {
    prompt.sequence = idx + 1;
  });

  return dropIndex;
}

/**
 * Create initial drag state
 */
export function createInitialDragState(): DragState {
  return {
    draggedTabIndex: null,
    dragOverIndex: null,
    draggedSectionIndex: null,
    draggedTabId: null,
    draggedPromptIndex: null,
    draggedPromptTabId: null,
    draggedPromptSectionId: null,
  };
}

/**
 * Reset all drag states
 */
export function resetDragState(): DragState {
  return createInitialDragState();
}

/**
 * Find tab by ID
 */
export function findTabById(
  tabs: TabData[],
  tabId: string | number
): TabData | undefined {
  return tabs.find(t => t.id === tabId);
}

/**
 * Find section by ID within a tab
 */
export function findSectionById(
  tab: TabData,
  sectionId: string | number
): Section | undefined {
  return tab.sections.find((s: Section) => s.id === sectionId);
}
