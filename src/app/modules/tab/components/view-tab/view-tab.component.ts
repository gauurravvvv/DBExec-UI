import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB } from 'src/app/constants/routes';
import { TabService } from '../../services/tab.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-view-tab',
  templateUrl: './view-tab.component.html',
  styleUrls: ['./view-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewTabComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  tabId: string = '';
  orgId: string = '';
  tabData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tabService: TabService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.tabId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadTabDetails();
  }

  async loadTabDetails(): Promise<void> {
    this.tabService.resetCurrent();
    await this.tabService.loadOne(this.orgId, this.tabId);
    const data = this.tabService.current();
    if (data) {
      this.tabData = data;
    }
    this.cdr.markForCheck();
  }

  onEdit() {
    this.router.navigate([TAB.EDIT, this.orgId, this.tabId]);
  }

  goBack() {
    this.router.navigate([TAB.LIST]);
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (this.tabData && this.deleteJustification.trim()) {
      this.tabService
        .deleteTab(this.orgId, this.tabData.id, this.deleteJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.deleteJustification = '';
            this.router.navigate([TAB.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          // global interceptor already shows error toast; ensure UI recovers
          this.cdr.markForCheck();
        });
    }
  }
}
