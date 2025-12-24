import {
  Component,
  OnInit,
  OnChanges,
  Output,
  EventEmitter,
  Input,
  HostListener,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

export interface AnalysisFormData {
  name: string;
  description: string;
}

@Component({
  selector: 'app-save-analyses-dialog',
  templateUrl: './save-analyses-dialog.component.html',
  styleUrls: ['./save-analyses-dialog.component.scss'],
})
export class SaveAnalysesDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() initialName = '';
  @Input() initialDescription = '';
  @Input() dialogTitle = 'Save Analysis';
  @Output() close = new EventEmitter<AnalysisFormData | null>();

  analysisForm!: FormGroup;

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

  ngOnChanges() {
    if (this.visible && this.analysisForm) {
      this.analysisForm.patchValue({
        name: this.initialName,
        description: this.initialDescription,
      });
    }
  }

  initForm() {
    this.analysisForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
    });
  }

  onSubmit() {
    if (this.analysisForm.valid) {
      const formData: AnalysisFormData = {
        name: this.analysisForm.get('name')?.value.trim(),
        description: this.analysisForm.get('description')?.value.trim(),
      };
      this.close.emit(formData);
      this.analysisForm.reset();
    }
  }

  onCancel() {
    this.analysisForm.reset();
    this.close.emit(null);
  }
}
