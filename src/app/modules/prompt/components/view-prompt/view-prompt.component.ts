import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PROMPT } from 'src/app/constants/routes';
import { PromptService } from '../../services/prompt.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-view-prompt',
  templateUrl: './view-prompt.component.html',
  styleUrls: ['./view-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewPromptComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  promptId: string = '';
  orgId: string = '';
  promptData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private promptService: PromptService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadPromptData();
  }

  loadPromptData() {
    this.promptService.resetCurrent();
    this.promptService.loadOne(this.orgId, this.promptId).then(() => {
      const data = this.promptService.current();
      if (data) {
        this.promptData = data;
      }
      this.cdr.markForCheck();
    }).catch(() => { this.cdr.markForCheck(); });
  }

  onEdit() {
    this.router.navigate([PROMPT.EDIT, this.orgId, this.promptId]);
  }

  goBack() {
    this.router.navigate([PROMPT.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (this.promptData && this.deleteJustification.trim()) {
      this.promptService
        .delete(
          this.orgId,
          this.promptId,
          this.deleteJustification.trim(),
        )
        .then(response => {
          this.showDeleteConfirm = false;
          this.deleteJustification = '';
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.showDeleteConfirm = false;
          this.deleteJustification = '';
          this.cdr.markForCheck();
        });
    }
  }
}
