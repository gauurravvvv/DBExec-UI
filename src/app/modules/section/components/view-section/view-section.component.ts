import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION } from 'src/app/constants/routes';
import { MessageService } from 'primeng/api';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-view-section',
  templateUrl: './view-section.component.html',
  styleUrls: ['./view-section.component.scss'],
})
export class ViewSectionComponent implements OnInit {
  sectionId: string = '';
  orgId: string = '';
  tabData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private sectionService: SectionService
  ) {}

  ngOnInit() {
    this.sectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadSectionDetails();
  }

  loadSectionDetails() {
    this.sectionService.viewSection(this.orgId, this.sectionId).subscribe({
      next: (response: any) => {
        this.tabData = response.data;
      },
      error: error => {
        console.error('Error loading category details:', error);
      },
    });
  }

  onEdit() {
    this.router.navigate([SECTION.EDIT, this.orgId, this.sectionId]);
  }

  goBack() {
    this.router.navigate([SECTION.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.tabData) {
      this.sectionService.deleteSection(this.orgId, this.tabData.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Section deleted successfully',
          });
          this.router.navigate(['/app/section']);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete section',
          });
        },
        complete: () => {
          this.showDeleteConfirm = false;
        },
      });
    }
  }
}
