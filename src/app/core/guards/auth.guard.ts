import { Injectable } from '@angular/core';
import {
  CanActivate,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { LoginService } from 'src/app/modules/auth/services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private authService: LoginService, private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    // If trying to access login page
    if (state.url === '/login') {
      // If already logged in, redirect to home
      if (this.authService.isLoggedIn()) {
        this.router.navigate(['/home/dashboard']);
        return false;
      }
      // Allow access to login page if not logged in
      return true;
    }

    // For all other routes, check authentication
    if (this.authService.isLoggedIn()) {
      return true;
    } else {
      this.router.navigate(['/login']);
      return false;
    }
  }
}
