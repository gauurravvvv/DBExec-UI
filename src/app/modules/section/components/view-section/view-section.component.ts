import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION } from 'src/app/constants/routes';
import { SectionService } from '../../services/section.service';
import { GlobalService } from 'src/app/core/services/global.service';

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
    private sectionService: SectionService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.sectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadSectionDetails();
  }

  loadSectionDetails() {
    this.sectionService
      .viewSection(this.orgId, this.sectionId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.tabData = response.data;
        }
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
      this.sectionService
        .deleteSection(this.orgId, this.tabData.id)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate(['/app/section']);
          }
        });
    }
  }
}
