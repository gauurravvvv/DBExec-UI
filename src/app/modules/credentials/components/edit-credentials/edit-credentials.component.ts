import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  OnDestroy,
  Output,
  HostListener,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-edit-credentials',
  templateUrl: './edit-credentials.component.html',
  styleUrls: ['./edit-credentials.component.scss'],
})
export class EditCredentialsComponent implements OnInit, OnDestroy {
  @Input() visible = false;
  @Input() set credentialSet(value: any) {
    if (value) {
      this._credentialSet = value;
      this.initializeForm();
    }
  }
  get credentialSet() {
    return this._credentialSet;
  }

  @Output() close = new EventEmitter<any>();

  private _credentialSet: any;
  private destroy$ = new Subject<void>();

  editForm: FormGroup;
  loading = false;
  showPassword: boolean[] = [];
  isFormDirty = false;
  initialValues: any = {};

  // Add ESC key listener
  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onClose();
    }
  }

  constructor(private fb: FormBuilder) {
    this.editForm = this.fb.group({});
  }

  ngOnInit() {
    if (this.credentialSet) {
      this.initializeForm();
    }
  }

  private initializeForm() {
    const formGroup: any = {};
    if (this.credentialSet?.values) {
      this.showPassword = new Array(this.credentialSet.values.length).fill(
        false
      );

      this.credentialSet.values.forEach((field: any) => {
        formGroup[field.fieldName] = [field.value, Validators.required];
        this.initialValues[field.fieldName] = field.value;
      });
    }
    this.editForm = this.fb.group(formGroup);

    this.editForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.checkFormDirty();
    });
  }

  private checkFormDirty() {
    const currentValues = this.editForm.value;
    this.isFormDirty = Object.keys(currentValues).some(
      key => currentValues[key] !== this.initialValues[key]
    );
  }

  togglePasswordVisibility(index: number) {
    this.showPassword[index] = !this.showPassword[index];
  }

  onSubmit() {
    if (this.editForm.valid && this.isFormDirty) {
      this.loading = true;
      const updatedValues = {
        ...this.credentialSet,
        values: Object.keys(this.editForm.value).map(key => ({
          fieldName: key,
          value: this.editForm.value[key],
        })),
      };
      this.close.emit(updatedValues);
    }
  }

  onClose() {
    // Reset form to initial values
    Object.keys(this.initialValues).forEach(key => {
      const control = this.editForm.get(key);
      control?.setValue(this.initialValues[key]);
      control?.markAsUntouched(); // Reset validation state
    });
    this.isFormDirty = false;
    this.close.emit();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
