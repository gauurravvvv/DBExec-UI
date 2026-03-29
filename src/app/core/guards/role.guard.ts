import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { GlobalService } from '../services/global.service';
import {
  DASHBOARD_ROUTES,
  AUTH_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';
import { ROLES } from 'src/app/constants/user.constant';

@Injectable({
  providedIn: 'root',
})
export class RoleGuard implements CanActivate {
  constructor(
    private globalService: GlobalService,
    private router: Router,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    const userRole = this.globalService.getTokenDetails('role');

    if (!userRole) {
      this.router.navigate([AUTH_ROUTES.LOGIN]);
      return false;
    }

    // Super admin has access to everything
    if (userRole === ROLES.SUPER_ADMIN) {
      return true;
    }

    const allowedRoles: string[] = route.data['roles'];

    // If no roles specified, allow all authenticated users
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    if (allowedRoles.includes(userRole)) {
      return true;
    }

    // Redirect to user's own dashboard
    const dashboardRoute = this.getDashboardByRole(userRole);
    this.router.navigate([dashboardRoute]);
    return false;
  }

  private getDashboardByRole(role: string): string {
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
}
