import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CATEGORY, GROUP } from 'src/app/constants/routes';
import { CategoryService } from 'src/app/modules/categories/services/category.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-view-group',
  templateUrl: './view-group.component.html',
  styleUrls: ['./view-group.component.scss'],
})
export class ViewGroupComponent implements OnInit {
  categoryId: string = '';
  orgId: string = '';
  groupData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private categoryService: CategoryService,
    private messageService: MessageService,
    private groupService: GroupService
  ) {}

  ngOnInit() {
    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadCategoryDetails();
  }

  loadCategoryDetails() {
    this.groupService.viewGroup(this.orgId, this.categoryId).subscribe({
      next: (response: any) => {
        this.groupData = response.data;
      },
      error: error => {
        console.error('Error loading group details:', error);
      },
    });
  }

  onEdit() {
    this.router.navigate([GROUP.EDIT, this.orgId, this.categoryId], {
      queryParams: {
        orgId: this.orgId,
        adminId: this.categoryId,
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
  }

  proceedDelete(): void {
    if (this.groupData) {
      this.groupService.deleteGroup(this.orgId, this.groupData.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Group deleted successfully',
          });
          this.router.navigate(['/app/group']);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete category',
          });
        },
        complete: () => {
          this.showDeleteConfirm = false;
        },
      });
    }
  }
}
