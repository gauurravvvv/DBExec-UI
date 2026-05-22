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
import {
  DATABASE_TYPES,
  isSnowflakeType,
} from '../../constants/database-types.constant';
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
  databaseTypes = DATABASE_TYPES;

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

    // Reset connection test when connection fields change. `type` is in
    // the list so switching DB engines also forces a re-test — credentials
    // valid for Postgres may not be valid for MySQL even if the host /
    // user look the same. Snowflake adds account/warehouse/role/schemaName
    // to the reset set since they're part of the connection identity.
    // Bumping the request id invalidates any in-flight response so it
    // can't apply stale state.
    [
      'type',
      'host',
      'port',
      'database',
      'username',
      'password',
      'account',
      'warehouse',
      'role',
      'schemaName',
    ].forEach(
      field => {
        this.datasourceForm
          .get(field)
          ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.connectionTested = false;
            this.connectionTestResult = null;
            this.connectionTestError = null;
            this.testRequestId++;
          });
      },
    );

    // Type-change side effects: (a) swap field validators, (b) smart
    // port pre-fill. Snowflake skips the port-fill since it has no port.
    this.datasourceForm
      .get('type')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: string) => {
        this.applyTypeValidators(value);

        const matched = this.databaseTypes.find(t => t.value === value);
        if (!matched || matched.defaultPort === null) return;
        const portControl = this.datasourceForm.get('port');
        if (!portControl) return;
        const currentPort = portControl.value;
        const isEmpty = currentPort === '' || currentPort == null;
        const isKnownDefault = this.databaseTypes.some(
          t => t.defaultPort !== null && String(t.defaultPort) === String(currentPort),
        );
        if (isEmpty || isKnownDefault) {
          portControl.setValue(matched.defaultPort, { emitEvent: false });
        }
      });

    // Initial seed — pin validators + port for whatever engine the form
    // starts on (Postgres by default).
    const initialType = this.datasourceForm.get('type')?.value;
    this.applyTypeValidators(initialType);
    const initialMatch = this.databaseTypes.find(t => t.value === initialType);
    if (initialMatch && initialMatch.defaultPort !== null) {
      this.datasourceForm
        .get('port')
        ?.setValue(initialMatch.defaultPort, { emitEvent: false });
    }
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
      type: ['postgres', Validators.required],
      // host / port — required for TypeORM engines, optional for
      // Snowflake. Validators are swapped in applyTypeValidators()
      // based on the selected engine.
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
      // Snowflake-specific. account+warehouse are required when the
      // engine is Snowflake (validators flipped at runtime); role and
      // schemaName stay optional.
      account: [''],
      warehouse: [''],
      role: [''],
      schemaName: [''],
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
   * True when the currently-selected engine is Snowflake. Drives both
   * the conditional template rendering (show/hide host vs account
   * fields) and the runtime validator swap below.
   */
  get isSnowflake(): boolean {
    return isSnowflakeType(this.datasourceForm?.get('type')?.value);
  }

  /**
   * Swap field-required validators based on the selected engine. The
   * form has both shape's fields declared up-front; this method just
   * marks the right subset as required for the current engine.
   */
  private applyTypeValidators(value: string | null): void {
    const isSf = isSnowflakeType(value);
    const set = (
      name: string,
      required: boolean,
      extras: any[] = [],
    ): void => {
      const ctrl = this.datasourceForm.get(name);
      if (!ctrl) return;
      ctrl.setValidators(
        required ? [Validators.required, ...extras] : extras,
      );
      ctrl.updateValueAndValidity({ emitEvent: false });
    };
    // host + port → required for TypeORM engines, optional for Snowflake
    set('host', !isSf, [Validators.pattern('^[a-zA-Z0-9.-]+$')]);
    set('port', !isSf, [
      Validators.pattern('^[0-9]+$'),
      Validators.min(1),
      Validators.max(65535),
    ]);
    // account + warehouse → required for Snowflake, optional otherwise
    set('account', isSf);
    set('warehouse', isSf);
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
      const isSf = isSnowflakeType(formValue.type);

      const payload: any = {
        name: formValue.name,
        description: formValue.description,
        type: formValue.type,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        organisation: formValue.organisation,
      };

      if (isSf) {
        // Snowflake fields. host/port are not included — the BE entity
        // stores empty-string / 0 sentinels for those columns.
        payload.account = formValue.account;
        payload.warehouse = formValue.warehouse;
        payload.role = formValue.role;
        payload.schemaName = formValue.schemaName;
      } else {
        payload.host = formValue.host;
        payload.port = formValue.port;
      }

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
      // Restore the default engine + its standard port. setValue
      // triggers valueChanges so the smart-prefill logic above re-runs
      // and the port lands on 5432, matching the screen the user saw on
      // first arrival.
      this.datasourceForm.get('type')?.setValue('postgres');
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

    const isSf = isSnowflakeType(formValue.type);
    this.organisationService
      .validateDatasource(
        isSf
          ? {
              type: formValue.type,
              database: formValue.database,
              username: formValue.username,
              password: formValue.password,
              account: formValue.account,
              warehouse: formValue.warehouse,
              role: formValue.role,
              schemaName: formValue.schemaName,
            }
          : {
              type: formValue.type,
              host: formValue.host,
              port: formValue.port,
              database: formValue.database,
              username: formValue.username,
              password: formValue.password,
            },
      )
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
    // Snowflake needs account + warehouse instead of host + port.
    // role + schemaName are optional in both shapes.
    const fields = this.isSnowflake
      ? ['account', 'warehouse', 'database', 'username', 'password']
      : ['host', 'port', 'database', 'username', 'password'];
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
