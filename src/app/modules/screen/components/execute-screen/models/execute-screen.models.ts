/**
 * Execute Screen Models
 * Interfaces and types for the execute-screen feature
 */

// Prompt types supported
export type PromptType =
  | 'calendar'
  | 'checkbox'
  | 'date'
  | 'daterange'
  | 'dropdown'
  | 'multiselect'
  | 'number'
  | 'radio'
  | 'rangeslider'
  | 'text';

// Prompt config from API
export interface PromptConfig {
  id: number;
  promptId: number;
  prompt_schema: string;
  prompt_table: string;
  prompt_column: string;
  prompt_join: string;
  prompt_where: string;
  prompt_sql: string;
  prompt_values_sql: string;
  appearance: Record<string, any>;
}

// API response for prompt values
export interface PromptValue {
  id: number;
  promptId: number;
  value: string;
}

// Prompt model for execute screen
export interface ExecutePrompt {
  id: number;
  name: string;
  description: string;
  sectionId: number;
  type: PromptType;
  mandatory: boolean;
  isGroup: boolean;
  groupId: number | null;
  promptControlName: string;
  sequence: number;
  values: PromptValue[];
  config: PromptConfig | null;
  // Internal tracking
  formControlName: string;
  // Cached options for dropdown/multiselect/radio/checkbox
  options: { label: string; value: string }[];
}

// Section model for execute screen
export interface ExecuteSection {
  id: number;
  name: string;
  description: string;
  tabId: number;
  sectionControlName: string;
  sequence: number;
  prompts: ExecutePrompt[];
  // Loading states
  loaded: boolean;
  loading: boolean;
  error: string | null;
  expanded: boolean;
}

// Tab model for execute screen
export interface ExecuteTab {
  id: number;
  name: string;
  description: string;
  tabControlName: string;
  sequence: number;
  sections: ExecuteSection[];
  // Loading states
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

// Screen model
export interface ExecuteScreen {
  id: number;
  name: string;
  organisationId: number;
  databaseId: number;
  tabs: ExecuteTab[];
}

// Form submission payload
export interface PromptSubmission {
  promptId: number;
  controlName: string;
  type: PromptType;
  value: any;
  isRange: boolean;
  startValue: any | null;
  endValue: any | null;
}

export interface SubmissionPayload {
  screenId: string;
  prompts: PromptSubmission[];
}

// API Response interfaces
export interface ApiResponse<T> {
  status: boolean;
  code: number;
  message: string;
  data: T;
}

export interface TabApiResponse {
  id: number;
  name: string;
  description: string;
  organisationId: number;
  organisationName: string;
  databaseId: number;
  databaseName: string;
  tabControlName: string;
  sequence: number;
  status: number;
  createdOn: string;
  tabSequence: number;
}

export interface SectionApiResponse {
  id: number;
  name: string;
  description: string;
  tabId: number;
  organisationId: number;
  organisationName: string;
  databaseId: number;
  databaseName: string;
  status: number;
  sequence: number;
  createdOn: string;
  sectionControlName: string;
  sectionSequence: number;
}

export interface PromptApiResponse {
  id: number;
  name: string;
  description: string;
  sectionId: number;
  organisationId: number;
  organisationName: string;
  databaseId: number;
  databaseName: string;
  status: number;
  type: string;
  validation: string | null;
  mandatory: number;
  isGroup: boolean;
  groupId: number | null;
  promptControlName: string;
  sequence: number;
  createdOn: string;
  promptSequence: number;
  values: PromptValue[];
  config: PromptConfig | null;
}

// Type guards
export function isRangeType(type: PromptType): boolean {
  return type === 'daterange' || type === 'rangeslider';
}

export function isMultiValueType(type: PromptType): boolean {
  return type === 'checkbox' || type === 'multiselect';
}

export function isSingleValueType(type: PromptType): boolean {
  return !isRangeType(type) && !isMultiValueType(type);
}

// Transform API response to internal model
export function transformTabResponse(tab: TabApiResponse): ExecuteTab {
  return {
    id: tab.id,
    name: tab.name,
    description: tab.description,
    tabControlName: tab.tabControlName,
    sequence: tab.tabSequence || tab.sequence,
    sections: [],
    loaded: false,
    loading: false,
    error: null,
  };
}

export function transformSectionResponse(
  section: SectionApiResponse
): ExecuteSection {
  return {
    id: section.id,
    name: section.name,
    description: section.description,
    tabId: section.tabId,
    sectionControlName: section.sectionControlName,
    sequence: section.sectionSequence || section.sequence,
    prompts: [],
    loaded: false,
    loading: false,
    error: null,
    expanded: false,
  };
}

/**
 * Convert ISO date strings in appearance config to Date objects
 * so PrimeNG calendar components can use them directly.
 */
function parseAppearanceDates(appearance: Record<string, any>): Record<string, any> {
  if (!appearance) return appearance;

  const dateFields = ['minDate', 'maxDate', 'defaultValue', 'defaultStartDate', 'defaultEndDate'];
  const parsed = { ...appearance };

  dateFields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      const date = new Date(parsed[field]);
      parsed[field] = isNaN(date.getTime()) ? null : date;
    }
  });

  return parsed;
}

export function transformPromptResponse(
  prompt: PromptApiResponse
): ExecutePrompt {
  const config = prompt.config ? { ...prompt.config } : null;
  if (config?.appearance) {
    config.appearance = parseAppearanceDates(config.appearance);
  }

  return {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    sectionId: prompt.sectionId,
    type: prompt.type as PromptType,
    mandatory: prompt.mandatory === 1,
    isGroup: prompt.isGroup,
    groupId: prompt.groupId,
    promptControlName: prompt.promptControlName,
    sequence: prompt.promptSequence || prompt.sequence,
    values: prompt.values || [],
    config,
    formControlName: `prompt_${prompt.id}`,
    options: (prompt.values || []).map(v => ({ label: v.value, value: v.value })),
  };
}
