import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { GlobalService } from '../services/global.service';
import {
  HOME_ROUTES,
  AUTH_ROUTES,
} from 'src/app/shared/components/layout/sidebar/sidebar.constant';
import { ROLES } from 'src/app/constants/user.constant';

@Injectable({
  providedIn: 'root',
})
/**
 * UI-only route guard based on client-decoded JWT role.
 * This prevents navigation to unauthorized pages but is NOT a security boundary —
 * the server enforces role-based access on every API call.
 */
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

    // Super admin bypasses all checks
    if (userRole === ROLES.SUPER_ADMIN) {
      return true;
    }

    const allowedRoles: string[] = route.data['roles'];
    const requiredPermission: string = route.data['permission'];

    // Check system role first
    if (allowedRoles?.length > 0 && !allowedRoles.includes(userRole)) {
      this.router.navigate([this.getHomeByRole(userRole)]);
      return false;
    }

    // Check module-level permission if specified
    if (
      requiredPermission &&
      !this.globalService.hasPermission(requiredPermission)
    ) {
      this.router.navigate([this.getHomeByRole(userRole)]);
      return false;
    }

    return true;
  }

  private getHomeByRole(role: string): string {
    if (role === ROLES.SUPER_ADMIN) {
      return HOME_ROUTES.SUPER_ADMIN;
    }
    return HOME_ROUTES.ORG_ADMIN;
  }
}
