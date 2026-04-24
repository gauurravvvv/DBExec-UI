import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DATASET } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../services/dataset.service';

@Component({
  selector: 'app-view-dataset',
  templateUrl: './view-dataset.component.html',
  styleUrls: ['./view-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDatasetComponent implements OnInit {
  datasetData: any;
  showDeleteConfirm = false;
  deleteJustification = '';
  showDeleteFieldConfirm = false;
  showEditFieldsDialog = false;
  showEditCustomFieldDialog = false;
  showAddCustomFieldDialog = false;
  selectedField: any = null;
  selectedFieldIndex: number = -1;
  fieldToDelete: any = null;
  isLoadingField = false;

  saving = this.datasetService.saving;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  isArray = Array.isArray;

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  trackByIndex(index: number): number {
    return index;
  }

  /**
   * Format prompt value for display.
   * Handles enriched {id, value} objects, plain arrays, and scalars.
   */
  getDataTypeIcon(dataType: string): string {
    if (!dataType) return 'pi-tag';
    const type = dataType.toLowerCase();
    if (
      type.includes('int') ||
      type.includes('numeric') ||
      type.includes('decimal') ||
      type.includes('float') ||
      type.includes('double') ||
      type.includes('real') ||
      type.includes('serial') ||
      type.includes('money')
    ) {
      return 'pi-hashtag';
    }
    if (
      type.includes('char') ||
      type.includes('text') ||
      type.includes('string') ||
      type.includes('citext') ||
      type.includes('name')
    ) {
      return 'pi-align-left';
    }
    if (type.includes('bool')) {
      return 'pi-check-square';
    }
    if (
      type.includes('timestamp') ||
      type.includes('date') ||
      type.includes('time') ||
      type.includes('interval')
    ) {
      return 'pi-calendar';
    }
    if (type.includes('uuid')) {
      return 'pi-key';
    }
    if (type.includes('json')) {
      return 'pi-code';
    }
    if (type.includes('array') || type.includes('[]')) {
      return 'pi-list';
    }
    if (type.includes('bytea') || type.includes('blob')) {
      return 'pi-file';
    }
    if (
      type.includes('inet') ||
      type.includes('cidr') ||
      type.includes('macaddr')
    ) {
      return 'pi-globe';
    }
    if (type.includes('enum') || type.includes('user-defined')) {
      return 'pi-sliders-h';
    }
    return 'pi-tag';
  }

  getDataTypeLabel(dataType: string): string {
    if (!dataType) return '';
    const t = dataType.toLowerCase();
    if (t.includes('int') || t.includes('serial')) return 'Integer';
    if (
      t.includes('numeric') ||
      t.includes('decimal') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('real') ||
      t.includes('money')
    )
      return 'Decimal';
    if (t.includes('bool')) return 'Boolean';
    if (t.includes('timestamp')) return 'Date & Time';
    if (t.includes('date') || t.includes('time') || t.includes('interval'))
      return 'Date';
    if (t.includes('json')) return 'JSON';
    if (
      t.includes('char') ||
      t.includes('text') ||
      t.includes('string') ||
      t.includes('citext') ||
      t.includes('name')
    )
      return 'Text';
    if (t.includes('uuid')) return 'UUID';
    if (t.includes('array') || t.includes('[]')) return 'Array';
    return dataType;
  }

  formatPromptValue(prompt: any): string {
    if (prompt.isRange) {
      return `${prompt.startValue ?? '-'} to ${prompt.endValue ?? '-'}`;
    }
    if (prompt.value == null) return '-';
    if (Array.isArray(prompt.value)) {
      return prompt.value
        .map((v: any) =>
          typeof v === 'object' && v?.value != null ? v.value : v,
        )
        .join(', ');
    }
    if (typeof prompt.value === 'object' && prompt.value?.value != null) {
      return prompt.value.value;
    }
    return String(prompt.value);
  }

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
      this.cdr.markForCheck();
    }).catch(() => { this.cdr.markForCheck(); });
  }

  goBack() {
    this.router.navigate([DATASET.LIST]);
  }

  onEdit() {
    if (this.datasetData.type === 2 && this.datasetData.queryBuilderId) {
      // Type 2 (Prompt-based): navigate to execute-query-builder in edit mode
      this.router.navigate(
        [
          '/app/query-builder/execute',
          this.datasetData.organisationId,
          this.datasetData.datasourceId,
          this.datasetData.queryBuilderId,
        ],
        {
          queryParams: {
            editDatasetId: this.datasetData.id,
            editDatasetName: this.datasetData.name,
          },
        },
      );
    } else {
      // Type 1 (SQL-based): navigate to standard edit
      this.router.navigate([
        DATASET.EDIT,
        this.datasetData.organisationId,
        this.datasetData.id,
      ]);
    }
  }

  confirmDelete() {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.deleteJustification.trim()) {
      this.datasetService
        .deleteDataset(
          this.datasetData.organisationId,
          this.datasetData.id,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.deleteJustification = '';
            this.router.navigate([DATASET.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => { this.cdr.markForCheck(); });
    }
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
        this.fieldToDelete.id,
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
        field.id,
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingField = false;
        this.cdr.markForCheck();
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
