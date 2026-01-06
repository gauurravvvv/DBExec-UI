/**
 * Style Helper
 * Styling utilities for prompts, groups, and mandatory indicators
 */

import {
  Prompt,
  Section,
  GROUP_COLORS,
} from '../models/configure-screen.models';

/** Mandatory color constant */
const MANDATORY_COLOR = '#ff4444';

/**
 * Get style for mandatory prompt border/background
 */
export function getPromptMandatoryStyle(
  prompt: Prompt
): Record<string, string> {
  if (!prompt.isMandatory) {
    return {};
  }

  return {
    'border-color': MANDATORY_COLOR,
    'border-width': '2px',
    'border-style': 'solid',
    'box-shadow': `0 0 0 1px ${MANDATORY_COLOR}33`,
    'background-color': `${MANDATORY_COLOR}10`,
  };
}

/**
 * Get style for group bullet indicator
 */
export function getGroupBulletStyle(
  groupId: number,
  section: Section | undefined,
  activeGroupId: number | null,
  activeGroupSectionId: string | number | null
): Record<string, string> {
  if (!section) return {};

  // Find prompt with this groupId in this section
  const sectionPrompts = section.prompts.filter((p: Prompt) => {
    return p.groupId === groupId && p.colorIndex !== undefined;
  });

  if (sectionPrompts.length === 0) return {};

  const colorIndex = sectionPrompts[0].colorIndex!;
  const color = GROUP_COLORS[colorIndex];

  if (!color) return {};

  const isActive =
    activeGroupId === groupId && activeGroupSectionId === section.id;

  return {
    'background-color': isActive ? color : `${color}80`,
    'border-color': color,
    'border-width': isActive ? '2px' : '1px',
    transform: isActive ? 'scale(1.2)' : 'scale(1)',
    'box-shadow': isActive ? `0 0 8px ${color}` : 'none',
    cursor: 'pointer',
  };
}

/**
 * Get background style for grouped prompt
 */
export function getPromptGroupStyle(
  prompt: Prompt,
  section: Section,
  activeGroupId: number | null,
  activeGroupSectionId: string | number | null
): Record<string, string> {
  if (prompt.groupId === undefined || prompt.groupId === null) {
    return {};
  }

  const colorIndex = prompt.colorIndex;
  if (colorIndex === undefined) return {};

  const color = GROUP_COLORS[colorIndex];
  if (!color) return {};

  const isActive =
    activeGroupId === prompt.groupId && activeGroupSectionId === section.id;

  return {
    'background-color': isActive ? `${color}40` : `${color}20`,
    'border-left': `3px solid ${color}`,
  };
}

/**
 * Get style for group dot on prompt
 */
export function getPromptGroupDotStyle(
  prompt: Prompt,
  section: Section,
  activeGroupId: number | null,
  activeGroupSectionId: string | number | null
): Record<string, string> {
  if (prompt.groupId === undefined || prompt.groupId === null) {
    return { display: 'none' };
  }

  const colorIndex = prompt.colorIndex;
  if (colorIndex === undefined) return { display: 'none' };

  const color = GROUP_COLORS[colorIndex];
  if (!color) return { display: 'none' };

  const isActive =
    activeGroupId === prompt.groupId && activeGroupSectionId === section.id;

  return {
    display: 'block',
    'background-color': color,
    'box-shadow': isActive ? `0 0 4px ${color}` : 'none',
  };
}

/**
 * Get section-specific color for a group
 */
export function getSectionGroupColor(
  section: Section,
  groupId: number
): string | null {
  const prompt = section.prompts.find(
    (p: Prompt) => p.groupId === groupId && p.colorIndex !== undefined
  );

  if (!prompt || prompt.colorIndex === undefined) return null;

  return GROUP_COLORS[prompt.colorIndex];
}

/**
 * Get count of grouped prompts by groupId
 */
export function getGroupedPromptsCount(
  section: Section
): Record<number, number> {
  const groups: Record<number, number> = {};
  section.prompts.forEach((prompt: Prompt) => {
    if (prompt.groupId !== undefined && prompt.groupId !== null) {
      groups[prompt.groupId] = (groups[prompt.groupId] || 0) + 1;
    }
  });
  return groups;
}
