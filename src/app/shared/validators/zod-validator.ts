/**
 * zodValidator — bridge a Zod schema to Angular's reactive-forms
 * `ValidatorFn`. Each field control runs its own schema; the
 * adapter returns either `null` (valid) or
 * `{ [errorKey: string]: string }` where the value is a translation
 * KEY that the template / error-display logic feeds into ngx-translate.
 *
 * Why a custom adapter instead of pulling validation from a parsed
 * `addOrganisationSchema` at submit time:
 *   - Reactive forms expect per-field validity for disable/enable
 *     of Save buttons and inline error rendering.
 *   - The translation key lives in the schema; we surface it as the
 *     ValidationErrors value so the template renders the SAME message
 *     the BE will return on failure.
 *
 * Usage:
 *
 *   import { orgNameSchema } from 'src/app/shared/validators/organisation';
 *   import { zodValidator } from 'src/app/shared/validators/zod-validator';
 *
 *   name: ['', [zodValidator(orgNameSchema)]],
 *
 *   // template error pipe:
 *   {{ orgForm.get('name')?.errors?.['zod'] | translate }}
 */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ZodType } from 'zod';

/**
 * Returns an Angular ValidatorFn from a Zod schema for a single
 * value. Empty string / null / undefined are forwarded to the schema
 * — let Zod decide if the field is required (its own `required` flag
 * controls that, not Angular's).
 *
 * On failure the returned errors object is:
 *   { zod: 'validation.organisation.name.tooShort' }
 *
 * Template binds `errors?.['zod'] | translate` to get the localised
 * message. The SAME translation key is what the BE returns on a 400
 * response, so the user sees the same string whether the rule fires
 * client-side or server-side.
 */
export function zodValidator<T>(schema: ZodType<T>): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    // Treat completely-empty controls as "no value yet" rather than
    // "empty string". An untouched Required field still shows the
    // required error because the schema rejects empty strings.
    const value = control.value;
    const result = schema.safeParse(value);
    if (result.success) return null;
    const key = result.error.issues[0]?.message ?? 'generic.bad_request';
    return { zod: key };
  };
}
