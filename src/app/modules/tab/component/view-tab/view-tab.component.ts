import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB } from 'src/app/constants/routes';
import { MessageService } from 'primeng/api';
import { TabService } from '../../services/tab.service';

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
    private messageService: MessageService,
    private tabService: TabService
  ) {}

  ngOnInit() {
    this.tabId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadTabDetails();
  }

  loadTabDetails() {
    this.tabService.viewTab(this.orgId, this.tabId).subscribe({
      next: (response: any) => {
        this.tabData = response.data;
      },
      error: error => {
        console.error('Error loading category details:', error);
      },
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
      this.tabService.deleteTab(this.orgId, this.tabData.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Tab deleted successfully',
          });
          this.router.navigate(['/app/tab']);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete tab',
          });
        },
        complete: () => {
          this.showDeleteConfirm = false;
        },
      });
    }
  }
}
