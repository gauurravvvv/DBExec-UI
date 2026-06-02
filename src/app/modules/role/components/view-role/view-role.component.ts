import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ROLE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-view-role',
  templateUrl: './view-role.component.html',
  styleUrls: ['./view-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewRoleComponent implements OnInit, OnDestroy {
  roleData: any = null;
  permissions: any[] = [];
  roleId: string = '';
  // Drives the centered content-loader while the initial GET is in flight.
  loading = this.roleService.loading;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private roleService: RoleService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.roleId = this.route.snapshot.params['id'];
    this.loadRole();
  }

  ngOnDestroy() {
    // Abort any in-flight loadOne GET so navigating away mid-load
    // doesn't leave a request running that lands in a destroyed
    // component and clobbers the next page's roleService.current().
    this.roleService.cancelReads();
  }

  async loadRole() {
    await this.roleService.loadOne(this.roleId);
    const data = this.roleService.current();
    if (data) {
      this.roleData = data;
      try {
        this.permissions = JSON.parse(this.roleData.permissions || '[]');
      } catch {
        this.permissions = [];
      }
      this.cdr.markForCheck();
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  onEdit() {
    this.router.navigate([ROLE.edit(this.roleId)]);
  }

  goBack() {
    this.router.navigate([ROLE.LIST]);
  }
}
