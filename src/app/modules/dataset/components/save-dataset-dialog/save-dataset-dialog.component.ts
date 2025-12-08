import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  Input,
  HostListener,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

export interface DatasetFormData {
  name: string;
  description: string;
}

@Component({
  selector: 'app-save-dataset-dialog',
  templateUrl: './save-dataset-dialog.component.html',
  styleUrls: ['./save-dataset-dialog.component.scss'],
})
export class SaveDatasetDialogComponent implements OnInit {
  @Input() visible = false;
  @Output() close = new EventEmitter<DatasetFormData | null>();

  datasetForm!: FormGroup;

  constructor(private fb: FormBuilder) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    this.datasetForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
    });
  }

  onSubmit() {
    if (this.datasetForm.valid) {
      const formData: DatasetFormData = {
        name: this.datasetForm.get('name')?.value.trim(),
        description: this.datasetForm.get('description')?.value.trim(),
      };
      this.close.emit(formData);
      this.datasetForm.reset();
    }
  }

  onCancel() {
    this.datasetForm.reset();
    this.close.emit(null);
  }
}
