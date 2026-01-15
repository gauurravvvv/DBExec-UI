import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DATASET } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../services/dataset.service';

@Component({
  selector: 'app-view-dataset',
  templateUrl: './view-dataset.component.html',
  styleUrls: ['./view-dataset.component.scss'],
})
export class ViewDatasetComponent implements OnInit {
  datasetData: any;
  showDeleteConfirm = false;
  showDeleteFieldConfirm = false;
  showEditFieldsDialog = false;
  showEditCustomFieldDialog = false;
  showAddCustomFieldDialog = false;
  selectedField: any = null;
  selectedFieldIndex: number = -1;
  fieldToDelete: any = null;
  isLoadingField = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.loadDatasetData();
  }

  loadDatasetData() {
    const orgId = this.route.snapshot.params['orgId'];
    const datasetId = this.route.snapshot.params['id'];

    this.datasetService.viewDataset(orgId, datasetId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasetData = response.data;
      }
    });
  }

  goBack() {
    this.router.navigate([DATASET.LIST]);
  }

  onEdit() {
    this.router.navigate([
      DATASET.EDIT,
      this.datasetData.organisationId,
      this.datasetData.id,
    ]);
  }

  confirmDelete() {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    this.datasetService
      .deleteDataset(this.datasetData.organisationId, this.datasetData.id)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([DATASET.LIST]);
        }
      });
  }

  // Delete field methods
  confirmDeleteField(field: any, index: number): void {
    this.fieldToDelete = field;
    this.showDeleteFieldConfirm = true;
  }

  cancelDeleteField(): void {
    this.fieldToDelete = null;
    this.showDeleteFieldConfirm = false;
  }

  proceedDeleteField(): void {
    if (!this.fieldToDelete) return;

    this.datasetService
      .deleteDatasetField(
        this.datasetData.organisationId,
        this.datasetData.id,
        this.fieldToDelete.id
      )
      .then((response: any) => {
        this.showDeleteFieldConfirm = false;
        if (this.globalService.handleSuccessService(response, true)) {
          this.fieldToDelete = null;
          // Reload dataset data from API
          this.loadDatasetData();
        }
      })
      .catch(() => {
        this.showDeleteFieldConfirm = false;
        this.fieldToDelete = null;
      });
  }

  copySQLToClipboard(): void {
    navigator.clipboard.writeText(this.datasetData.sql);
  }

  downloadSQL(): void {
    const datasetName = this.datasetData.name || 'dataset';
    const fileName = `${datasetName}_query.sql`;

    const blob = new Blob([this.datasetData.sql], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  openEditFieldDialog(field: any, index: number): void {
    if (this.isLoadingField) return;

    this.isLoadingField = true;
    this.selectedFieldIndex = index;

    // Call API to get field details first
    this.datasetService
      .viewDatasetField(
        this.datasetData.organisationId,
        this.datasetData.id,
        field.id
      )
      .then((response: any) => {
        this.isLoadingField = false;
        if (this.globalService.handleSuccessService(response, false)) {
          this.selectedField = response.data;

          // Open appropriate dialog based on field type
          if (response.data.type === 2) {
            // CUSTOM field - open custom field dialog in edit mode
            this.showEditCustomFieldDialog = true;
          } else {
            // DEFAULT field (type === 1) - open regular edit dialog
            this.showEditFieldsDialog = true;
          }
        }
      })
      .catch(() => {
        this.isLoadingField = false;
      });
  }

  onEditFieldDialogClose(data: any): void {
    this.showEditFieldsDialog = false;
    if (data) {
      // Reload dataset data from API
      this.loadDatasetData();
    }
    this.selectedField = null;
    this.selectedFieldIndex = -1;
  }

  onEditCustomFieldDialogClose(data: any): void {
    this.showEditCustomFieldDialog = false;
    if (data) {
      // Reload dataset data from API
      this.loadDatasetData();
    }
    this.selectedField = null;
    this.selectedFieldIndex = -1;
  }

  openAddCustomFieldDialog(): void {
    this.showAddCustomFieldDialog = true;
  }

  onAddCustomFieldDialogClose(data: any): void {
    this.showAddCustomFieldDialog = false;
    if (data?.field) {
      // Reload dataset data from API
      this.loadDatasetData();
    }
  }
}
