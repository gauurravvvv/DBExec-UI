import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import { LoginService } from 'src/app/core/services/login.service';
import {
  AUTH_ROUTES,
  HOME_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';
import { GlobalService } from '../services/global.service';

const AUTH_ONLY_ROUTES = ['/login', '/forgot-password', '/reset-password'];

function getDefaultRouteByRole(globalService: GlobalService): string {
  const role = globalService.getTokenDetails('role');
  if (role === ROLES.SUPER_ADMIN) {
    return HOME_ROUTES.SUPER_ADMIN;
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

  const isAuthPage = AUTH_ONLY_ROUTES.some(r => state.url.startsWith(r));
  if (isAuthPage) {
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
