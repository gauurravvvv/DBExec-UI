/**
 * Placeholder file.
 *
 * The legacy `ROLES` const ('SYSTEM-ADMIN' | 'ORG-ADMIN' | 'ORG-USER')
 * was retired in the RBAC migration. JWT.role now carries the role
 * NAME stamped at login ("System Admin", "Administrator", "Member")
 * — a display label, not a behavioural gate.
 *
 * For "can this user do X?" use PermissionService.canRead/canWrite/
 * canDelete with values from PERMISSIONS (permissions.constant.ts).
 *
 * For "what should the home route look like?" check the appropriate
 * permission directly:
 *   permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN) → platform op
 *   otherwise → org user
 *
 * This file is kept so external imports from the barrel don't break;
 * it's empty otherwise and can be deleted once the barrel is cleaned.
 */
export {};
