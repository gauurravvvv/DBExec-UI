import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CATEGORY } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { CategoryService } from '../../services/category.service';

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
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadCategoryDetails();
  }

  loadCategoryDetails() {
    this.categoryService
      .viewCategory(this.orgId, this.categoryId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.categoryData = response.data;
        }
      });
  }

  onEdit() {
    this.router.navigate([CATEGORY.EDIT, this.orgId, this.categoryId]);
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
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([CATEGORY.LIST]);
          }
        });
    }
  }
}
