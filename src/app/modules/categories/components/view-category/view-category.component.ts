import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CATEGORY } from 'src/app/constants/routes';
import { CategoryService } from '../../services/category.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-view-category',
  templateUrl: './view-category.component.html',
  styleUrls: ['./view-category.component.scss'],
})
export class ViewCategoryComponent implements OnInit {
  categoryId: string = '';
  orgId: string = '';
  categoryData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private categoryService: CategoryService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadCategoryDetails();
  }

  loadCategoryDetails() {
    this.categoryService.viewCategory(this.orgId, this.categoryId).subscribe({
      next: (response: any) => {
        this.categoryData = response.data;
      },
      error: error => {
        console.error('Error loading category details:', error);
      },
    });
  }

  onEdit() {
    this.router.navigate([CATEGORY.EDIT, this.orgId, this.categoryId], {
      queryParams: {
        orgId: this.orgId,
        adminId: this.categoryId,
      },
    });
  }

  goBack() {
    this.router.navigate([CATEGORY.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.categoryData) {
      this.categoryService
        .deleteCategory(this.orgId, this.categoryData.id)
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Category deleted successfully',
            });
            this.router.navigate(['/app/category']);
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
