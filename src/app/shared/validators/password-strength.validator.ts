import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Custom password strength validator that returns individual error keys
 * for per-rule error messages in the UI.
 *
 * Error keys returned:
 * - passwordMinLength: password too short
 * - passwordMaxLength: password too long
 * - passwordNoSpaces: contains whitespace
 * - passwordLowercase: missing lowercase letter
 * - passwordUppercase: missing uppercase letter
 * - passwordDigit: missing number
 * - passwordSpecial: missing special character
 */
export function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null; // let Validators.required handle empty

    const errors: ValidationErrors = {};

    if (value.length < 8) {
      errors['passwordMinLength'] = {
        requiredLength: 8,
        actualLength: value.length,
      };
    }
    if (value.length > 128) {
      errors['passwordMaxLength'] = {
        requiredLength: 128,
        actualLength: value.length,
      };
    }
    if (/\s/.test(value)) {
      errors['passwordNoSpaces'] = true;
    }
    if (!/[a-z]/.test(value)) {
      errors['passwordLowercase'] = true;
    }
    if (!/[A-Z]/.test(value)) {
      errors['passwordUppercase'] = true;
    }
    if (!/\d/.test(value)) {
      errors['passwordDigit'] = true;
    }
    if (!/[^a-zA-Z0-9\s]/.test(value)) {
      errors['passwordSpecial'] = true;
    }

    return Object.keys(errors).length ? errors : null;
  };
}
