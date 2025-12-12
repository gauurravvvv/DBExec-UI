import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
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
  showEditFieldsDialog = false;
  selectedField: any = null;
  selectedFieldIndex: number = -1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private messageService: MessageService
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
    this.selectedField = { ...field };
    this.selectedFieldIndex = index;
    this.showEditFieldsDialog = true;
  }

  onEditFieldDialogClose(data: any): void {
    this.showEditFieldsDialog = false;
    if (data && this.selectedFieldIndex >= 0) {
      // Update the specific field in the array
      this.datasetData.datasetEntities[this.selectedFieldIndex] = data.field;
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Field updated successfully',
        key: 'topRight',
        life: 3000,
        styleClass: 'custom-toast',
      });
    }
    this.selectedField = null;
    this.selectedFieldIndex = -1;
  }
}
