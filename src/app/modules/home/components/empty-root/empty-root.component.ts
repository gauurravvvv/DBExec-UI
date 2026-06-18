import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { LoginService } from 'src/app/core/services/login.service';
import { PermissionService } from 'src/app/core/services/permission.service';

/**
 * Empty root for /app/home — redirects the user to the right home
 * variant based on their permissions:
 *   - canRead(systemAdmin) → /app/home/system-admin (platform operator)
 *   - otherwise            → /app/home/org           (org user)
 *
 * No role-string check anywhere — a user can belong to multiple
 * groups carrying multiple roles, so picking a single "primary role"
 * is unsafe. Permissions aggregate across every group via the
 * resolveUserPermissions UNION on the BE.
 */
@Component({
  selector: 'app-empty-root',
  templateUrl: './empty-root.component.html',
  styleUrls: ['./empty-root.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyRootComponent implements OnInit {
  constructor(
    private router: Router,
    private loginService: LoginService,
    private permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    if (!this.loginService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    const target = this.permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)
      ? '/app/home/system-admin'
      : '/app/home/org';
    this.router.navigate([target]);
  }
}
