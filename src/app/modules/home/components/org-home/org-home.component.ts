import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PermissionService } from 'src/app/core/services/permission.service';

@Component({
  selector: 'app-org-home',
  templateUrl: './org-home.component.html',
  styleUrls: ['./org-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgHomeComponent implements OnInit {
  userName = '';
  organisationName = '';
  isAdmin = false;

  constructor(
    private globalService: GlobalService,
    private permissionService: PermissionService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.userName = this.globalService.getTokenDetails('name') || '';
    this.organisationName =
      this.globalService.getTokenDetails('organisation') || '';
    // "Admin" surfaces extra cards on the org home dashboard. Detect
    // admin power by the ability to manage other users (FULL grant
    // on userManagement) rather than by a role string — keeps the
    // gate honest across custom roles and users in multiple groups.
    this.isAdmin = this.permissionService.canDelete(
      PERMISSIONS.USER_MANAGEMENT,
    );
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}
