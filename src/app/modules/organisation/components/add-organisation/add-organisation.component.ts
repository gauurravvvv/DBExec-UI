import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { ORGANISATION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-add-organisation',
  templateUrl: './add-organisation.component.html',
  styleUrls: ['./add-organisation.component.scss'],
})
export class AddOrganisationComponent implements OnInit {
  orgForm!: FormGroup;
  currentStep = 0;
  isFormDirty = false;
  showPepperKey = false;
  showDbPassword = false;
  confirmationChecked = false;
  dbAcknowledgment = false;
  schemaAcknowledgment = false;
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
    this.orgForm.valueChanges.subscribe(() => {
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
    });

    // Reset connection test when DB fields change
    ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'].forEach(
      field => {
        this.orgForm.get(field)?.valueChanges.subscribe(() => {
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
      this.confirmationChecked
    );
  }

  isDbConnectionFieldsValid(): boolean {
    const fields = ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'];
    return fields.every(f => this.orgForm.get(f)?.valid) || false;
  }

  nextStep() {
    if (this.currentStep === 0 && this.isStep1Valid()) {
      this.currentStep = 1;
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
    }
  }

  testConnection() {
    if (!this.isDbConnectionFieldsValid()) return;

    this.connectionTestLoading = true;
    this.connectionTestResult = null;

    const formValue = this.orgForm.value;
    this.organisationService
      .validateDatabase({
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
      this.organisationService.addOrganisation(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    this.orgForm.reset();
    this.currentStep = 0;
    this.isFormDirty = false;
    this.confirmationChecked = false;
    this.dbAcknowledgment = false;
    this.schemaAcknowledgment = false;
    this.connectionTested = false;
    this.connectionTestResult = null;
    this.orgForm.markAsPristine();
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
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

  togglePepperKeyVisibility(event: Event) {
    event.preventDefault();
    this.showPepperKey = !this.showPepperKey;
    const pepperKeyInput = document.getElementById(
      'pepperKey',
    ) as HTMLInputElement;
    if (pepperKeyInput) {
      pepperKeyInput.type = this.showPepperKey ? 'text' : 'password';
    }
  }

  toggleDbPasswordVisibility(event: Event) {
    event.preventDefault();
    this.showDbPassword = !this.showDbPassword;
  }

  isFormValid(): boolean {
    return (
      this.orgForm.valid &&
      this.confirmationChecked &&
      this.dbAcknowledgment &&
      this.schemaAcknowledgment &&
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
