import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Clipboard } from '@angular/cdk/clipboard';
import { CredentialService } from '../../services/credential.service';

interface CredentialDetails {
  id: number;
  organisationId: string;
  organisationName: string;
  category: {
    id: number;
    name: string;
    description: string;
  };
  values: Array<
    Array<{
      fieldName: string;
      value: string;
      configId: number;
      sequence: number;
    }>
  >;
  status: number;
  createdOn: string;
}

@Component({
  selector: 'app-view-credentials',
  templateUrl: './view-credentials.component.html',
  styleUrls: ['./view-credentials.component.scss'],
})
export class ViewCredentialsComponent implements OnInit {
  credentialDetails: CredentialDetails | null = null;
  showDeleteConfirm: boolean = false;
  selectedSetIndex: number | null = null;
  showValues: { [key: number]: boolean } = {}; // Track show/hide state for each row

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private credentialsService: CredentialService,
    private messageService: MessageService,
    private clipboard: Clipboard
  ) {}

  ngOnInit(): void {
    const orgId = this.route.snapshot.params['orgId'];
    const categoryId = this.route.snapshot.params['categoryId'];

    if (orgId && categoryId) {
      this.loadCredentialDetails(orgId, categoryId);
    }
  }

  loadCredentialDetails(orgId: string, categoryId: string): void {
    this.credentialsService.getCredential(orgId, categoryId).subscribe({
      next: response => {
        if (response.status && response.data) {
          this.credentialDetails = response.data;
        }
      },
      error: error => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load credential details',
        });
      },
    });
  }

  getFieldNames(): string[] {
    if (
      this.credentialDetails?.values &&
      this.credentialDetails.values.length > 0
    ) {
      return this.credentialDetails.values[0].map(field => field.fieldName);
    }
    return [];
  }

  copyValue(value: string): void {
    this.clipboard.copy(value);
    this.messageService.add({
      severity: 'success',
      summary: 'Copied',
      detail: 'Value copied to clipboard',
    });
  }

  onEdit(): void {
    if (this.credentialDetails) {
      this.router.navigate([
        '/app/credentials/edit',
        this.credentialDetails.id,
      ]);
    }
  }

  onDelete(): void {
    this.showDeleteConfirm = true;
  }

  onEditSet(index: number): void {
    if (this.credentialDetails) {
      this.router.navigate(
        ['/app/credentials/edit', this.credentialDetails.id],
        {
          queryParams: { setIndex: index },
        }
      );
    }
  }

  onDeleteSet(index: number): void {
    this.selectedSetIndex = index;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedSetIndex = null;
  }

  confirmDelete(): void {
    if (this.credentialDetails) {
      if (this.selectedSetIndex !== null) {
        // Delete specific set
        this.deleteCredentialSet(this.selectedSetIndex);
      } else {
        // Delete entire credential
        this.deleteCredential();
      }
    }
  }

  private deleteCredentialSet(index: number): void {
    if (this.credentialDetails) {
      //   this.credentialsService
      //     .deleteCredentialSet(this.credentialDetails.id, index)
      //     .subscribe({
      //       next: () => {
      //         this.messageService.add({
      //           severity: 'success',
      //           summary: 'Success',
      //           detail: 'Credential set deleted successfully',
      //         });
      //         this.loadCredentialDetails(this.credentialDetails!.id);
      //       },
      //       error: error => {
      //         this.messageService.add({
      //           severity: 'error',
      //           summary: 'Error',
      //           detail: 'Failed to delete credential set',
      //         });
      //       },
      //       complete: () => {
      //         this.showDeleteConfirm = false;
      //         this.selectedSetIndex = null;
      //       },
      //     });
    }
  }

  private deleteCredential(): void {
    if (this.credentialDetails) {
      // this.credentialsService
      //   .deleteCredential(this.credentialDetails.id)
      //   .subscribe({
      //     next: () => {
      //       this.messageService.add({
      //         severity: 'success',
      //         summary: 'Success',
      //         detail: 'Credentials deleted successfully',
      //       });
      //       this.router.navigate(['/app/credentials']);
      //     },
      //     error: error => {
      //       this.messageService.add({
      //         severity: 'error',
      //         summary: 'Error',
      //         detail: 'Failed to delete credentials',
      //       });
      //     },
      //     complete: () => {
      //       this.showDeleteConfirm = false;
      //     },
      //   });
    }
  }

  copyRow(set: any[]): void {
    try {
      // Create a formatted string with field names and values
      const textToCopy = set
        .map(field => `${field.fieldName}: ${field.value}`)
        .join('\n');

      this.clipboard.copy(textToCopy);

      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Credential set copied to clipboard',
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to copy credentials',
      });
    }
  }

  // Add new method to toggle visibility
  toggleValues(index: number): void {
    this.showValues[index] = !this.showValues[index];
  }
}
