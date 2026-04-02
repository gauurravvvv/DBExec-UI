import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';
import { REGEX } from 'src/app/constants/regex.constant';
import {
  trigger,
  state,
  style,
  transition,
  animate,
} from '@angular/animations';

@Component({
  selector: 'app-edit-organisation',
  templateUrl: './edit-organisation.component.html',
  styleUrls: ['./edit-organisation.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
    trigger('expandCollapse', [
      state(
        'collapsed',
        style({ height: '0', opacity: '0', overflow: 'hidden', padding: '0' }),
      ),
      state(
        'expanded',
        style({
          height: '*',
          opacity: '1',
          overflow: 'hidden',
          padding: '1rem',
        }),
      ),
      transition('collapsed <=> expanded', [animate('200ms ease-in-out')]),
    ]),
  ],
})
export class EditOrganisationComponent implements OnInit, HasUnsavedChanges {
  orgForm!: FormGroup;
  isFormDirty = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  organisationId!: string;
  orgData: any;
  isCancelClicked: boolean = false;
  showDbPassword = false;
  hasMasterDb = false;

  showSaveConfirm = false;
  saveJustification = '';

  // Stepper
  currentStep = 0;

  // Warning
  isWarningExpanded = false;

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.organisationId = this.route.snapshot.params['id'];
    this.loadOrganisationData();
  }

  private initForm() {
    this.orgForm = this.fb.group({
      id: [''],
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
      status: [],
      // Master DB fields
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
      dbPassword: [''],
      // Security config
      maxLoginAttempts: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
      accountLockDurationHours: [1, [Validators.required, Validators.min(0), Validators.max(720)]],
      passwordHistoryLimit: [5, [Validators.required, Validators.min(1), Validators.max(24)]],
      sessionInactivityTimeout: [30, [Validators.required, Validators.min(5), Validators.max(480)]],
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
    });

    this.orgForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
      const currentValue = this.orgForm.getRawValue();
      const config = this.orgData?.orgConfig;
      const originalValue: any = {
        id: this.orgData?.id,
        name: this.orgData?.name,
        description: this.orgData?.description,
        status: this.orgData?.status,
        dbHost: this.orgData?.masterDbConfig?.hostname || '',
        dbPort: this.orgData?.masterDbConfig?.port || '',
        dbName: this.orgData?.masterDbConfig?.dbName || '',
        dbUsername: this.orgData?.masterDbConfig?.username || '',
        dbPassword: '',
        maxLoginAttempts: config?.maxLoginAttempts ?? 5,
        accountLockDurationHours: config?.accountLockDurationHours ?? 1,
        passwordHistoryLimit: config?.passwordHistoryLimit ?? 5,
        sessionInactivityTimeout: config?.sessionInactivityTimeout ?? 30,
        emailProvider: config?.emailProvider || null,
        smtpHost: config?.smtpHost || '',
        smtpPort: config?.smtpPort || 587,
        smtpUser: config?.smtpUser || '',
        smtpPassword: '',
        smtpFrom: config?.smtpFrom || '',
        sesRegion: config?.sesRegion || '',
        sesAccessKeyId: config?.sesAccessKeyId || '',
        sesSecretAccessKey: '',
        sesFrom: config?.sesFrom || '',
      };

      this.isFormDirty = Object.keys(currentValue).some(
        key => currentValue[key] !== originalValue[key],
      );
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

  private loadOrganisationData() {
    this.organisationService
      .viewOrganisation(this.organisationId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.orgData = response.data;
          this.hasMasterDb = !!this.orgData.masterDbConfig;

          this.orgForm.patchValue({
            id: this.orgData.id,
            name: this.orgData.name,
            description: this.orgData.description,
            status: this.orgData.status,
            dbHost: this.orgData.masterDbConfig?.hostname || '',
            dbPort: this.orgData.masterDbConfig?.port || '',
            dbName: this.orgData.masterDbConfig?.dbName || '',
            dbUsername: this.orgData.masterDbConfig?.username || '',
            dbPassword: '',
          });

          const config = this.orgData.orgConfig;
          if (config) {
            this.orgForm.patchValue({
              maxLoginAttempts: config.maxLoginAttempts ?? 5,
              accountLockDurationHours: config.accountLockDurationHours ?? 1,
              passwordHistoryLimit: config.passwordHistoryLimit ?? 5,
              sessionInactivityTimeout: config.sessionInactivityTimeout ?? 30,
              emailProvider: config.emailProvider || null,
              smtpHost: config.smtpHost || '',
              smtpPort: config.smtpPort || 587,
              smtpUser: config.smtpUser || '',
              smtpPassword: '',  // Never returned from API
              smtpFrom: config.smtpFrom || '',
              sesRegion: config.sesRegion || '',
              sesAccessKeyId: config.sesAccessKeyId || '',
              sesSecretAccessKey: '',  // Never returned from API
              sesFrom: config.sesFrom || '',
            });
          }
          this.isFormDirty = false;

          // Organisation name cannot be changed after creation
          this.orgForm.get('name')?.disable();
        }
      });
  }

  // Step validation
  isStep1Valid(): boolean {
    const nameControl = this.orgForm.get('name');
    const nameValid = nameControl?.disabled || nameControl?.valid || false;
    const descValid = this.orgForm.get('description')?.valid || false;
    return nameValid && descValid;
  }

  isDbConnectionFieldsValid(): boolean {
    const fields = ['dbHost', 'dbPort', 'dbName', 'dbUsername'];
    return (
      fields.every(
        f => this.orgForm.get(f)?.valid && this.orgForm.get(f)?.value,
      ) || false
    );
  }

  isDbFieldsDirty(): boolean {
    if (!this.orgData?.masterDbConfig) return false;
    const current = this.orgForm.value;
    const original: any = {
      dbHost: this.orgData.masterDbConfig.hostname || '',
      dbPort: this.orgData.masterDbConfig.port || '',
      dbName: this.orgData.masterDbConfig.dbName || '',
      dbUsername: this.orgData.masterDbConfig.username || '',
      dbPassword: '',
    };
    return ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'].some(
      key => current[key] !== original[key],
    );
  }

  isStep2Valid(): boolean {
    return this.isDbConnectionFieldsValid();
  }

  get selectedEmailProvider(): string | null {
    return this.orgForm.get('emailProvider')?.value;
  }

  isStep3Valid(): boolean {
    const securityValid = ['maxLoginAttempts', 'accountLockDurationHours', 'passwordHistoryLimit', 'sessionInactivityTimeout']
      .every(f => this.orgForm.get(f)?.valid);
    return securityValid;
  }

  // Step navigation
  nextStep() {
    if (this.currentStep === 0 && this.isStep1Valid()) {
      if (this.hasMasterDb) {
        this.currentStep = 1;
      } else {
        this.currentStep = 2;
      }
    } else if (this.currentStep === 1) {
      this.currentStep = 2;
    }
  }

  previousStep() {
    if (this.currentStep === 2 && !this.hasMasterDb) {
      this.currentStep = 0;
    } else if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  onStepClick(step: number) {
    if (step < this.currentStep) {
      if (step === 0) {
        this.currentStep = 0;
      } else if (step === 1 && this.hasMasterDb) {
        this.currentStep = 1;
      } else if (step === 2) {
        this.currentStep = 2;
      }
    } else if (step === 1 && this.currentStep === 0 && this.isStep1Valid() && this.hasMasterDb) {
      this.currentStep = 1;
    } else if (step === 2 && this.currentStep === 0 && this.isStep1Valid() && !this.hasMasterDb) {
      this.currentStep = 2;
    } else if (step === 2 && this.currentStep === 1) {
      this.currentStep = 2;
    }
  }

  // Warning toggle
  toggleWarning() {
    this.isWarningExpanded = !this.isWarningExpanded;
  }

  // Connection test
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

  onNumberInput(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
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

  toggleDbPasswordVisibility(event: Event) {
    event.preventDefault();
    this.showDbPassword = !this.showDbPassword;
  }

  onSubmit() {
    if (this.orgForm.valid) {
      this.showSaveConfirm = true;
    } else {
      Object.keys(this.orgForm.controls).forEach(key => {
        const control = this.orgForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.organisationService
        .editOrganisation(this.orgForm, this.saveJustification.trim())
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.isFormDirty = false;
            this.orgForm.markAsPristine();
            this.router.navigate([ORGANISATION.LIST]);
          }
        });
    }
  }

  onCancel() {
    const config = this.orgData?.orgConfig;
    this.orgForm.patchValue({
      id: this.orgData.id,
      name: this.orgData.name,
      description: this.orgData.description,
      status: this.orgData.status,
      dbHost: this.orgData.masterDbConfig?.hostname || '',
      dbPort: this.orgData.masterDbConfig?.port || '',
      dbName: this.orgData.masterDbConfig?.dbName || '',
      dbUsername: this.orgData.masterDbConfig?.username || '',
      dbPassword: '',
      maxLoginAttempts: config?.maxLoginAttempts ?? 5,
      accountLockDurationHours: config?.accountLockDurationHours ?? 1,
      passwordHistoryLimit: config?.passwordHistoryLimit ?? 5,
      sessionInactivityTimeout: config?.sessionInactivityTimeout ?? 30,
      emailProvider: config?.emailProvider || null,
      smtpHost: config?.smtpHost || '',
      smtpPort: config?.smtpPort || 587,
      smtpUser: config?.smtpUser || '',
      smtpPassword: '',
      smtpFrom: config?.smtpFrom || '',
      sesRegion: config?.sesRegion || '',
      sesAccessKeyId: config?.sesAccessKeyId || '',
      sesSecretAccessKey: '',
      sesFrom: config?.sesFrom || '',
    });
    this.orgForm.markAsPristine();
    this.isCancelClicked = true;
    this.currentStep = 0;
    this.connectionTested = false;
    this.connectionTestResult = null;
  }

  isFormValid(): boolean {
    return this.orgForm.valid && this.isFormDirty;
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

  getDbFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (control?.errors) {
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
    }
    return '';
  }
}
