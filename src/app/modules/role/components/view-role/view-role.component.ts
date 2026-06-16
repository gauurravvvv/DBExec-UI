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
import { AccessLevelEntry, PermissionModule } from '../../role.types';
import { RoleService } from '../../services/role.service';

/**
 * View Role — read-only adaptation of the permission grid.
 *
 * Same layout as Add/Edit Role but each leaf row shows a single
 * label/chip for its current level instead of radio buttons. Leaves
 * with level 0 (no current grant) still render so the user can see
 * the complete permission surface — they're shown with a muted "None"
 * chip rather than hidden.
 */
@Component({
  selector: 'app-view-role',
  templateUrl: './view-role.component.html',
  styleUrls: ['./view-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewRoleComponent implements OnInit, OnDestroy {
  roleData: any = null;
  modules: PermissionModule[] = [];
  accessLevels: AccessLevelEntry[] = [];
  /** value → label, computed once after access levels load. */
  levelLabelByValue: Record<number, string> = {};
  /** value → CSS modifier code (none/read/write/full) for chip colour. */
  levelCodeByValue: Record<number, string> = {};

  roleId = '';
  loadingMeta = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private roleService: RoleService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.roleId = this.route.snapshot.params['id'];
    this.loadAll();
  }

  ngOnDestroy() {
    this.roleService.cancelReads();
  }

  async loadAll() {
    this.loadingMeta = true;
    this.cdr.markForCheck();
    try {
      const [role, levels, modules] = await Promise.all([
        this.roleService.get(this.roleId),
        this.roleService.listAccessLevels(),
        this.roleService.listPermissions({
          scope: 'ORG',
          roleId: this.roleId,
        }),
      ]);

      this.roleData = role;
      this.accessLevels = [...(levels || [])].sort(
        (a, b) => a.sequence - b.sequence,
      );
      for (const lvl of this.accessLevels) {
        this.levelLabelByValue[lvl.value] = lvl.label;
        this.levelCodeByValue[lvl.value] = (lvl.code || '').toLowerCase();
      }

      this.modules = (modules || [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map(m => ({
          ...m,
          submodules: (m.submodules || [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence),
        }));
    } finally {
      this.loadingMeta = false;
      this.cdr.markForCheck();
    }
  }

  levelLabel(level: number | undefined): string {
    return this.levelLabelByValue[level ?? 0] ?? '';
  }

  levelCode(level: number | undefined): string {
    return this.levelCodeByValue[level ?? 0] || 'none';
  }

  onEdit() {
    this.router.navigate([ROLE.edit(this.roleId)]);
  }

  goBack() {
    this.router.navigate([ROLE.LIST]);
  }

  trackByModuleId(_: number, item: PermissionModule): string {
    return item.id;
  }

  trackByLeafId(_: number, item: { id: string }): string {
    return item.id;
  }
}
