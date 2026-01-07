/**
 * Prompt Renderer Helper
 * Utilities for rendering and formatting prompts
 */

import { formatDate } from '@angular/common';
import { SelectItem } from 'primeng/api';
import {
  ExecutePrompt,
  PromptType,
  PromptValue,
  PromptSubmission,
  isRangeType,
} from '../models/execute-screen.models';

/**
 * Transform API prompt values to PrimeNG SelectItem options
 */
export function transformValuesToOptions(values: PromptValue[]): SelectItem[] {
  if (!values || values.length === 0) {
    return [];
  }
  return values.map(v => ({
    label: v.value,
    value: v.value,
  }));
}

/**
 * Get placeholder text for prompt type
 */
export function getPlaceholder(type: PromptType): string {
  const placeholders: Record<PromptType, string> = {
    text: 'Enter text...',
    number: 'Enter number...',
    dropdown: 'Select an option',
    multiselect: 'Select options',
    date: 'Select date',
    calendar: 'Select date and time',
    daterange: 'Select date range',
    checkbox: 'Select options',
    radio: 'Select one option',
    rangeslider: 'Select range',
  };
  return placeholders[type] || 'Enter value...';
}

/**
 * Format value for API submission based on prompt type
 */
export function formatForSubmission(type: PromptType, value: any): any {
  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'date':
      return value instanceof Date
        ? formatDate(value, 'yyyy-MM-dd', 'en-US')
        : null;

    case 'calendar':
      return value instanceof Date
        ? formatDate(value, 'yyyy-MM-dd HH:mm:ss', 'en-US')
        : null;

    case 'daterange':
      if (!Array.isArray(value)) return [null, null];
      return value.map((d: Date | null) =>
        d instanceof Date ? formatDate(d, 'yyyy-MM-dd', 'en-US') : null
      );

    case 'checkbox':
    case 'multiselect':
      return Array.isArray(value) ? value : [];

    case 'number':
      return value !== null && value !== '' ? Number(value) : null;

    case 'rangeslider':
      if (!Array.isArray(value)) return [null, null];
      return value.map((v: number | null) => (v !== null ? Number(v) : null));

    default:
      return value;
  }
}

/**
 * Create submission object for a prompt
 */
export function createPromptSubmission(
  prompt: ExecutePrompt,
  rawValue: any
): PromptSubmission {
  const formattedValue = formatForSubmission(prompt.type, rawValue);
  const isRange = isRangeType(prompt.type);

  return {
    promptId: prompt.id,
    controlName: prompt.promptControlName,
    type: prompt.type,
    value: formattedValue,
    isRange,
    startValue:
      isRange && Array.isArray(formattedValue) ? formattedValue[0] : null,
    endValue:
      isRange && Array.isArray(formattedValue) ? formattedValue[1] : null,
  };
}

/**
 * Check if a prompt has valid options for selection-based types
 */
export function hasValidOptions(prompt: ExecutePrompt): boolean {
  const selectionTypes: PromptType[] = [
    'dropdown',
    'multiselect',
    'checkbox',
    'radio',
  ];

  if (!selectionTypes.includes(prompt.type)) {
    return true; // Non-selection types don't need options
  }

  return prompt.values && prompt.values.length > 0;
}

/**
 * Get warning message for prompts without options
 */
export function getOptionsWarning(prompt: ExecutePrompt): string | null {
  if (hasValidOptions(prompt)) {
    return null;
  }
  return `No options available for ${prompt.name}. Please configure values for this prompt.`;
}

/**
 * Get icon class for prompt type
 */
export function getPromptIcon(type: PromptType): string {
  const icons: Record<PromptType, string> = {
    text: 'pi pi-pencil',
    number: 'pi pi-hashtag',
    dropdown: 'pi pi-chevron-down',
    multiselect: 'pi pi-list',
    date: 'pi pi-calendar',
    calendar: 'pi pi-calendar-plus',
    daterange: 'pi pi-calendar-times',
    checkbox: 'pi pi-check-square',
    radio: 'pi pi-circle',
    rangeslider: 'pi pi-sliders-h',
  };
  return icons[type] || 'pi pi-question';
}

/**
 * Get slider configuration for rangeslider type
 */
export function getSliderConfig(prompt: ExecutePrompt): {
  min: number;
  max: number;
  step: number;
} {
  // Default configuration, can be extended based on prompt validation rules
  return {
    min: 0,
    max: 100,
    step: 1,
  };
}

/**
 * Format display value for read-only view
 */
export function formatDisplayValue(type: PromptType, value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }

  switch (type) {
    case 'date':
      return value instanceof Date
        ? formatDate(value, 'MMM dd, yyyy', 'en-US')
        : String(value);

    case 'calendar':
      return value instanceof Date
        ? formatDate(value, 'MMM dd, yyyy HH:mm', 'en-US')
        : String(value);

    case 'daterange':
      if (!Array.isArray(value)) return '-';
      const [start, end] = value;
      const startStr =
        start instanceof Date
          ? formatDate(start, 'MMM dd, yyyy', 'en-US')
          : '-';
      const endStr =
        end instanceof Date ? formatDate(end, 'MMM dd, yyyy', 'en-US') : '-';
      return `${startStr} to ${endStr}`;

    case 'checkbox':
    case 'multiselect':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : '-';

    case 'rangeslider':
      if (!Array.isArray(value)) return '-';
      return `${value[0]} - ${value[1]}`;

    default:
      return String(value);
  }
}
