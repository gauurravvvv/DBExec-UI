import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION } from 'src/app/constants/routes';
import { SectionService } from '../../services/section.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-view-section',
  templateUrl: './view-section.component.html',
  styleUrls: ['./view-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSectionComponent implements OnInit {
  sectionId: string = '';
  orgId: string = '';
  tabData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sectionService: SectionService,
    private globalService: GlobalService,
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
      this.sectionService
        .deleteSection(
          this.orgId,
          this.tabData.id,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.deleteJustification = '';
            this.router.navigate(['/app/section']);
          }
        });
    }
  }
}
