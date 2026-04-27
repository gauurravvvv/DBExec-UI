import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { ORGANISATION } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

@Component({
  selector: 'app-add-organisation',
  templateUrl: './add-organisation.component.html',
  styleUrls: ['./add-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddOrganisationComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  saving = this.organisationService.saving;

  orgForm!: FormGroup;
  currentStep = 0;
  isFormDirty = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  showDbPassword = false;
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.orgForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.isFormDirty = true;
      });
  }

  private initForm() {
    this.orgForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(500),
        ],
      ],
      encryptionAlgorithm: ['', [Validators.required]],
      pepperKey: [
        '',
        [
          Validators.required,
          Validators.minLength(32),
          Validators.pattern(REGEX.pepperKey),
        ],
      ],
      // Master database fields
      dbHost: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z0-9.-]+$')],
      ],
      dbPort: [
        '',
        [
          Validators.required,
          Validators.pattern('^[0-9]+$'),
          Validators.min(1),
          Validators.max(65535),
        ],
      ],
      dbName: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z0-9_-]+$')],
      ],
      dbUsername: ['', [Validators.required]],
      dbPassword: ['', [Validators.required]],
      adminEmail: ['', [Validators.required, Validators.email]],
      // Security config
      maxLoginAttempts: [
        5,
        [Validators.required, Validators.min(3), Validators.max(10)],
      ],
      accountLockDurationHours: [
        1,
        [Validators.required, Validators.min(0), Validators.max(24)],
      ],
      passwordHistoryLimit: [
        5,
        [Validators.required, Validators.min(1), Validators.max(24)],
      ],
      sessionInactivityTimeout: [
        30,
        [Validators.required, Validators.min(5), Validators.max(1440)],
      ],
      // Email config
      emailProvider: [null],
      smtpHost: [''],
      smtpPort: [587],
      smtpUser: [''],
      smtpPassword: [''],
      smtpFrom: [''],
      sesRegion: [''],
      sesAccessKeyId: [''],
      sesSecretAccessKey: [''],
      sesFrom: [''],
      // Acknowledgments
      confirmationChecked: [false],
      dbAcknowledgment: [false],
      schemaAcknowledgment: [false],
    });

    // Update email field validators when provider changes
    this.orgForm
      .get('emailProvider')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(provider => {
        this.updateEmailValidators(provider);
      });

    // Reset connection test when DB fields change
    ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'].forEach(
      field => {
        this.orgForm
          .get(field)
          ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.connectionTested = false;
            this.connectionTestResult = null;
          });
      },
    );
  }

  isStep1Valid(): boolean {
    const nameValid = this.orgForm.get('name')?.valid || false;
    const descValid = this.orgForm.get('description')?.valid || false;
    const encValid = this.orgForm.get('encryptionAlgorithm')?.valid || false;
    const pepperValid = this.orgForm.get('pepperKey')?.valid || false;
    return (
      nameValid &&
      descValid &&
      encValid &&
      pepperValid &&
      this.orgForm.get('confirmationChecked')?.value
    );
  }

  isDbConnectionFieldsValid(): boolean {
    const fields = ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'];
    return fields.every(f => this.orgForm.get(f)?.valid) || false;
  }

  isStep2Valid(): boolean {
    return this.isDbConnectionFieldsValid();
  }

  get selectedEmailProvider(): string | null {
    return this.orgForm.get('emailProvider')?.value;
  }

  updateEmailValidators(provider: string | null) {
    const smtpFields = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpFrom'];
    const sesFields = ['sesRegion', 'sesAccessKeyId', 'sesFrom'];
    const allFields = [...smtpFields, ...sesFields];

    allFields.forEach(f => {
      this.orgForm.get(f)?.clearValidators();
      this.orgForm.get(f)?.updateValueAndValidity({ emitEvent: false });
    });

    if (provider === 'SMTP') {
      this.orgForm
        .get('smtpHost')
        ?.setValidators([Validators.required, Validators.maxLength(255)]);
      this.orgForm
        .get('smtpPort')
        ?.setValidators([
          Validators.required,
          Validators.min(1),
          Validators.max(65535),
        ]);
      this.orgForm
        .get('smtpUser')
        ?.setValidators([Validators.required, Validators.maxLength(255)]);
      this.orgForm
        .get('smtpFrom')
        ?.setValidators([Validators.required, Validators.email]);
    } else if (provider === 'SES') {
      this.orgForm
        .get('sesRegion')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(/^[a-z]{2}-[a-z]+-\d{1,2}$/),
        ]);
      this.orgForm
        .get('sesAccessKeyId')
        ?.setValidators([
          Validators.required,
          Validators.minLength(16),
          Validators.maxLength(128),
        ]);
      this.orgForm
        .get('sesFrom')
        ?.setValidators([Validators.required, Validators.email]);
    }

    allFields.forEach(f => {
      this.orgForm.get(f)?.updateValueAndValidity({ emitEvent: false });
    });
  }

  getEmailFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['email']) return 'Please enter a valid email address';
    if (control.errors['maxlength'])
      return `Must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control.errors['minlength'])
      return `Must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control.errors['min'])
      return `Minimum value is ${control.errors['min'].min}`;
    if (control.errors['max'])
      return `Maximum value is ${control.errors['max'].max}`;
    if (control.errors['pattern']) return 'Invalid format (e.g. us-east-1)';
    return '';
  }

  isStep3Valid(): boolean {
    const securityValid = [
      'maxLoginAttempts',
      'accountLockDurationHours',
      'passwordHistoryLimit',
      'sessionInactivityTimeout',
    ].every(f => this.orgForm.get(f)?.valid);
    return securityValid;
  }

  nextStep() {
    if (this.currentStep === 0 && this.isStep1Valid()) {
      this.currentStep = 1;
    } else if (this.currentStep === 1) {
      this.currentStep = 2;
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  onNumberInput(event: any) {
    const input = event.target;
    input.value = input.value.replace(/[^0-9]/g, '');

    const controlName = input.getAttribute('formControlName');
    if (controlName) {
      this.orgForm.get(controlName)?.setValue(input.value);
    }
  }

  onPortKeyPress(event: KeyboardEvent): boolean {
    const pattern = /[0-9]/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  onStepClick(step: number) {
    if (step < this.currentStep) {
      this.currentStep = step;
    } else if (step === 1 && this.currentStep === 0 && this.isStep1Valid()) {
      this.currentStep = 1;
    } else if (step === 2 && this.currentStep === 1) {
      this.currentStep = 2;
    }
  }

  testConnection() {
    if (!this.isDbConnectionFieldsValid()) return;

    this.connectionTestLoading = true;
    this.connectionTestResult = null;

    const formValue = this.orgForm.value;
    this.organisationService
      .validateDatasource({
        type: 'postgres',
        host: formValue.dbHost,
        port: formValue.dbPort,
        database: formValue.dbName,
        username: formValue.dbUsername,
        password: formValue.dbPassword,
      })
      .then((response: any) => {
        this.connectionTestLoading = false;
        if (response?.isConnected) {
          this.connectionTested = true;
          this.connectionTestResult = 'success';
        } else {
          this.connectionTested = false;
          this.connectionTestResult = 'failed';
        }
      })
      .catch(() => {
        this.connectionTestLoading = false;
        this.connectionTested = false;
        this.connectionTestResult = 'failed';
      });
  }

  onSubmit(): void {
    if (this.isFormValid()) {
      this.organisationService.add(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.isFormDirty = false;
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    this.orgForm.reset();
    this.currentStep = 0;
    this.isFormDirty = false;
    this.connectionTested = false;
    this.connectionTestResult = null;
    this.orgForm.markAsPristine();
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
    });
    // Restore security defaults
    this.orgForm.patchValue({
      maxLoginAttempts: 5,
      accountLockDurationHours: 1,
      passwordHistoryLimit: 5,
      sessionInactivityTimeout: 30,
      emailProvider: null,
      smtpPort: 587,
      confirmationChecked: false,
      dbAcknowledgment: false,
      schemaAcknowledgment: false,
    });
  }

  encryptionAlgorithms = [
    { value: 'aes-256-gcm', label: 'aes-256-gcm' },
    { value: 'aes-192-gcm', label: 'aes-192-gcm' },
    { value: 'aes-128-gcm', label: 'aes-128-gcm' },
    { value: 'aes-256-cbc', label: 'aes-256-cbc' },
    { value: 'aes-192-cbc', label: 'aes-192-cbc' },
    { value: 'aes-128-cbc', label: 'aes-128-cbc' },
  ];

  toggleDbPasswordVisibility(event: Event) {
    event.preventDefault();
    this.showDbPassword = !this.showDbPassword;
  }

  isFormValid(): boolean {
    return (
      this.orgForm.valid &&
      this.orgForm.get('confirmationChecked')?.value &&
      this.orgForm.get('dbAcknowledgment')?.value &&
      this.orgForm.get('schemaAcknowledgment')?.value &&
      this.connectionTested
    );
  }

  getNameError(): string {
    const control = this.orgForm.get('name');
    if (control?.errors?.['required']) return 'Organisation name is required';
    if (control?.errors?.['minlength'])
      return `Organisation name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Organisation name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Organisation name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  getDescriptionError(): string {
    const control = this.orgForm.get('description');
    if (control?.errors?.['required']) return 'Description is required';
    if (control?.errors?.['minlength'])
      return `Description must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Description must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    return '';
  }

  getPepperKeyError(): string {
    const control = this.orgForm.get('pepperKey');
    if (control?.errors?.['required']) return 'Pepper key is required';
    if (control?.errors?.['minlength'])
      return `Pepper key must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Pepper key can only contain letters, numbers and special characters (no spaces)';
    return '';
  }

  getSecurityFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['min'])
      return `Minimum value is ${control.errors['min'].min}`;
    if (control.errors['max'])
      return `Maximum value is ${control.errors['max'].max}`;
    return '';
  }

  getDbFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required']) return 'This field is required';
      if (control.errors['pattern']) {
        switch (fieldName) {
          case 'dbHost':
            return 'Invalid host format';
          case 'dbPort':
            return 'Port must be a number';
          case 'dbName':
            return 'Database name can only contain letters, numbers, underscores and hyphens';
          default:
            return 'Invalid format';
        }
      }
      if (control.errors['min'] && fieldName === 'dbPort')
        return 'Port must be at least 1';
      if (control.errors['max'] && fieldName === 'dbPort')
        return 'Port cannot exceed 65535';
      if (control.errors['email']) return 'Please enter a valid email';
    }
    return '';
  }
}
