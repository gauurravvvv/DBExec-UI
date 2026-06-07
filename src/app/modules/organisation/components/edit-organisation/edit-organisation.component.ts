import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

@Component({
  selector: 'app-edit-organisation',
  templateUrl: './edit-organisation.component.html',
  styleUrls: ['./edit-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditOrganisationComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.organisationService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  saving = this.organisationService.saving;
  // Drives the skeleton form while the GET that hydrates the form is
  // in flight. Sourced from the service so toggling it elsewhere
  // (cache invalidation, refetch on focus) flows through automatically.
  loading = this.organisationService.loading;

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

  // Stepper — security/email moved to App Settings (per-org OrgPolicy).
  // Edit Organisation now has at most two steps: org details, master DB.
  currentStep = 0;

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;
  connectionTestError: string | null = null;
  // Sequence counter so in-flight responses that arrive after field edits
  // (or another newer test) are ignored — prevents a stale "Connected" state.
  private testRequestId = 0;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
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
      // Security + email policy moved to per-org OrgPolicy (App Settings).
    });

    this.orgForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
        const currentValue = this.orgForm.getRawValue();
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

    // Reset connection test when DB fields change. Bumping the request id
    // invalidates any in-flight response so it can't apply stale state.
    ['dbHost', 'dbPort', 'dbName', 'dbUsername', 'dbPassword'].forEach(
      field => {
        this.orgForm
          .get(field)
          ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.connectionTested = false;
            this.connectionTestResult = null;
            this.connectionTestError = null;
            this.testRequestId++;
            this.cdr.markForCheck();
          });
      },
    );
  }

  private async loadOrganisationData() {
    // Signal-based loadOne flips service.loading() true → fetches with
    // skipLoader:true → flips it false. The template's skeleton-form
    // mirrors that signal so the user sees a shape-correct placeholder
    // immediately, no global blocker.
    //
    // loadOne only writes to current() when res.status === true, so by
    // the time we reach here we either have a hydrated org or null —
    // either way, the service already shielded us from the error path
    // and the global HTTP interceptor handled any toast. We apply the
    // data directly; routing through handleSuccessService would
    // misfire (no `code` on a synthetic wrapper) and trip an error
    // toast on a perfectly good 200 response.
    await this.organisationService.loadOne(this.organisationId);
    const data = this.organisationService.current();
    if (data) this.applyLoadedOrg(data);
  }

  private applyLoadedOrg(data: any) {
    this.orgData = data;
    this.hasMasterDb = !!data.masterDbConfig;

    this.orgForm.patchValue({
      id: data.id,
      name: data.name,
      description: data.description,
      status: data.status,
      dbHost: data.masterDbConfig?.hostname || '',
      dbPort: data.masterDbConfig?.port || '',
      dbName: data.masterDbConfig?.dbName || '',
      dbUsername: data.masterDbConfig?.username || '',
      dbPassword: '',
    });

    this.isFormDirty = false;

    // Organisation name cannot be changed after creation.
    this.orgForm.get('name')?.disable();
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

  // Step navigation
  nextStep() {
    if (this.currentStep === 0 && this.isStep1Valid() && this.hasMasterDb) {
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
    } else if (
      step === 1 &&
      this.currentStep === 0 &&
      this.isStep1Valid() &&
      this.hasMasterDb
    ) {
      this.currentStep = 1;
    }
  }

  // Connection test
  testConnection() {
    // Re-entry guard: ignore clicks when the test is in flight or already
    // succeeded for the current set of credentials. The valueChanges hook
    // unlocks the button by resetting connectionTested when fields change.
    if (
      !this.isDbConnectionFieldsValid() ||
      this.connectionTestLoading ||
      this.connectionTested
    )
      return;

    const formValue = this.orgForm.value;
    if (!formValue.dbPassword) {
      this.connectionTested = false;
      this.connectionTestResult = 'failed';
      this.connectionTestError = this.translate.instant(
        'ORG.DB_PASSWORD_REQUIRED',
      );
      this.cdr.markForCheck();
      return;
    }

    this.connectionTestLoading = true;
    this.connectionTestResult = null;
    this.connectionTestError = null;
    const reqId = ++this.testRequestId;

    this.organisationService
      .validateMasterDb({
        host: formValue.dbHost,
        port: formValue.dbPort,
        database: formValue.dbName,
        // Schema isn't editable on Edit Org — pass the existing one
        // so the BE can still run its connection check. Empty-check
        // will pass because we already own/use this schema; this is
        // purely a reachability test.
        schema: this.orgData?.masterDbConfig?.schema || '',
        username: formValue.dbUsername,
        password: formValue.dbPassword,
      })
      .then((response: any) => {
        if (reqId !== this.testRequestId) return;
        this.connectionTestLoading = false;
        if (response?.code !== 200) {
          this.connectionTested = false;
          this.connectionTestResult = 'failed';
          this.connectionTestError = response?.message || null;
          this.cdr.markForCheck();
          return;
        }
        if (response?.data?.isConnected) {
          this.connectionTested = true;
          this.connectionTestResult = 'success';
        } else {
          this.connectionTested = false;
          this.connectionTestResult = 'failed';
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        if (reqId !== this.testRequestId) return;
        this.connectionTestLoading = false;
        this.connectionTested = false;
        this.connectionTestResult = 'failed';
        this.cdr.markForCheck();
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
      // Order matters: fire the request first (service reads
      // orgForm.value synchronously) then disable the form so the
      // user can't edit fields while the PUT is in flight.
      const request = this.organisationService.edit(
        this.orgForm,
        this.saveJustification.trim(),
      );
      this.orgForm.disable({ emitEvent: false });
      request
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.isFormDirty = false;
            this.orgForm.markAsPristine();
            this.router.navigate([ORGANISATION.LIST]);
          }
        })
        .finally(() => {
          this.orgForm.enable({ emitEvent: false });
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
    this.connectionTestError = null;
    this.connectionTestLoading = false;
    this.testRequestId++;
  }

  isFormValid(): boolean {
    return this.orgForm.valid && this.isFormDirty;
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

  getDbFieldError(fieldName: string): string {
    const control = this.orgForm.get(fieldName);
    if (control?.errors) {
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
    }
    return '';
  }
}
