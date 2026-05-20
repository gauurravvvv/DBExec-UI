import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from '../../services/datasource.service';

@Component({
  selector: 'app-add-datasource',
  templateUrl: './add-datasource.component.html',
  styleUrls: ['./add-datasource.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddDatasourceComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  datasourceForm!: FormGroup;
  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  private _showOrganisationDropdown = false;
  showPassword: boolean = false;

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;
  connectionTestError: string | null = null;
  // Sequence counter so in-flight responses that arrive after field edits
  // (or another newer test) are ignored — prevents a stale "Connected" state.
  private testRequestId = 0;

  saving = this.datasourceService.saving;

  constructor(
    private fb: FormBuilder,
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  get isFormDirty(): boolean {
    return this.datasourceForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.showOrganisationDropdown =
      this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;

    this.initForm();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }

    // Reset connection test when connection fields change. Bumping the request
    // id invalidates any in-flight response so it can't apply stale state.
    ['host', 'port', 'database', 'username', 'password'].forEach(field => {
      this.datasourceForm
        .get(field)
        ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.connectionTested = false;
          this.connectionTestResult = null;
          this.connectionTestError = null;
          this.testRequestId++;
        });
    });
  }

  initForm(): void {
    this.datasourceForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: ['', [Validators.maxLength(500)]],
      type: [{ value: 'postgres', disabled: true }],
      host: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9.-]+$')]],
      port: [
        '',
        [
          Validators.required,
          Validators.pattern('^[0-9]+$'),
          Validators.min(1),
          Validators.max(65535),
        ],
      ],
      database: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z0-9_-]+$')],
      ],
      username: ['', Validators.required],
      password: ['', [Validators.required]],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
    });

    const orgControl = this.datasourceForm.get('organisation');
    if (this.showOrganisationDropdown) {
      orgControl?.setValidators([Validators.required]);
    }
  }

  /**
   * Fetcher for the server-mode organisation dropdown.
   */
  loadOrgsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadOrganisations(): void {
    if (this.showOrganisationDropdown) {
      const params = {
        page: DEFAULT_PAGE,
        limit: 10,
      };
      this.organisationService.listOrganisation(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const orgs = response?.data?.orgs ?? [];
          this.organisations = [...orgs];
          this.preloadedOrgs = orgs;
          this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
          this.cdr.markForCheck();
        }
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.datasourceForm.valid && this.connectionTested) {
      const formValue = this.datasourceForm.getRawValue();

      const payload: any = {
        name: formValue.name,
        description: formValue.description,
        type: formValue.type,
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        organisation: formValue.organisation,
      };

      const response = await this.datasourceService.add(payload);
      if (this.globalService.handleSuccessService(response)) {
        this.datasourceForm.markAsPristine();
        this.router.navigate([DATASOURCE.LIST]);
      }
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.datasourceForm.reset();
      this.datasourceForm.get('type')?.setValue('postgres');
      this.datasourceForm.get('type')?.disable();
      this.datasourceForm.markAsPristine();
      this.connectionTested = false;
      this.connectionTestLoading = false;
      this.connectionTestResult = null;
      this.connectionTestError = null;
      this.testRequestId++;
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.datasourceForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required'])
        return this.translate.instant('VALIDATION.FIELD_REQUIRED');
      if (control.errors['minlength'])
        return this.translate.instant('VALIDATION.MIN_LENGTH', {
          length: control.errors['minlength'].requiredLength,
        });
      if (control.errors['maxlength'])
        return this.translate.instant('VALIDATION.MAX_LENGTH', {
          length: control.errors['maxlength'].requiredLength,
        });
      if (control.errors['pattern']) {
        switch (fieldName) {
          case 'name':
            return this.translate.instant('VALIDATION.NAME_PATTERN');
          case 'host':
            return this.translate.instant('VALIDATION.INVALID_HOST_FORMAT');
          case 'port':
            return this.translate.instant('VALIDATION.PORT_MUST_BE_NUMBER');
          case 'database':
            return this.translate.instant('VALIDATION.DATABASE_NAME_PATTERN');
          default:
            return this.translate.instant('VALIDATION.INVALID_FORMAT');
        }
      }
      if (control.errors['min'] && fieldName === 'port')
        return this.translate.instant('VALIDATION.PORT_MIN');
      if (control.errors['max'] && fieldName === 'port')
        return this.translate.instant('VALIDATION.PORT_MAX');
    }
    return '';
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

  testConnection(): void {
    // Re-entry guard: ignore clicks when the test is in flight or already
    // succeeded for the current set of credentials. The valueChanges hook
    // unlocks the button by resetting connectionTested when fields change.
    if (
      !this.isConnectionFieldsValid() ||
      this.connectionTestLoading ||
      this.connectionTested
    )
      return;

    const formValue = this.datasourceForm.getRawValue();
    if (!formValue.password) {
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
      .validateDatasource({
        type: formValue.type,
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
      })
      .then((response: any) => {
        // Discard if user has edited a field or started a newer test
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

  isConnectionFieldsValid(): boolean {
    const fields = ['host', 'port', 'database', 'username', 'password'];
    return fields.every(
      f =>
        this.datasourceForm.get(f)?.valid && this.datasourceForm.get(f)?.value,
    );
  }

  isFormValid(): boolean {
    return this.datasourceForm.valid && this.connectionTested;
  }

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  set showOrganisationDropdown(value: boolean) {
    this._showOrganisationDropdown = value;
    if (this.datasourceForm) {
      const orgControl = this.datasourceForm.get('organisation');

      if (value) {
        orgControl?.enable();
        orgControl?.setValidators([Validators.required]);
      } else {
        orgControl?.disable();
        orgControl?.clearValidators();
        orgControl?.setValue(null);
      }
    }
  }

  get showOrganisationDropdown(): boolean {
    return this._showOrganisationDropdown;
  }
}
