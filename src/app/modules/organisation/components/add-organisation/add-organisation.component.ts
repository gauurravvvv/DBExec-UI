import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
import {
  adminEmailSchema,
  adminLocaleSchema,
  dbHostSchema,
  dbNameSchema,
  dbPasswordSchema,
  dbPortSchema,
  dbSchemaSchema,
  dbUsernameSchema,
  orgDescriptionSchema,
  orgNameSchema,
} from 'src/app/shared/validators/organisation';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
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
    // Every field validator below is sourced from the SHARED Zod
    // schema in src/app/shared/validators/organisation.ts. The
    // identical file exists in the BE repo, so what the FE rejects
    // is exactly what the BE rejects — same regex, same min/max,
    // same required flags, same translation keys.
    this.orgForm = this.fb.group({
      name: ['', [zodValidator(orgNameSchema)]],
      description: ['', [zodValidator(orgDescriptionSchema)]],
      // Encryption configuration is no longer collected from the
      // admin. The BE generates a per-org AES-256-GCM Data Encryption
      // Key (DEK) server-side and wraps it under the platform master
      // key on every org creation. See SECURITY.md for the design.
      dbHost: ['', [zodValidator(dbHostSchema)]],
      dbPort: ['', [zodValidator(dbPortSchema)]],
      dbName: ['', [zodValidator(dbNameSchema)]],
      dbSchema: ['', [zodValidator(dbSchemaSchema)]],
      dbUsername: ['', [zodValidator(dbUsernameSchema)]],
      dbPassword: ['', [zodValidator(dbPasswordSchema)]],
      adminEmail: ['', [zodValidator(adminEmailSchema)]],
      adminLocale: ['en', [zodValidator(adminLocaleSchema)]],
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
    const emailValid = this.orgForm.get('adminEmail')?.valid || false;
    const localeValid = this.orgForm.get('adminLocale')?.valid || false;
    // Step 1 now collects org basics AND the bootstrap admin's
    // identity (email + locale). All four must be valid to advance.
    return nameValid && descValid && emailValid && localeValid;
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
        schema: formValue.dbSchema,
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

        const data = response?.data;
        if (!data?.isConnected) {
          this.connectionTested.set(false);
          this.connectionTestResult.set('failed');
          return;
        }

        // Connection succeeded — now gate on schema state. The BE
        // returns 'absent' / 'empty' / 'occupied'. Only 'absent' and
        // 'empty' are acceptable; 'occupied' means the user picked a
        // schema that already holds data we won't touch.
        if (data.schemaState === 'occupied') {
          this.connectionTested.set(false);
          this.connectionTestResult.set('failed');
          this.connectionTestError.set(
            this.translate.instant('ORG.SCHEMA_NOT_EMPTY'),
          );
          return;
        }

        this.connectionTested.set(true);
        this.connectionTestResult.set('success');
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

  /**
   * Unified error getter. Reads the `zod` error key produced by
   * `zodValidator` on every control wired through the shared schema
   * and runs it through ngx-translate. The same translation key is
   * what the BE returns on a 400 response, so a server-side failure
   * surfaces with the exact same text the inline form error showed.
   */
  fieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  // Backwards-compat aliases — kept short so existing templates work
  // without a sweep. New code should call fieldError(name) directly.
  getNameError(): string {
    return this.fieldError('name');
  }
  getDescriptionError(): string {
    return this.fieldError('description');
  }
  getDbSchemaError(): string {
    return this.fieldError('dbSchema');
  }
  getDbFieldError(fieldName: string): string {
    return this.fieldError(fieldName);
  }
}
