import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';
import { GlobalService } from '../services/global.service';

function getHomeByRole(role: string): string {
  if (role === ROLES.SUPER_ADMIN) {
    return HOME_ROUTES.SUPER_ADMIN;
  }
  return HOME_ROUTES.ORG_ADMIN;
}

/**
 * UI-only route guard based on client-decoded JWT role.
 * This prevents navigation to unauthorized pages but is NOT a security boundary —
 * the server enforces role-based access on every API call.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const globalService = inject(GlobalService);
  const router = inject(Router);

  const userRole = globalService.getTokenDetails('role');

  if (!userRole) {
    router.navigate([AUTH_ROUTES.LOGIN]);
    return false;
  }

  // Super admin bypasses all checks
  if (userRole === ROLES.SUPER_ADMIN) {
    return true;
  }

  const allowedRoles: string[] = route.data['roles'];
  const requiredPermission: string = route.data['permission'];

  // Check system role first
  if (allowedRoles?.length > 0 && !allowedRoles.includes(userRole)) {
    router.navigate([getHomeByRole(userRole)]);
    return false;
  }

  // Check module-level permission if specified
  if (
    requiredPermission &&
    !globalService.hasPermission(requiredPermission)
  ) {
    router.navigate([getHomeByRole(userRole)]);
    return false;
  }

  return true;
};
