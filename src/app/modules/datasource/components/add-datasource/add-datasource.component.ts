import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  dbDisplayNameSchema,
  dbHostSchema,
  dbNameSchema,
  dbPasswordSchema,
  dbPortSchema,
  dbTypeSchema,
  dbUsernameSchema,
  descriptionSchema,
  snowflakeAccountSchema,
  snowflakeRoleSchema,
  snowflakeSchemaSchema,
  snowflakeWarehouseSchema,
} from 'src/app/shared/validators/datasources';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
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
    this.initForm();

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
    ].forEach(field => {
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
          t =>
            t.defaultPort !== null &&
            String(t.defaultPort) === String(currentPort),
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
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/datasources.ts (mirrored to BE).
    this.datasourceForm = this.fb.group({
      name: ['', [zodValidator(dbDisplayNameSchema)]],
      description: ['', [zodValidator(descriptionSchema)]],
      type: ['postgres', [zodValidator(dbTypeSchema)]],
      // host / port — required for TypeORM engines, optional for
      // Snowflake. Validators are swapped in applyTypeValidators()
      // based on the selected engine.
      host: ['', [zodValidator(dbHostSchema)]],
      port: ['', [zodValidator(dbPortSchema)]],
      database: ['', [zodValidator(dbNameSchema)]],
      username: ['', [zodValidator(dbUsernameSchema)]],
      password: ['', [zodValidator(dbPasswordSchema)]],
      // Snowflake-specific. account+warehouse are required when the
      // engine is Snowflake (validators flipped at runtime); role and
      // schemaName stay optional.
      account: ['', [zodValidator(snowflakeRoleSchema)]],
      warehouse: ['', [zodValidator(snowflakeRoleSchema)]],
      role: ['', [zodValidator(snowflakeRoleSchema)]],
      schemaName: ['', [zodValidator(snowflakeSchemaSchema)]],
    });
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
    const swap = (name: string, validator: any): void => {
      const ctrl = this.datasourceForm.get(name);
      if (!ctrl) return;
      ctrl.setValidators(validator);
      ctrl.updateValueAndValidity({ emitEvent: false });
    };
    // host + port → required for TypeORM engines, optional for Snowflake
    swap('host', zodValidator(isSf ? snowflakeRoleSchema : dbHostSchema));
    swap('port', isSf ? null : zodValidator(dbPortSchema));
    // account + warehouse → required for Snowflake, optional otherwise
    swap(
      'account',
      zodValidator(isSf ? snowflakeAccountSchema : snowflakeRoleSchema),
    );
    swap(
      'warehouse',
      zodValidator(isSf ? snowflakeWarehouseSchema : snowflakeRoleSchema),
    );
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

      // Payload was already extracted via getRawValue() above, so we
      // can safely disable the whole form before firing the POST.
      this.datasourceForm.disable({ emitEvent: false });
      try {
        const response = await this.datasourceService.add(payload);
        if (this.globalService.handleSuccessService(response)) {
          this.datasourceForm.markAsPristine();
          this.router.navigate([DATASOURCE.LIST]);
        }
      } finally {
        this.datasourceForm.enable({ emitEvent: false });
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
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
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

    // DatasourceService.testConnection() handles the engine
    // discriminator internally — same payload shape we'd pass to
    // add()/update(), so the test path mirrors the save path.
    this.datasourceService
      .testConnection(formValue)
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
}
