import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
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
  readonly locales = SUPPORTED_LOCALES as unknown as any[];

  orgForm!: FormGroup;
  currentStep = 0;
  isFormDirty = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  showDbPassword = false;
  connectionTested = signal(false);
  connectionTestLoading = signal(false);
  connectionTestResult = signal<'success' | 'failed' | null>(null);
  connectionTestError = signal<string | null>(null);
  // Sequence counter so in-flight responses that arrive after field edits
  // (or another newer test) are ignored — prevents a stale "Connected" state.
  private testRequestId = 0;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private translate: TranslateService,
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
      // Encryption configuration is no longer collected from the
      // admin. The BE generates a per-org AES-256-GCM Data Encryption
      // Key (DEK) server-side and wraps it under the platform master
      // key on every org creation. See SECURITY.md for the design.
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
      dbSchema: [
        '',
        [
          Validators.required,
          Validators.maxLength(63),
          Validators.pattern(/^[a-z_][a-z0-9_]{0,62}$/),
        ],
      ],
      dbUsername: ['', [Validators.required]],
      dbPassword: ['', [Validators.required]],
      adminEmail: ['', [Validators.required, Validators.email]],
      adminLocale: ['en', Validators.required],
      // Security + email policy now live on the per-org OrgPolicy
      // entity and are managed by the Org Admin under App Settings.
      // They are deliberately NOT collected at org creation time.
      // Acknowledgments
      dbAcknowledgment: [false],
      schemaAcknowledgment: [false],
    });

    // Reset connection test when DB fields change. Bumping the request id
    // invalidates any in-flight response so it can't apply stale state.
    ['dbHost', 'dbPort', 'dbName', 'dbSchema', 'dbUsername', 'dbPassword'].forEach(
      field => {
        this.orgForm
          .get(field)
          ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.connectionTested.set(false);
            this.connectionTestResult.set(null);
            this.connectionTestError.set(null);
            this.testRequestId++;
          });
      },
    );
  }

  isStep1Valid(): boolean {
    const nameValid = this.orgForm.get('name')?.valid || false;
    const descValid = this.orgForm.get('description')?.valid || false;
    // Encryption is server-managed and no admin acknowledgement is
    // gathered any more — step 1 just gates on name + description.
    return nameValid && descValid;
  }

  isDbConnectionFieldsValid(): boolean {
    const fields = [
      'dbHost',
      'dbPort',
      'dbName',
      'dbSchema',
      'dbUsername',
      'dbPassword',
    ];
    return fields.every(f => this.orgForm.get(f)?.valid) || false;
  }

  isStep2Valid(): boolean {
    return this.isDbConnectionFieldsValid();
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
    // Re-entry guard: ignore clicks when the test is in flight or already
    // succeeded for the current set of credentials. The valueChanges hook
    // unlocks the button by resetting connectionTested when fields change.
    if (
      !this.isDbConnectionFieldsValid() ||
      this.connectionTestLoading() ||
      this.connectionTested()
    )
      return;

    const formValue = this.orgForm.value;
    if (!formValue.dbPassword) {
      this.connectionTested.set(false);
      this.connectionTestResult.set('failed');
      this.connectionTestError.set(
        this.translate.instant('ORG.DB_PASSWORD_REQUIRED'),
      );
      return;
    }

    this.connectionTestLoading.set(true);
    this.connectionTestResult.set(null);
    this.connectionTestError.set(null);
    const reqId = ++this.testRequestId;

    this.organisationService
      .validateMasterDb({
        host: formValue.dbHost,
        port: formValue.dbPort,
        database: formValue.dbName,
        username: formValue.dbUsername,
        password: formValue.dbPassword,
      })
      .then((response: any) => {
        if (reqId !== this.testRequestId) return;
        this.connectionTestLoading.set(false);
        if (response?.code !== 200) {
          this.connectionTested.set(false);
          this.connectionTestResult.set('failed');
          this.connectionTestError.set(response?.message || null);
          return;
        }
        if (response?.data?.isConnected) {
          this.connectionTested.set(true);
          this.connectionTestResult.set('success');
        } else {
          this.connectionTested.set(false);
          this.connectionTestResult.set('failed');
        }
      })
      .catch(() => {
        if (reqId !== this.testRequestId) return;
        this.connectionTestLoading.set(false);
        this.connectionTested.set(false);
        this.connectionTestResult.set('failed');
      });
  }

  onSubmit(): void {
    if (this.isFormValid()) {
      // Order matters: kick off the service call first (it reads
      // orgForm.value synchronously) and only THEN disable the form.
      // form.disable() hides disabled controls from .value, so
      // disabling before the call would strip the payload.
      const request = this.organisationService.add(this.orgForm);
      this.orgForm.disable({ emitEvent: false });
      request
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.isFormDirty = false;
            this.router.navigate([ORGANISATION.LIST]);
          }
        })
        .finally(() => {
          this.orgForm.enable({ emitEvent: false });
        });
    }
  }

  onCancel(): void {
    this.orgForm.reset();
    this.currentStep = 0;
    this.isFormDirty = false;
    this.connectionTested.set(false);
    this.connectionTestResult.set(null);
    this.connectionTestError.set(null);
    this.connectionTestLoading.set(false);
    this.testRequestId++;
    this.orgForm.markAsPristine();
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
    });
    this.orgForm.patchValue({
      dbAcknowledgment: false,
      schemaAcknowledgment: false,
    });
  }

  toggleDbPasswordVisibility(event: Event) {
    event.preventDefault();
    this.showDbPassword = !this.showDbPassword;
  }

  isFormValid(): boolean {
    return (
      this.orgForm.valid &&
      this.orgForm.get('dbAcknowledgment')?.value &&
      this.orgForm.get('schemaAcknowledgment')?.value &&
      this.connectionTested()
    );
  }

  getNameError(): string {
    const control = this.orgForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.ORG_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.ORG_NAME_MIN_LENGTH', {
        length: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.ORG_NAME_MAX_LENGTH', {
        length: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.ORG_NAME_PATTERN');
    return '';
  }

  getDescriptionError(): string {
    const control = this.orgForm.get('description');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.DESCRIPTION_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.DESCRIPTION_MIN_LENGTH', {
        length: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.DESCRIPTION_MAX_LENGTH', {
        length: control.errors['maxlength'].requiredLength,
      });
    return '';
  }

  getDbSchemaError(): string {
    const control = this.orgForm.get('dbSchema');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.SCHEMA_REQUIRED');
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.SCHEMA_MAX_LENGTH');
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.SCHEMA_PATTERN');
    return '';
  }

  getDbFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required'])
        return this.translate.instant('VALIDATION.FIELD_REQUIRED');
      if (control.errors['pattern']) {
        switch (fieldName) {
          case 'dbHost':
            return this.translate.instant('VALIDATION.INVALID_HOST_FORMAT');
          case 'dbPort':
            return this.translate.instant('VALIDATION.PORT_MUST_BE_NUMBER');
          case 'dbName':
            return this.translate.instant('VALIDATION.DB_NAME_PATTERN');
          default:
            return this.translate.instant('VALIDATION.INVALID_FORMAT');
        }
      }
      if (control.errors['min'] && fieldName === 'dbPort')
        return this.translate.instant('VALIDATION.PORT_MIN');
      if (control.errors['max'] && fieldName === 'dbPort')
        return this.translate.instant('VALIDATION.PORT_MAX');
      if (control.errors['email'])
        return this.translate.instant('VALIDATION.EMAIL_INVALID');
    }
    return '';
  }
}
