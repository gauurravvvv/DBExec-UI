import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ROLE } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-view-role',
  templateUrl: './view-role.component.html',
  styleUrls: ['./view-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewRoleComponent implements OnInit {
  roleData: any = null;
  permissions: any[] = [];
  roleId: string = '';
  orgId: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private roleService: RoleService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.roleId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadRole();
  }

  loadRole() {
    this.roleService.viewRole(this.orgId, this.roleId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.roleData = response.data;
        try {
          this.permissions = JSON.parse(this.roleData.permissions || '[]');
        } catch {
          this.permissions = [];
        }
        this.cdr.markForCheck();
      }
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  onEdit() {
    this.router.navigate([ROLE.EDIT, this.orgId, this.roleId]);
  }

  goBack() {
    this.router.navigate([ROLE.LIST]);
  }
}
