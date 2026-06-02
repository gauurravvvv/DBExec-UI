import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-view-tab',
  templateUrl: './view-tab.component.html',
  styleUrls: ['./view-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewTabComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.tabService.cancelReads();
  }

  private cdr = inject(ChangeDetectorRef);

  tabId: string = '';
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
    this.loadTabDetails();
  }

  async loadTabDetails(): Promise<void> {
    this.tabService.resetCurrent();
    await this.tabService.loadOne(this.tabId);
    const data = this.tabService.current();
    if (data) {
      this.tabData = data;
    }
    this.cdr.markForCheck();
  }

  onEdit() {
    this.router.navigate([TAB.edit(this.tabId)]);
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
        .deleteTab(this.tabData.id, this.deleteJustification.trim())
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
