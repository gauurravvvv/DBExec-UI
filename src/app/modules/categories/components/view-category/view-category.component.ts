import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CATEGORY } from 'src/app/constants/routes';
import { CategoryService } from '../../services/category.service';

@Component({
  selector: 'app-view-category',
  templateUrl: './view-category.component.html',
  styleUrls: ['./view-category.component.scss'],
})
export class ViewCategoryComponent implements OnInit {
  categoryId: string = '';
  categoryData: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private categoryService: CategoryService
  ) {}

  ngOnInit() {
    this.categoryId = this.route.snapshot.params['id'];
    this.loadCategoryDetails();
  }

  loadCategoryDetails() {
    this.categoryService.viewCategory(this.categoryId).subscribe({
      next: (response: any) => {
        this.categoryData = response.data;
      },
      error: error => {
        console.error('Error loading category details:', error);
      },
    });
  }

  onEdit() {
    this.router.navigate([CATEGORY.EDIT, this.categoryId]);
  }

  goBack() {
    this.router.navigate([CATEGORY.LIST]);
  }
}
