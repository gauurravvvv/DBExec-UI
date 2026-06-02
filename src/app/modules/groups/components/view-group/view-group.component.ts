import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GROUP } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-view-group',
  templateUrl: './view-group.component.html',
  styleUrls: ['./view-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewGroupComponent implements OnInit, OnDestroy {
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
    private groupService: GroupService,
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

  onEdit() {
    this.router.navigate([GROUP.edit(this.groupId)], {
      queryParams: {
        adminId: this.groupId,
      },
    });
  }

  goBack() {
    this.router.navigate([GROUP.LIST]);
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
        this.router.navigate([GROUP.LIST]);
      }
    }
  }
}
