import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/core/layout/sidebar/sidebar.constant';
import { LoginService } from 'src/app/core/services/login.service';
import { PermissionService } from '../services/permission.service';

// Routes a NOT-logged-in user is allowed to visit. Visiting any of
// these while already logged in bounces back to the role's home.
const UNAUTHENTICATED_ONLY_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
];

// /relay is auth-area but logged-in-only — the user JUST logged in
// via phase 1 and is on their way to home. We treat it as a normal
// authenticated route: must be logged in, never bounce away.
const POST_LOGIN_ROUTES = ['/relay'];

/**
 * Pick a logged-in user's default route from their permissions, not
 * from a role string. Only the platform System Admin role can read
 * `systemAdmin`, so it's the authoritative "is this a platform
 * operator?" signal. Org admins + org users share the org home.
 */
function getDefaultRouteByPermissions(
  authService: LoginService,
  permissionService: PermissionService,
): string {
  if (!authService.isLoggedIn()) return AUTH_ROUTES.LOGIN;
  return permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)
    ? HOME_ROUTES.SYSTEM_ADMIN
    : HOME_ROUTES.ORG_ADMIN;
}

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(LoginService);
  const router = inject(Router);
  const permissionService = inject(PermissionService);

  // /relay: must be authenticated (phase 1 set the access token);
  // never redirect away even though we're "logged in".
  const isPostLogin = POST_LOGIN_ROUTES.some(r => state.url.startsWith(r));
  if (isPostLogin) {
    if (authService.isLoggedIn()) return true;
    router.navigate(['/login']);
    return false;
  }

  const isUnauthOnly = UNAUTHENTICATED_ONLY_ROUTES.some(r =>
    state.url.startsWith(r),
  );
  if (isUnauthOnly) {
    if (authService.isLoggedIn()) {
      const homeRoute = getDefaultRouteByPermissions(
        authService,
        permissionService,
      );
      router.navigate([homeRoute]);
      return false;
    }
    return true;
  }
  if (authService.isLoggedIn()) {
    return true;
  } else {
    router.navigate(['/login']);
    return false;
  }
};
