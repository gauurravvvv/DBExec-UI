import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';

@Component({
  selector: 'app-fields-panel',
  templateUrl: './fields-panel.component.html',
  styleUrls: ['./fields-panel.component.scss'],
})
export class FieldsPanelComponent {
  // Inputs
  @Input() isOpen: boolean = true;
  @Input() datasetName: string = '';
  @Input() datasetFields: any[] = [];
  @Input() analysisFields: any[] = [];
  @Input() activeAxisSelection: 'x' | 'y' | 'z' | null = null;
  @Input() showAnalysisFields: boolean = false;

  // For custom field dialog (edit mode only)
  @Input() datasetId: string = '';
  @Input() orgId: string = '';
  @Input() analysisId: string = '';

  // Outputs
  @Output() fieldClick = new EventEmitter<any>();
  @Output() fieldsChanged = new EventEmitter<void>();

  // Internal state
  searchQuery: string = '';
  showCustomFieldDialog: boolean = false;
  editFieldMode: boolean = false;
  editFieldData: any = null;

  constructor(
    private datasetService: DatasetService,
    private globalService: GlobalService,
  ) {}

  getDataTypeIcon(dataType: string): string {
    if (!dataType) return 'pi-bars';
    const type = dataType.toLowerCase();
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal') || type.includes('float') || type.includes('double') || type.includes('real') || type.includes('serial') || type.includes('money')) return 'pi-hashtag';
    if (type.includes('char') || type.includes('text') || type.includes('string') || type.includes('citext') || type.includes('name')) return 'pi-align-left';
    if (type.includes('bool')) return 'pi-check-square';
    if (type.includes('timestamp') || type.includes('date') || type.includes('time') || type.includes('interval')) return 'pi-calendar';
    if (type.includes('uuid')) return 'pi-key';
    if (type.includes('json')) return 'pi-code';
    if (type.includes('array') || type.includes('[]')) return 'pi-list';
    if (type.includes('bytea') || type.includes('blob')) return 'pi-file';
    if (type.includes('inet') || type.includes('cidr') || type.includes('macaddr')) return 'pi-globe';
    if (type.includes('enum') || type.includes('user-defined')) return 'pi-sliders-h';
    return 'pi-bars';
  }

  // Combined fields: dataset-level + analysis-level, each tagged with _scope
  get allFields(): any[] {
    const dFields = (this.datasetFields || []).map((f: any) => ({
      ...f,
      _scope: 'dataset',
    }));
    const aFields = (this.analysisFields || []).map((f: any) => ({
      ...f,
      _scope: 'analysis',
    }));
    return [...dFields, ...aFields];
  }

  // Filtered fields based on search query
  get filteredFields(): any[] {
    const fields = this.showAnalysisFields ? this.allFields : this.datasetFields;
    if (!fields.length) {
      return [];
    }
    if (!this.searchQuery) {
      return fields;
    }
    return fields.filter((field: any) =>
      field.columnToView
        .toLowerCase()
        .includes(this.searchQuery.toLowerCase()),
    );
  }

  onFieldCardClick(field: any): void {
    this.fieldClick.emit(field);
  }

  openAddCustomField(): void {
    this.editFieldMode = false;
    this.editFieldData = null;
    this.showCustomFieldDialog = true;
  }

  openEditCustomField(field: any): void {
    this.editFieldMode = true;
    this.editFieldData = {
      ...field,
      datasetId: this.datasetId,
      organisationId: this.orgId,
    };
    this.showCustomFieldDialog = true;
  }

  onCustomFieldDialogClose(event: any): void {
    this.showCustomFieldDialog = false;
    if (event?.field) {
      this.fieldsChanged.emit();
    }
  }

  deleteAnalysisField(field: any): void {
    this.datasetService
      .deleteDatasetField(this.orgId, this.datasetId, field.id)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.fieldsChanged.emit();
        }
      });
  }
}
