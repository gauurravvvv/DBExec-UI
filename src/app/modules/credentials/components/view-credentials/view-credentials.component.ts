import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Clipboard } from '@angular/cdk/clipboard';
import { CredentialService } from '../../services/credential.service';
import { CREDENTIAL } from 'src/app/constants/routes';
import { saveAs } from 'file-saver';

interface CredentialValue {
  fieldName: string;
  value: string;
  configId: number;
  sequence: number;
}

interface CredentialSet {
  credentialId: number;
  values: CredentialValue[];
}

interface CredentialDetails {
  id: number;
  organisationId: string;
  organisationName: string;
  category: {
    name: string;
    description: string;
  };
  values: CredentialSet[];
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
  showAllDeleteConfirm: boolean = false;
  selectedCredentialId: number | null = null;
  showValues: { [key: number]: boolean } = {};
  selectedOrgId: string = '';
  selectedCategoryId: string = '';
  showEditDialog: boolean = false;
  selectedCredential: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private credentialsService: CredentialService,
    private messageService: MessageService,
    private clipboard: Clipboard
  ) {}

  ngOnInit(): void {
    this.selectedOrgId = this.route.snapshot.params['orgId'];
    this.selectedCategoryId = this.route.snapshot.params['categoryId'];

    if (this.selectedOrgId && this.selectedCategoryId) {
      this.loadCredentialDetails(this.selectedOrgId, this.selectedCategoryId);
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
      return this.credentialDetails.values[0].values.map(
        field => field.fieldName
      );
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

  onDownload(): void {
    if (!this.selectedOrgId) return;

    this.credentialsService
      .downloadCredentials(this.selectedOrgId, this.selectedCategoryId)
      .subscribe({
        next: (response: Blob) => {
          const filename = `Credentials_${this.credentialDetails?.organisationName}.xlsx`;
          saveAs(response, filename);
        },
        error: error => {
          console.error('Error downloading credentials:', error);
        },
      });
  }

  onDelete(): void {
    console.log('asdsad');
    this.showAllDeleteConfirm = true;
  }

  cancelAllDelete(): void {
    this.showAllDeleteConfirm = false;
  }

  confirmAllDelete() {
    this.credentialsService
      .deleteAllCredential(this.selectedOrgId, this.selectedCategoryId)
      .subscribe({
        next: () => {
          this.showAllDeleteConfirm = false;
          this.router.navigate([CREDENTIAL.LIST]);
        },
        error: error => {
          console.error('Error deleting credentials', error);
          this.showAllDeleteConfirm = false;
        },
      });
  }

  onEditSet(set: any) {
    this.selectedCredential = {
      ...set,
      organisationName: this.credentialDetails?.organisationName,
      category: this.credentialDetails?.category,
    };
    this.showEditDialog = true;
  }

  onDeleteSet(credentialId: number): void {
    this.selectedCredentialId = credentialId;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedCredentialId = null;
  }

  confirmDelete(): void {
    if (this.credentialDetails) {
      if (this.selectedCredentialId !== null) {
        this.credentialsService
          .deleteCredential(
            this.credentialDetails.organisationId,
            this.selectedCredentialId.toString()
          )
          .subscribe({
            next: () => {
              this.showDeleteConfirm = false;
              this.selectedCredentialId = null;
              this.loadCredentialDetails(
                this.selectedOrgId,
                this.selectedCategoryId
              );
            },
            error: error => {
              console.error('Error deleting organisation user:', error);
              this.showDeleteConfirm = false;
              this.selectedCredentialId = null;
            },
          });
      }
    }
  }

  copyRow(set: CredentialSet): void {
    try {
      const textToCopy = set.values
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

  toggleValues(index: number): void {
    this.showValues[index] = !this.showValues[index];
  }

  onEditDialogClose(updatedData?: any) {
    this.showEditDialog = false;
    if (updatedData) {
      this.loadCredentialDetails(this.selectedOrgId, this.selectedCategoryId);
    }
  }
}
