import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/core/layout/sidebar/sidebar.constant';
import { PERMISSIONS } from '../constants/permissions.constant';
import { LoginService } from '../services/login.service';
import { PermissionService } from '../services/permission.service';

/**
 * Decide a user's "home" route from their permissions, not from a
 * role string.
 *
 * A user can belong to many groups and therefore carry many roles;
 * picking a single "primary role" is a lie. The platform System
 * Admin is the only user that can read `systemAdmin` (it's a
 * SYSTEM-scope permission), so checking that one value is the
 * authoritative "platform operator?" signal regardless of how many
 * roles the user has. Org admins + org users share the same home.
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
 * No role-string check anywhere. Permissions are the only signal,
 * which correctly handles users in multiple groups with overlapping
 * grants.
 */
export const roleGuard: CanActivateFn = (route, _state) => {
  const loginService = inject(LoginService);
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  if (!loginService.isLoggedIn()) {
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
