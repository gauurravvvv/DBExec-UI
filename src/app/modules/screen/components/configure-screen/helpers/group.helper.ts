/**
 * Group Helper
 * Handles prompt grouping, color management, and mandatory status
 */

import {
  Prompt,
  Section,
  TabData,
  GROUP_COLORS,
} from '../models/configure-screen.models';

/**
 * Check if a prompt selection can be grouped (needs at least 2)
 */
export function canGroupPrompts(
  selectedPrompts: { [sectionId: string]: Prompt[] },
  sectionId: string | number
): boolean {
  return selectedPrompts[sectionId]?.length >= 2 || false;
}

/**
 * Check if a prompt is in the current selection
 */
export function isPromptSelected(
  prompt: Prompt,
  section: Section,
  selectedPrompts: { [sectionId: string]: Prompt[] }
): boolean {
  return (
    selectedPrompts[section.id]?.some((p: Prompt) => p.id === prompt.id) ||
    false
  );
}

/**
 * Check if a group exists in a section
 */
export function isGroupActiveInSection(
  section: Section,
  groupId: number
): boolean {
  return section.prompts.some((p: Prompt) => p.groupId === groupId);
}

/**
 * Check if a section has any groups
 */
export function hasSectionGroups(section: Section): boolean {
  return section.prompts.some(
    (prompt: Prompt) => prompt.groupId !== undefined && prompt.groupId !== null
  );
}

/**
 * Check if any tabs have groups
 */
export function hasAnyGroups(tabs: TabData[]): boolean {
  return tabs.some((tab: TabData) =>
    tab.sections.some((section: Section) =>
      section.prompts.some(
        (prompt: Prompt) =>
          prompt.groupId !== undefined && prompt.groupId !== null
      )
    )
  );
}

/**
 * Validate group and cleanup if less than 2 prompts
 * Returns true if group was cleaned up
 */
export function validateAndCleanupGroup(
  section: Section,
  groupId: number,
  activeGroupId: number | null
): { needsCleanup: boolean; cleanedGroupId: number | null } {
  const promptsInGroup = section.prompts.filter(
    (p: Prompt) => p.groupId === groupId
  );

  if (promptsInGroup.length < 2) {
    // Remove group from all prompts in this group
    section.prompts.forEach((prompt: Prompt) => {
      if (prompt.groupId === groupId) {
        prompt.groupId = undefined;
        prompt.colorIndex = undefined;
      }
    });

    return {
      needsCleanup: true,
      cleanedGroupId: activeGroupId === groupId ? groupId : null,
    };
  }

  return { needsCleanup: false, cleanedGroupId: null };
}

/**
 * Clear all groups from all tabs
 */
export function clearAllGroupsFromTabs(tabs: TabData[]): void {
  tabs.forEach((tab: TabData) => {
    tab.sections.forEach((section: Section) => {
      section.prompts.forEach((prompt: Prompt) => {
        prompt.groupId = undefined;
        prompt.colorIndex = undefined;
      });
    });
  });
}

/**
 * Clear groups from a specific section
 */
export function clearSectionGroups(section: Section): void {
  section.prompts.forEach((prompt: Prompt) => {
    if (prompt.groupId !== undefined && prompt.groupId !== null) {
      prompt.groupId = undefined;
      prompt.colorIndex = undefined;
    }
  });
}

/**
 * Get the next available color index (unused or least used)
 */
export function getNextAvailableColorIndex(tabs: TabData[]): number | null {
  const currentlyUsedIndices = new Set<number>();

  tabs.forEach((tab: TabData) => {
    tab.sections.forEach((section: Section) => {
      section.prompts.forEach((prompt: Prompt) => {
        if (
          prompt.colorIndex !== undefined &&
          prompt.groupId !== undefined &&
          prompt.groupId !== null
        ) {
          currentlyUsedIndices.add(prompt.colorIndex);
        }
      });
    });
  });

  // Find the first unused color index
  for (let i = 0; i < GROUP_COLORS.length; i++) {
    if (!currentlyUsedIndices.has(i)) {
      return i;
    }
  }

  // If all colors are used, find the least used color
  const colorUsageCount = new Map<number, number>();
  for (let i = 0; i < GROUP_COLORS.length; i++) {
    colorUsageCount.set(i, 0);
  }

  tabs.forEach((tab: TabData) => {
    tab.sections.forEach((section: Section) => {
      section.prompts.forEach((prompt: Prompt) => {
        if (
          prompt.colorIndex !== undefined &&
          prompt.groupId !== undefined &&
          prompt.groupId !== null
        ) {
          const count = colorUsageCount.get(prompt.colorIndex) || 0;
          colorUsageCount.set(prompt.colorIndex, count + 1);
        }
      });
    });
  });

  let minUsage = Infinity;
  let minUsageIndex = 0;
  colorUsageCount.forEach((count: number, index: number) => {
    if (count < minUsage) {
      minUsage = count;
      minUsageIndex = index;
    }
  });

  return minUsageIndex;
}

/**
 * Get color index for a group in a section
 */
export function getColorIndexForGroup(
  groupId: number,
  section: Section | undefined,
  tabs: TabData[]
): number | null {
  if (section) {
    const existingPrompt = section.prompts.find(
      (prompt: Prompt) =>
        prompt.groupId === groupId && prompt.colorIndex !== undefined
    );
    if (existingPrompt && existingPrompt.colorIndex !== undefined) {
      return existingPrompt.colorIndex;
    }
  }

  return getNextAvailableColorIndex(tabs);
}

/**
 * Check if a color index is in use
 */
export function isColorInUse(tabs: TabData[], colorIndex: number): boolean {
  return tabs.some((tab: TabData) =>
    tab.sections.some((section: Section) =>
      section.prompts.some((prompt: Prompt) => prompt.colorIndex === colorIndex)
    )
  );
}

/**
 * Assign color to all prompts in a group
 */
export function assignColorToGroup(
  tabs: TabData[],
  groupId: number,
  colorIndex: number
): void {
  tabs.forEach((tab: TabData) => {
    tab.sections.forEach((section: Section) => {
      section.prompts.forEach((prompt: Prompt) => {
        if (prompt.groupId === groupId) {
          prompt.colorIndex = colorIndex;
        }
      });
    });
  });
}

/**
 * Toggle mandatory status and propagate to group
 */
export function toggleMandatoryInGroup(prompt: Prompt, section: Section): void {
  prompt.isMandatory = !prompt.isMandatory;

  // If prompt is in a group, update all prompts in the same group
  if (prompt.groupId !== undefined && prompt.groupId !== null) {
    section.prompts.forEach((p: Prompt) => {
      if (p.groupId === prompt.groupId) {
        p.isMandatory = prompt.isMandatory;
      }
    });
  }
}

/**
 * Find section containing a prompt
 */
export function findSectionContainingPrompt(
  tabs: TabData[],
  prompt: Prompt
): Section | null {
  for (const tab of tabs) {
    for (const section of tab.sections) {
      if (section.prompts.some((p: Prompt) => p.id === prompt.id)) {
        return section;
      }
    }
  }
  return null;
}

/**
 * Group selected prompts with mandatory propagation
 */
export function groupPrompts(
  selectedPrompts: Prompt[],
  groupId: number,
  colorIndex: number
): void {
  // Check if any prompt is mandatory
  const hasMandatoryPrompt = selectedPrompts.some((p: Prompt) => p.isMandatory);

  selectedPrompts.forEach((prompt: Prompt) => {
    prompt.groupId = groupId;
    prompt.colorIndex = colorIndex;
    // Propagate mandatory status
    if (hasMandatoryPrompt) {
      prompt.isMandatory = true;
    }
  });
}

/**
 * Add prompt to existing group, inheriting mandatory status
 */
export function addPromptToGroup(
  prompt: Prompt,
  section: Section,
  groupId: number,
  colorIndex: number | undefined
): number | undefined {
  const oldGroupId = prompt.groupId;

  // Check if group has mandatory prompts
  const isGroupMandatory = section.prompts.some(
    (p: Prompt) => p.groupId === groupId && p.isMandatory
  );

  prompt.groupId = groupId;
  prompt.colorIndex = colorIndex;

  // Inherit mandatory status from the group
  if (isGroupMandatory) {
    prompt.isMandatory = true;
  }

  return oldGroupId;
}
