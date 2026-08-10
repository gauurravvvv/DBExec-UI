import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SYSTEM_GROUP } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { SystemGroupService } from '../../services/system-group.service';

@Component({
  selector: 'app-view-system-group',
  templateUrl: './view-system-group.component.html',
  styleUrls: ['./view-system-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSystemGroupComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.groupService.cancelReads();
  }

  groupId: string = '';
  groupData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';
  // Skeleton gating + per-group delete spinner.
  loading = this.groupService.loading;
  isDeleting = (id: string): boolean => this.groupService.isDeleting(id);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groupService: SystemGroupService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.groupId = this.route.snapshot.params['id'];
    this.loadGroupDetails();
  }

  async loadGroupDetails() {
    await this.groupService.loadOne(this.groupId);
    this.groupData = this.groupService.current();
    this.cdr.markForCheck();
  }

  /**
   * Join the group's roles into a comma-separated display string.
   * Group ↔ Role is many-to-many, so the record carries `roles:
   * {id,name}[]`.
   */
  roleNames(): string {
    const roles = this.groupData?.roles ?? [];
    const names = roles.map((r: any) => r?.name).filter((n: any) => !!n);
    return names.length ? names.join(', ') : '';
  }

  onEdit() {
    this.router.navigate([SYSTEM_GROUP.edit(this.groupId)], {
      queryParams: {
        adminId: this.groupId,
      },
    });
  }

  goBack() {
    this.router.navigate([SYSTEM_GROUP.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  trackByIndex(index: number): number {
    return index;
  }

  async proceedDelete(): Promise<void> {
    if (this.groupData && this.deleteJustification.trim()) {
      const response = await this.groupService.delete(
        this.groupData.id,
        this.deleteJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showDeleteConfirm = false;
        this.deleteJustification = '';
        this.router.navigate([SYSTEM_GROUP.LIST]);
      }
    }
  }
}
