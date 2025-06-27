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
  DASHBOARD_ROUTES,
  AUTH_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: LoginService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  private getDefaultRouteByRole(): string {
    const role = this.globalService.getTokenDetails('role');
    switch (role) {
      case ROLES.SUPER_ADMIN:
        return DASHBOARD_ROUTES.SUPER_ADMIN;
      case ROLES.ORG_ADMIN:
        return DASHBOARD_ROUTES.ORG_ADMIN;
      case ROLES.ORG_USER:
        return DASHBOARD_ROUTES.ORG_USER;
      default:
        return AUTH_ROUTES.LOGIN;
    }
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    if (state.url === '/login') {
      if (this.authService.isLoggedIn()) {
        const dashboardRoute = this.getDefaultRouteByRole();
        this.router.navigate([dashboardRoute]);
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
