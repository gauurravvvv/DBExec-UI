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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { CONNECTION } from 'src/app/core/constants/routes.constant';
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
export class EditConnectionComponent implements OnInit, HasUnsavedChanges {
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
    this.connectionForm = this.fb.group({
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
      description: [''],
      datasource: [''],
      status: [false],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
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
      const response = await this.connectionService.update(
        this.connectionForm,
        this.saveJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.connectionForm.markAsPristine();
        this.router.navigate([CONNECTION.LIST]);
      }
      this.cdr.markForCheck();
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

  getNameError(): string {
    const control = this.connectionForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_MIN_LENGTH', {
        length: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_MAX_LENGTH', {
        length: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_PATTERN');
    return '';
  }
}
