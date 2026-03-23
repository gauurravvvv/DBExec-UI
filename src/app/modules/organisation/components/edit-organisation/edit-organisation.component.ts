import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
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
        style({ height: '*', opacity: '1', overflow: 'hidden', padding: '1rem' }),
      ),
      transition('collapsed <=> expanded', [animate('200ms ease-in-out')]),
    ]),
  ],
})
export class EditOrganisationComponent implements OnInit {
  orgForm!: FormGroup;
  isFormDirty = false;
  organisationId!: string;
  orgData: any;
  isCancelClicked: boolean = false;
  showDbPassword = false;
  hasMasterDb = false;

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
      dbHost: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9.-]+$')]],
      dbPort: [
        '',
        [
          Validators.required,
          Validators.pattern('^[0-9]+$'),
          Validators.min(1),
          Validators.max(65535),
        ],
      ],
      dbName: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9_-]+$')]],
      dbUsername: ['', [Validators.required]],
      dbPassword: [''],
    });

    this.orgForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
      const currentValue = this.orgForm.value;
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
      };

      this.isFormDirty = Object.keys(currentValue).some(
        key => currentValue[key] !== originalValue[key],
      );
    });

    // Reset connection test when DB fields change
    ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'].forEach(field => {
      this.orgForm.get(field)?.valueChanges.subscribe(() => {
        this.connectionTested = false;
        this.connectionTestResult = null;
      });
    });
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
          this.isFormDirty = false;
        }
      });
  }

  // Step validation
  isStep1Valid(): boolean {
    const nameValid = this.orgForm.get('name')?.valid || false;
    const descValid = this.orgForm.get('description')?.valid || false;
    return nameValid && descValid;
  }

  isDbConnectionFieldsValid(): boolean {
    const fields = ['dbHost', 'dbPort', 'dbName', 'dbUsername'];
    return fields.every(f => this.orgForm.get(f)?.valid && this.orgForm.get(f)?.value) || false;
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

  // Step navigation
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

  onStepClick(step: number) {
    if (step < this.currentStep) {
      this.currentStep = step;
    } else if (step === 1 && this.currentStep === 0 && this.isStep1Valid()) {
      this.currentStep = 1;
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
      this.organisationService.editOrganisation(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
    } else {
      Object.keys(this.orgForm.controls).forEach(key => {
        const control = this.orgForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel() {
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
