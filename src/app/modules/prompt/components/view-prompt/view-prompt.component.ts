import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PROMPT } from 'src/app/constants/routes';
import { MessageService } from 'primeng/api';
import { PromptService } from '../../services/prompt.service';

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
    private messageService: MessageService,
    private promptService: PromptService
  ) {}

  ngOnInit() {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadPromptData();
  }

  loadPromptData() {
    this.promptService.viewPrompt(this.orgId, this.promptId).subscribe({
      next: (response: any) => {
        this.promptData = response.data;
      },
      error: error => {
        console.error('Error loading category details:', error);
      },
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
      this.promptService.deletePrompt(this.orgId, this.promptId).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Prompt deleted successfully',
          });
          this.router.navigate(['/app/prompt']);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete prompt',
          });
        },
        complete: () => {
          this.showDeleteConfirm = false;
        },
      });
    }
  }
}
