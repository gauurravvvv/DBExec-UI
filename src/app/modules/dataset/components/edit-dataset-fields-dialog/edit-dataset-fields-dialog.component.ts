import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { DatasetService } from '../../services/dataset.service';
import { GlobalService } from 'src/app/core/services/global.service';

export interface DatasetFieldsData {
  fields: any[];
}

@Component({
  selector: 'app-edit-dataset-fields-dialog',
  templateUrl: './edit-dataset-fields-dialog.component.html',
  styleUrls: ['./edit-dataset-fields-dialog.component.scss'],
})
export class EditDatasetFieldsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() field: any = null;
  @Input() fieldIndex: number = -1;
  @Input() dialogTitle = 'Edit Field';
  @Output() close = new EventEmitter<any>();

  editableField: any = null;
  originalField: any = null;
  isSaveEnabled = false;
  isSubmitting = false;

  constructor(
    private datasetService: DatasetService,
    private messageService: MessageService,
    private globalService: GlobalService
  ) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && this.field) {
      // Create copies for editing and comparison
      this.editableField = { ...this.field };
      this.originalField = { ...this.field };
      this.isSaveEnabled = false;
      this.isSubmitting = false;
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  onFieldChange() {
    // Enable save button if columnToView has changed
    this.isSaveEnabled =
      this.editableField.columnToView?.trim() !==
      this.originalField.columnToView?.trim();
  }

  onSubmit() {
    if (!this.isSaveEnabled || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    const payload = {
      mappingId: this.editableField.id,
      datasetId: this.editableField.datasetId,
      columnNameToView: this.editableField.columnToView,
      organisation: this.editableField.organisationId,
    };

    this.datasetService.updateDatasetMapping(payload).then(response => {
      if (this.globalService.handleSuccessService(response, true)) {
        this.isSubmitting = false;
      }
    });
    this.close.emit({ field: this.editableField });
  }

  onCancel() {
    this.close.emit(null);
  }
}
