import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
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
  data: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private announcementService: AnnouncementService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.announcementId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.load();
  }

  load(): void {
    this.announcementService
      .details(this.announcementId, this.orgId)
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.data = res.data;
        }
      });
  }

  isActive(): boolean {
    if (!this.data || this.data.status !== 1) return false;
    const now = new Date();
    if (this.data.startTime && new Date(this.data.startTime) > now)
      return false;
    if (this.data.endTime && new Date(this.data.endTime) < now) return false;
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
      .finally(() => (this.showDeleteConfirm = false));
  }
}
