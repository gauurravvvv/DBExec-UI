import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SYSTEM_ROLE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { AccessLevelEntry, PermissionModule } from '../../system-role.types';
import { SystemRoleService } from '../../services/system-role.service';

/**
 * View System Role — read-only adaptation of the permission grid.
 *
 * Same layout as Add/Edit System Role but each leaf row shows a single
 * label/chip for its current level instead of radio buttons. Leaves
 * with level 0 (no current grant) still render so the user can see
 * the complete permission surface — they're shown with a muted "None"
 * chip rather than hidden.
 */
@Component({
  selector: 'app-view-system-role',
  templateUrl: './view-system-role.component.html',
  styleUrls: ['./view-system-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSystemRoleComponent implements OnInit, OnDestroy {
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
    private roleService: SystemRoleService,
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
          scope: 'SYSTEM',
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
    this.router.navigate([SYSTEM_ROLE.edit(this.roleId)]);
  }

  goBack() {
    this.router.navigate([SYSTEM_ROLE.LIST]);
  }

  trackByModuleId(_: number, item: PermissionModule): string {
    return item.id;
  }

  trackByLeafId(_: number, item: { id: string }): string {
    return item.id;
  }
}
