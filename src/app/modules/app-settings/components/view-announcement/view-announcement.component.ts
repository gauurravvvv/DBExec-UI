import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ANNOUNCEMENT } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { AnnouncementService } from '../../services/announcement.service';

@Component({
  selector: 'app-view-announcement',
  templateUrl: './view-announcement.component.html',
  styleUrls: ['./view-announcement.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewAnnouncementComponent implements OnInit {
  announcementId = '';
  orgId = '';
  showDeleteConfirm = false;

  current = this.announcementService.current;
  saving = this.announcementService.saving;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private announcementService: AnnouncementService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.announcementId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.load();
  }

  load(): void {
    this.announcementService.resetCurrent();
    this.announcementService
      .loadOne(this.announcementId, this.orgId)
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  isActive(): boolean {
    const data = this.current();
    if (!data || data.status !== 1) return false;
    const now = new Date();
    if (data.startTime && new Date(data.startTime) > now) return false;
    if (data.endTime && new Date(data.endTime) < now) return false;
    return true;
  }

  onEdit(): void {
    this.router.navigate([ANNOUNCEMENT.EDIT, this.orgId, this.announcementId]);
  }

  goBack(): void {
    this.router.navigate([ANNOUNCEMENT.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    this.announcementService
      .delete(this.announcementId, this.orgId)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.router.navigate([ANNOUNCEMENT.LIST]);
        }
      })
      .catch(() => {})
      .finally(() => {
        this.showDeleteConfirm = false;
        this.cdr.markForCheck();
      });
  }
}
