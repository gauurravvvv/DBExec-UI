import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROLES } from 'src/app/core/constants/user.constant';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/core/layout/sidebar/sidebar.constant';
import { PermissionService } from '../services/permission.service';
import { GlobalService } from '../services/global.service';

function getHomeByRole(role: string): string {
  if (role === ROLES.SYSTEM_ADMIN) {
    return HOME_ROUTES.SYSTEM_ADMIN;
  }
  return HOME_ROUTES.ORG_ADMIN;
}

/**
 * UI-only route guard based on the client-decoded JWT role + permission tree.
 *
 * Prevents navigation to unauthorized pages — NOT a security boundary.
 * The server enforces role + permission checks on every API call via
 * VerifyPermissionMiddleware.
 *
 * There is no SYSTEM_ADMIN bypass here. The V2 permission set (see
 * BE `systemAdminV2.ts`) limits the platform System Admin to a small
 * set of values (home / systemAdmin / orgManagement / auditLogs /
 * loginActivity / announcementManagement / appSettings) — anything
 * else (per-org routes like /users, /groups, /datasources) is
 * intentionally outside their reach, and the guard treats them like
 * any other role: walk the permission tree, redirect to their home
 * if the route's required permission isn't present.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const globalService = inject(GlobalService);
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  const userRole = globalService.getTokenDetails('role');

  if (!userRole) {
    router.navigate([AUTH_ROUTES.LOGIN]);
    return false;
  }

  const allowedRoles: string[] = route.data['roles'];
  const requiredPermission: string = route.data['permission'];

  // Check system role first
  if (allowedRoles?.length > 0 && !allowedRoles.includes(userRole)) {
    router.navigate([getHomeByRole(userRole)]);
    return false;
  }

  // Module-level permission check via the relational tree
  // (PermissionService reads from StorageType.PERMISSION_TREE).
  // READ is the default — route data can override later if any
  // route ever wants WRITE/FULL gating (currently none do).
  if (requiredPermission && !permissionService.canRead(requiredPermission)) {
    router.navigate([getHomeByRole(userRole)]);
    return false;
  }

  return true;
};
