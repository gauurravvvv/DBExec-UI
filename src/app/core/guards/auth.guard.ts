import { Injectable } from '@angular/core';
import {
  CanActivate,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { LoginService } from 'src/app/core/services/login.service';
import { GlobalService } from '../services/global.service';
import { ROLES } from 'src/app/constants/user.constant';
import {
  HOME_ROUTES,
  AUTH_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: LoginService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  private getDefaultRouteByRole(): string {
    const role = this.globalService.getTokenDetails('role');
    if (role === ROLES.SUPER_ADMIN) {
      return HOME_ROUTES.SUPER_ADMIN;
    }
    if (role) {
      return HOME_ROUTES.ORG_ADMIN;
    }
    return AUTH_ROUTES.LOGIN;
  }

  private readonly AUTH_ONLY_ROUTES = [
    '/login',
    '/forgot-password',
    '/reset-password',
  ];

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    const isAuthPage = this.AUTH_ONLY_ROUTES.some(r => state.url.startsWith(r));
    if (isAuthPage) {
      if (this.authService.isLoggedIn()) {
        const homeRoute = this.getDefaultRouteByRole();
        this.router.navigate([homeRoute]);
        return false;
      }
      return true;
    }
    if (this.authService.isLoggedIn()) {
      return true;
    } else {
      this.router.navigate(['/login']);
      return false;
    }
  }
}
