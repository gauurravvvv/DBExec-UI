import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB } from 'src/app/constants/routes';
import { TabService } from '../../services/tab.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-view-tab',
  templateUrl: './view-tab.component.html',
  styleUrls: ['./view-tab.component.scss'],
})
export class ViewTabComponent implements OnInit {
  tabId: string = '';
  orgId: string = '';
  tabData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tabService: TabService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.tabId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadTabDetails();
  }

  loadTabDetails() {
    this.tabService.viewTab(this.orgId, this.tabId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabData = response.data;
      }
    });
  }

  onEdit() {
    this.router.navigate([TAB.EDIT, this.orgId, this.tabId], {
      queryParams: {
        orgId: this.orgId,
        adminId: this.tabId,
      },
    });
  }

  goBack() {
    this.router.navigate([TAB.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.tabData) {
      this.tabService.deleteTab(this.orgId, this.tabData.id).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([TAB.LIST]);
        }
      });
    }
  }
}
