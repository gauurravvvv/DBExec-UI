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
    // Reset form state
    this.isFormDirty = false;
    this.initialValues = {};

    const formGroup: any = {};
    if (this.credentialSet?.values) {
      // Reset password visibility array
      this.showPassword = new Array(this.credentialSet.values.length).fill(
        false
      );

      this.credentialSet.values.forEach((field: any) => {
        formGroup[field.fieldName] = [field.value, Validators.required];
        this.initialValues[field.fieldName] = field.value;
      });
    }

    // Create new form group
    this.editForm = this.fb.group(formGroup);

    // Subscribe to value changes
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
          sequence: this.credentialSet.values.find(
            (value: any) => value.fieldName === key
          )?.sequence,
        })),
      };

      // Update initial values to match new values
      Object.keys(this.editForm.value).forEach(key => {
        this.initialValues[key] = this.editForm.value[key];
      });

      this.isFormDirty = false;
      this.loading = false;
      this.close.emit(updatedValues);
    }
  }

  onClose() {
    // Reset form and initial values to original credential set values
    if (this.credentialSet?.values) {
      this.credentialSet.values.forEach((field: any) => {
        const control = this.editForm.get(field.fieldName);
        control?.setValue(field.value);
        control?.markAsUntouched(); // Reset validation state
        this.initialValues[field.fieldName] = field.value; // Update initial values
      });
    }
    this.isFormDirty = false;
    this.close.emit();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
