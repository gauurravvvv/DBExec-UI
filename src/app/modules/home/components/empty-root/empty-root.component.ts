import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PermissionService } from 'src/app/core/services/permission.service';

/**
 * Empty root for /app/home — redirects the user to the right home
 * variant based on their permissions:
 *   - canRead(systemAdmin) → /app/home/system-admin (platform operator)
 *   - otherwise            → /app/home/org           (org user)
 *
 * The role string in the JWT is the role NAME (e.g. "System Admin",
 * "Administrator") which is a display label, not a behavioural gate.
 * Permissions are the only authoritative signal for "what should
 * this user see?".
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
    private globalService: GlobalService,
    private permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    const role = this.globalService.getTokenDetails('role');
    if (!role) {
      this.router.navigate(['/login']);
      return;
    }

    const target = this.permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)
      ? '/app/home/system-admin'
      : '/app/home/org';
    this.router.navigate([target]);
  }
}
