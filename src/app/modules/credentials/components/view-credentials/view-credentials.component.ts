import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Clipboard } from '@angular/cdk/clipboard';
import { CredentialService } from '../../services/credential.service';
import { CREDENTIAL } from 'src/app/constants/routes';
import { saveAs } from 'file-saver';
import { GlobalService } from 'src/app/core/services/global.service';

interface CredentialValue {
  fieldName: string;
  value: string;
  configId: number;
  sequence: number;
}

interface CredentialSet {
  credentialId: number;
  values: CredentialValue[];
  visibility: number;
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
  showCopyIcon: string = '';
  showAllValues: boolean = false;

  // Pagination properties
  currentPage: number = 1;
  pageSize: number = 10;
  totalItems: number = 0;
  totalPages: number = 0;
  pages: number[] = [];
  Math = Math; // For using Math in template

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private credentialsService: CredentialService,
    private messageService: MessageService,
    private clipboard: Clipboard,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.selectedOrgId = this.route.snapshot.params['orgId'];
    this.selectedCategoryId = this.route.snapshot.params['categoryId'];

    if (this.selectedOrgId && this.selectedCategoryId) {
      this.loadCredentialDetails(this.selectedOrgId, this.selectedCategoryId);
    }
  }

  loadCredentialDetails(orgId: string, categoryId: string): void {
    this.credentialsService.getCredential(orgId, categoryId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.credentialDetails = response.data;
        this.totalItems = this.credentialDetails?.values?.length || 0;
        this.updatePagination();
      }
    });
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.totalItems / this.pageSize);
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number): void {
    this.currentPage = page;
  }

  get paginatedCredentials(): any[] {
    if (!this.credentialDetails?.values) return [];

    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.credentialDetails.values.slice(start, end);
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
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          const filename = `Credentials_${this.credentialDetails?.organisationName}.xlsx`;
          saveAs(response, filename);
        }
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
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.showAllDeleteConfirm = false;
          this.router.navigate([CREDENTIAL.LIST]);
        }
      });
  }

  onEditSet(set: any) {
    console.log(set);
    this.selectedCredential = {
      ...set,
      organisationName: this.credentialDetails?.organisationName,
      organisationId: this.credentialDetails?.organisationId,
      category: this.credentialDetails?.category,
    };
    console.log(this.selectedCredential);
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
          .then(response => {
            if (this.globalService.handleSuccessService(response)) {
              this.showDeleteConfirm = false;
              this.selectedCredentialId = null;
              this.loadCredentialDetails(
                this.selectedOrgId,
                this.selectedCategoryId
              );
            }
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
    //call update secrets api
    if (updatedData) {
      this.credentialsService.editCredential(updatedData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.loadCredentialDetails(
            this.selectedOrgId,
            this.selectedCategoryId
          );
        }
      });
    }
  }

  copyField(fieldName: string, value: string): void {
    const textToCopy = `${fieldName}: ${value}`;
    this.clipboard.copy(textToCopy);

    this.messageService.add({
      severity: 'success',
      summary: 'Copied',
      detail: `${fieldName} copied to clipboard`,
    });
  }

  changeVisibility(credentialId: number): void {
    this.credentialsService
      .changeVisibility(this.selectedOrgId, credentialId.toString())
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.loadCredentialDetails(
            this.selectedOrgId,
            this.selectedCategoryId
          );
        }
      });
  }

  toggleAllValues() {
    this.showAllValues = !this.showAllValues;
    // Fill all values in showValues array with the new state
    this.showValues = this.paginatedCredentials.map(() => this.showAllValues);
  }
}
