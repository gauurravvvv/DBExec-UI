import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
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
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import {
  dbDisplayNameSchema,
  dbHostSchema,
  dbNameSchema,
  dbPortSchema,
  dbUsernameSchema,
  descriptionSchema,
} from 'src/app/shared/validators/datasources';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  DATABASE_TYPES,
  DatabaseTypeOption,
} from '../../constants/database-types.constant';
import { DatasourceService } from '../../services/datasource.service';

@Component({
  selector: 'app-edit-datasource',
  templateUrl: './edit-datasource.component.html',
  styleUrls: ['./edit-datasource.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ opacity: 0, transform: 'translateY(-10px)' }),
        ),
      ]),
    ]),
    trigger('expandCollapse', [
      state(
        'collapsed',
        style({
          height: '0',
          overflow: 'hidden',
          opacity: '0',
          padding: '0 1rem',
        }),
      ),
      state(
        'expanded',
        style({
          height: '*',
          overflow: 'hidden',
          opacity: '1',
          padding: '1rem',
        }),
      ),
      transition('collapsed <=> expanded', [animate('300ms ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDatasourceComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.datasourceService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  datasourceForm!: FormGroup;
  isFormDirty = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  showPassword: boolean = false;
  datasourceId: string = '';
  initialFormValues: any = null;
  isWarningExpanded: boolean = false;

  // dbType is immutable on edit — kept on the component (not the form) so
  // it can't be sent in the update payload by accident, and so the
  // connection-test call carries the *actual* stored engine instead of a
  // hardcoded 'postgres'. dbTypeOption is the matching constant row,
  // used to render the read-only icon + label.
  dbType: string = 'postgres';
  dbTypeOption: DatabaseTypeOption | null = null;

  showSaveConfirm = false;
  saveJustification = '';

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;
  connectionTestError: string | null = null;
  // Sequence counter so in-flight responses that arrive after field edits
  // (or another newer test) are ignored — prevents a stale "Connected" state.
  private testRequestId = 0;

  saving = this.datasourceService.saving;
  // Drives the form vs skeleton swap on initial GET.
  loading = this.datasourceService.loading;
  // True once loadOne resolves and we've patched the form — the
  // skeleton hides and the form takes over. Decoupled from `loading`
  // so quick refreshes don't flash the skeleton.
  datasourceLoaded = false;

  constructor(
    private fb: FormBuilder,
    private datasourceService: DatasourceService,
    private globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.datasourceId = this.route.snapshot.params['id'];
    this.loadDatasourceData();

    // Monitor form changes
    this.datasourceForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.initialFormValues) {
          this.isFormDirty = !this.isEqual(
            this.datasourceForm.getRawValue(),
            this.initialFormValues,
          );
        }
      });

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
    // Field validators sourced from the SHARED Zod schema. password
    // is intentionally validator-less here — empty means "leave the
    // stored password alone"; the BE update schema accepts that.
    this.datasourceForm = this.fb.group({
      name: ['', [zodValidator(dbDisplayNameSchema)]],
      description: ['', [zodValidator(descriptionSchema)]],
      host: ['', [zodValidator(dbHostSchema)]],
      port: ['', [zodValidator(dbPortSchema)]],
      database: ['', [zodValidator(dbNameSchema)]],
      username: ['', [zodValidator(dbUsernameSchema)]],
      password: [''],
      status: [true],
    });
  }

  async loadDatasourceData(): Promise<void> {
    await this.datasourceService.loadOne(this.datasourceId);
    const data = this.datasourceService.current();
    if (data) {
      // dbType is read once from the saved record and used for the
      // connection-test call + the read-only display row. It cannot
      // be edited so it isn't part of the form.
      //
      // NOTE: Editing a Snowflake datasource on this screen is not
      // yet supported — the form below shows host/port (TypeORM
      // shape) but a Snowflake datasource has account/warehouse/role
      // instead. As a workaround for now, a Snowflake datasource
      // can be deleted + recreated. Full edit support is a follow-up.
      this.dbType = data.config?.dbType || 'postgres';
      this.dbTypeOption =
        DATABASE_TYPES.find(t => t.value === this.dbType) || null;

      const formData = {
        name: data.name,
        description: data.description || '',
        host: data.config?.hostname || '',
        port: data.config?.port || '',
        database: data.config?.dbName || '',
        username: data.config?.username || '',
        password: '',
        status: data.status === 1,
      };

      this.initialFormValues = { ...formData };
      this.datasourceForm.patchValue(formData);
      this.isFormDirty = false;

      // Connection is already valid since the DB was fetched successfully
      this.connectionTested = true;
      this.connectionTestResult = 'success';
      this.datasourceLoaded = true;
      this.cdr.markForCheck();
    }
  }

  isConnectionFieldsValid(): boolean {
    const fields = ['host', 'port', 'database', 'username'];
    return fields.every(
      f =>
        this.datasourceForm.get(f)?.valid && this.datasourceForm.get(f)?.value,
    );
  }

  isConnectionFieldsDirty(): boolean {
    if (!this.initialFormValues) return false;
    const current = this.datasourceForm.getRawValue();
    return ['host', 'port', 'database', 'username', 'password'].some(
      key => current[key] !== this.initialFormValues[key],
    );
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
    // discriminator internally (snowflake vs typeorm), so we just
    // pass the form value verbatim — same shape as save.
    this.datasourceService
      .testConnection({ type: this.dbType, ...formValue })
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

  onSubmit(): void {
    if (this.datasourceForm.valid && this.connectionTested) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      const formValue = this.datasourceForm.getRawValue();

      // `type` is sent so DatasourceService.buildEnginePayload() can
      // discriminate between the typeorm shape (host/port) and the
      // snowflake shape (account/warehouse/role/schemaName). The BE
      // update path still treats `type` as immutable — it's used
      // purely as a routing hint, the existing config-row type wins.
      //
      // `organisation` is deliberately NOT sent — moving a datasource
      // across orgs would orphan every dataset/analysis/dashboard
      // pointing at it.
      const isSf = this.dbType === 'snowflake';
      const payload: any = {
        id: this.datasourceId,
        name: formValue.name,
        description: formValue.description,
        type: this.dbType,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        status: formValue.status ? 1 : 0,
      };
      if (isSf) {
        payload.account = formValue.account;
        payload.warehouse = formValue.warehouse;
        payload.role = formValue.role;
        payload.schemaName = formValue.schemaName;
      } else {
        payload.host = formValue.host;
        payload.port = formValue.port;
      }

      // Payload was already extracted via getRawValue(), so we can
      // safely disable the whole form before firing the PUT.
      this.datasourceForm.disable({ emitEvent: false });
      try {
        const response = await this.datasourceService.update(
          payload,
          this.saveJustification.trim(),
        );
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.isFormDirty = false;
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
      // Bump first so any in-flight test response is discarded; valueChanges
      // from patchValue will clear state and bump again — both safe.
      this.testRequestId++;
      this.datasourceForm.patchValue(this.initialFormValues);
      this.isFormDirty = false;
      // Restore connection test state since we reset to original values
      this.connectionTested = true;
      this.connectionTestResult = 'success';
      this.connectionTestError = null;
      this.connectionTestLoading = false;
    } else {
      this.router.navigate([DATASOURCE.LIST]);
    }
  }

  isFormValid(): boolean {
    return (
      this.datasourceForm.valid && this.isFormDirty && this.connectionTested
    );
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

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  toggleWarning(): void {
    this.isWarningExpanded = !this.isWarningExpanded;
  }

  onStatusChange(event: any): void {
    this.datasourceForm.patchValue({
      status: event.checked,
    });
  }

  onNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
  }

  private isEqual(obj1: any, obj2: any): boolean {
    const form = { ...obj1 };
    const initial = { ...obj2 };

    // Exclude password from comparison if it's empty in the form
    if (!form.password) {
      delete form.password;
      delete initial.password;
    }

    return JSON.stringify(form) === JSON.stringify(initial);
  }
}
