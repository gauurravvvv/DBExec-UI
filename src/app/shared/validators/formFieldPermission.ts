/**
 * Field-level RBAC validator (Prompt Builder F11). Mirrored byte-identical in
 * dbexec-ui/src/app/shared/validators/formFieldPermission.ts — edit both together.
 * Messages are i18n keys resolved by the locale layer (validation.formBuilder.*).
 *
 * Reuses the FIELD_ACCESS_VALUES enum Phase 0 exported from formRules.ts so the
 * FE grid + BE validator share one source. access ALSO accepts a blank string:
 * a blank access on POST means "delete this role's grant" (revert to permissive
 * default), matching the RBAC editor's "- (default: write)" option.
 */
import { z } from 'zod';
import { FIELD_ACCESS_VALUES } from './formRules';

export const setFieldPermissionSchema = z.object({
  roleId: z
    .string({ message: 'validation.formBuilder.permission.roleId.required' })
    .uuid('validation.formBuilder.permission.roleId.uuid'),
  access: z.enum(['', ...FIELD_ACCESS_VALUES], {
    message: 'validation.formBuilder.permission.access.invalid',
  }),
});

export type SetFieldPermissionInput = z.infer<typeof setFieldPermissionSchema>;
