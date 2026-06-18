import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/core/layout/sidebar/sidebar.constant';
import { PERMISSIONS } from '../constants/permissions.constant';
import { GlobalService } from '../services/global.service';
import { PermissionService } from '../services/permission.service';

/**
 * Decide a user's "home" route from their permissions, not from a
 * role string. The platform System Admin is the only user that can
 * read `systemAdmin` (it's a SYSTEM-scope permission), so checking
 * that one value is enough to distinguish "platform operator" from
 * "org user". Org admins + org users share the same home.
 */
function getHomeFromPermissions(
  permissionService: PermissionService,
): string {
  return permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)
    ? HOME_ROUTES.SYSTEM_ADMIN
    : HOME_ROUTES.ORG_ADMIN;
}

/**
 * UI-only route guard. Reads the route's required permission and
 * checks it against the JWT-stamped permission tree. Not a security
 * boundary — the server re-checks every API call via
 * VerifyPermissionMiddleware.
 *
 * There's no role-string bypass anywhere. The platform System Admin
 * holds only home / systemAdmin / orgManagement / auditLogs /
 * loginActivity / announcementManagement / appSettings — anything
 * else returns false and redirects.
 */
export const roleGuard: CanActivateFn = (route, _state) => {
  const globalService = inject(GlobalService);
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  const userRole = globalService.getTokenDetails('role');
  if (!userRole) {
    router.navigate([AUTH_ROUTES.LOGIN]);
    return false;
  }

  const requiredPermission: string | undefined = route.data['permission'];

  if (requiredPermission && !permissionService.canRead(requiredPermission)) {
    router.navigate([getHomeFromPermissions(permissionService)]);
    return false;
  }

  return true;
};
