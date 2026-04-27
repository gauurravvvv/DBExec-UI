import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SECTION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-view-section',
  templateUrl: './view-section.component.html',
  styleUrls: ['./view-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSectionComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  saving = this.sectionService.saving;

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
    this.sectionService.resetCurrent();
    this.sectionService
      .loadOne(this.orgId, this.sectionId)
      .then(() => {
        const data = this.sectionService.current();
        if (data) {
          this.tabData = data;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
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
        .delete(this.orgId, this.tabData.id, this.deleteJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.deleteJustification = '';
            this.router.navigate([SECTION.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => {
          this.showDeleteConfirm = false;
          this.cdr.markForCheck();
        });
    }
  }
}
