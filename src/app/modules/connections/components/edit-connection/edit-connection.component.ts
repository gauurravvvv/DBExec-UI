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
import { CONNECTION } from 'src/app/core/constants/routes.constant';
import {
  connectionDescriptionSchema,
  connectionNameSchema,
} from 'src/app/shared/validators/connections';
import {
  dbPasswordSchema,
  dbUsernameSchema,
} from 'src/app/shared/validators/datasources';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-edit-connection',
  templateUrl: './edit-connection.component.html',
  styleUrls: ['./edit-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditConnectionComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.connectionService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  connectionForm!: FormGroup;
  connectionId: string = '';
  selectedDatasourceName: string = '';
  connectionData: any;
  isCancelClicked = false;
  showPassword = false;
  showSaveConfirm = false;
  saveJustification = '';

  /**
   * dbType of the parent datasource. Set after `loadConnectionData`
   * resolves and we fetch the datasource record via
   * `viewDatasource`. Drives the credentials-for badge and per-
   * dialect placeholder copy, matching add-connection. Null until
   * the lookup lands; the badge stays hidden in the meantime.
   */
  selectedDbType: string | null = null;

  saving = this.connectionService.saving;
  // Drives the form vs skeleton swap on initial GET.
  loading = this.connectionService.loading;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private connectionService: ConnectionService,
    private datasourceService: DatasourceService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.connectionId = this.route.snapshot.params['id'];

    if (this.connectionId) {
      this.loadConnectionData();
    }

    this.connectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.connectionForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    // Field validators sourced from the SHARED Zod schema.
    this.connectionForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(connectionNameSchema)]],
      description: ['', [zodValidator(connectionDescriptionSchema)]],
      datasource: [''],
      status: [false],
      dbUsername: ['', [zodValidator(dbUsernameSchema)]],
      dbPassword: ['', [zodValidator(dbPasswordSchema)]],
    });
  }

  async loadConnectionData(): Promise<void> {
    await this.connectionService.loadOne(this.connectionId);
    const data = this.connectionService.current();
    if (data) {
      this.connectionData = data;

      this.connectionForm.patchValue({
        id: this.connectionData.id,
        name: this.connectionData.name,
        description: this.connectionData.description,
        datasource: this.connectionData.datasourceId,
        status: this.connectionData.status,
        dbUsername: this.connectionData.dbUsername,
      });

      this.selectedDatasourceName = this.connectionData.datasource?.name || '';

      this.connectionForm.markAsPristine();

      // Fetch the parent datasource once so the badge + per-
      // dialect placeholder copy can render.
      const datasourceId = this.connectionData.datasourceId;
      if (datasourceId) {
        this.datasourceService
          .viewDatasource(datasourceId)
          .then((res: any) => {
            if (!this.globalService.handleSuccessService(res, false)) return;
            this.selectedDbType = res?.data?.config?.dbType ?? null;
            this.cdr.markForCheck();
          })
          .catch(() => {
            // Non-fatal — form just falls back to generic copy.
            this.selectedDbType = null;
            this.cdr.markForCheck();
          });
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Pretty-print map for the badge. See AddConnectionComponent for
   * the matching version — kept local rather than promoted to a
   * util since this is the only other consumer and the map is six
   * lines long.
   */
  private static readonly DB_TYPE_LABELS: Record<string, string> = {
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    mariadb: 'MariaDB',
    mssql: 'Microsoft SQL Server',
    oracle: 'Oracle',
    snowflake: 'Snowflake',
  };

  get selectedDbTypeLabel(): string {
    const t = (this.selectedDbType || '').toLowerCase();
    if (!t) return '';
    return (
      EditConnectionComponent.DB_TYPE_LABELS[t] ||
      t.charAt(0).toUpperCase() + t.slice(1)
    );
  }

  get usernamePlaceholderKey(): string {
    switch ((this.selectedDbType || '').toLowerCase()) {
      case 'snowflake':
        return 'CONNECTION.PH_SNOWFLAKE_USER';
      case 'oracle':
        return 'CONNECTION.PH_ORACLE_USER';
      case 'mssql':
        return 'CONNECTION.PH_MSSQL_USER';
      case 'mysql':
      case 'mariadb':
        return 'CONNECTION.PH_MYSQL_USER';
      default:
        return 'CONNECTION.ENTER_DATASOURCE_USERNAME';
    }
  }

  get passwordPlaceholderKey(): string {
    return this.selectedDbType === 'snowflake'
      ? 'CONNECTION.PH_SNOWFLAKE_PASSWORD'
      : 'CONNECTION.ENTER_PASSWORD';
  }

  onSubmit(): void {
    if (this.connectionForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      // Fire the request first (service.update uses getRawValue,
      // disable order safe, kept consistent with the rollout) then
      // lock the form for the duration of the PUT.
      const request = this.connectionService.update(
        this.connectionForm,
        this.saveJustification.trim(),
      );
      this.connectionForm.disable({ emitEvent: false });
      try {
        const response = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.connectionForm.markAsPristine();
          this.router.navigate([CONNECTION.LIST]);
        }
      } finally {
        this.connectionForm.enable({ emitEvent: false });
        this.cdr.markForCheck();
      }
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.connectionForm.patchValue({
        id: this.connectionData.id,
        name: this.connectionData.name,
        description: this.connectionData.description,
        datasource: this.connectionData.datasourceId,
        status: this.connectionData.status,
        dbUsername: this.connectionData.dbUsername,
        dbPassword: '',
      });

      this.isCancelClicked = true;
      this.connectionForm.markAsPristine();
    } else {
      this.router.navigate([CONNECTION.LIST]);
    }
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  fieldError(fieldName: string): string {
    const control = this.connectionForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
  }
}
