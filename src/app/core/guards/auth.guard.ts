import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROLES } from 'src/app/core/constants/user.constant';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/core/layout/sidebar/sidebar.constant';
import { LoginService } from 'src/app/core/services/login.service';
import { GlobalService } from '../services/global.service';

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

function getDefaultRouteByRole(globalService: GlobalService): string {
  const role = globalService.getTokenDetails('role');
  if (role === ROLES.SYSTEM_ADMIN) {
    return HOME_ROUTES.SYSTEM_ADMIN;
  }
  if (role) {
    return HOME_ROUTES.ORG_ADMIN;
  }
  return AUTH_ROUTES.LOGIN;
}

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(LoginService);
  const router = inject(Router);
  const globalService = inject(GlobalService);

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
      const homeRoute = getDefaultRouteByRole(globalService);
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
