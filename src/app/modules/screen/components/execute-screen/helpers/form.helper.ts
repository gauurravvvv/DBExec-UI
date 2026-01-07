/**
 * Form Helper
 * Utilities for creating form controls and validators for prompts
 */

import {
  FormControl,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import {
  ExecutePrompt,
  PromptType,
  isRangeType,
} from '../models/execute-screen.models';

/**
 * Create a form control for a prompt with appropriate validators
 */
export function createPromptFormControl(prompt: ExecutePrompt): FormControl {
  const validators = [];

  // Add required validator if mandatory
  if (prompt.mandatory) {
    validators.push(Validators.required);
  }

  // Add type-specific validators
  switch (prompt.type) {
    case 'number':
      validators.push(Validators.pattern(/^-?\d*\.?\d*$/));
      break;
    case 'daterange':
    case 'rangeslider':
      validators.push(rangeValidator);
      break;
  }

  const defaultValue = getDefaultValue(prompt.type);
  return new FormControl(defaultValue, validators);
}

/**
 * Get default value based on prompt type
 */
export function getDefaultValue(type: PromptType): any {
  switch (type) {
    case 'text':
      return '';
    case 'number':
      return null;
    case 'checkbox':
    case 'multiselect':
      return [];
    case 'dropdown':
    case 'radio':
      return null;
    case 'date':
    case 'calendar':
      return null;
    case 'daterange':
      return [null, null];
    case 'rangeslider':
      return [0, 100];
    default:
      return null;
  }
}

/**
 * Custom validator for range types (daterange, rangeslider)
 * Ensures start value is less than or equal to end value
 */
export function rangeValidator(
  control: AbstractControl
): ValidationErrors | null {
  const value = control.value;

  // Skip validation if value is not an array
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const [start, end] = value;

  // Skip validation if either value is null
  if (start === null || end === null) {
    return null;
  }

  // For dates, compare timestamps
  if (start instanceof Date && end instanceof Date) {
    if (start.getTime() > end.getTime()) {
      return { rangeInvalid: 'Start date must be before or equal to end date' };
    }
  }

  // For numbers, compare values
  if (typeof start === 'number' && typeof end === 'number') {
    if (start > end) {
      return {
        rangeInvalid: 'Start value must be less than or equal to end value',
      };
    }
  }

  return null;
}

/**
 * Check if a form control has a specific error
 */
export function hasError(control: FormControl, errorKey: string): boolean {
  return control.hasError(errorKey) && (control.dirty || control.touched);
}

/**
 * Get error message for a form control
 */
export function getErrorMessage(
  control: FormControl,
  promptName: string
): string {
  if (control.hasError('required')) {
    return `${promptName} is required`;
  }
  if (control.hasError('pattern')) {
    return `${promptName} must be a valid number`;
  }
  if (control.hasError('rangeInvalid')) {
    return control.getError('rangeInvalid');
  }
  return '';
}

/**
 * Check if all mandatory prompts in a section have values
 */
export function validateSection(
  prompts: ExecutePrompt[],
  formControls: { [key: string]: FormControl }
): boolean {
  return prompts
    .filter(p => p.mandatory)
    .every(p => {
      const control = formControls[p.formControlName];
      return control && control.valid;
    });
}

/**
 * Mark all controls as touched to trigger validation display
 */
export function markAllAsTouched(formControls: {
  [key: string]: FormControl;
}): void {
  Object.values(formControls).forEach(control => {
    control.markAsTouched();
  });
}
