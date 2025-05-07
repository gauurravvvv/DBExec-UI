import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PROMPT } from 'src/app/constants/routes';
import { PromptService } from '../../services/prompt.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-view-prompt',
  templateUrl: './view-prompt.component.html',
  styleUrls: ['./view-prompt.component.scss'],
})
export class ViewPromptComponent implements OnInit {
  promptId: string = '';
  orgId: string = '';
  promptData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private promptService: PromptService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadPromptData();
  }

  loadPromptData() {
    this.promptService.viewPrompt(this.orgId, this.promptId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.promptData = response.data;
      }
    });
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
  }

  proceedDelete(): void {
    if (this.promptData) {
      this.promptService
        .deletePrompt(this.orgId, this.promptId)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([PROMPT.LIST]);
          }
        });
    }
  }
}
