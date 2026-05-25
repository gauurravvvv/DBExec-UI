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
import { CONNECTION } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-add-connection',
  templateUrl: './add-connection.component.html',
  styleUrls: ['./add-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddConnectionComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  connectionForm!: FormGroup;
  showPassword = false;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  isFormDirty: boolean = false;

  saving = this.connectionService.saving;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  selectedOrg: any = null;
  selectedDatasource: any = null;

  /**
   * dbType of the currently-selected datasource. Set after the
   * datasource dropdown changes — we fetch the full datasource
   * record once via viewDatasource and read its config.dbType.
   * Drives the credentials-for badge and per-dialect placeholder
   * copy. Null when no datasource is selected yet.
   */
  selectedDbType: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private connectionService: ConnectionService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.selectedOrg = {
      id: this.globalService.getTokenDetails('organisationId'),
    };
    this.loadDatasources();
  }

  private initForm() {
    this.connectionForm = this.fb.group({
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
      datasource: ['', Validators.required],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
    });

    this.connectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateFormDirtyState();
      });
  }

  private loadDatasources() {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const items = response?.data?.datasources ?? [];
        this.preloadedDatasources = items;
        this.preloadedDatasourcesTotal = response?.data?.count ?? items.length;
        this.datasources = [...items];
      }
      this.cdr.markForCheck();
    });
  }

  /**
   * Fetcher for the server-mode datasource dropdown. Pulls orgId from the
   * form control so it stays in sync after org changes.
   */
  loadDatasourcesPage = async ({
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
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Fired when the user picks (or clears) a datasource in the
   * dropdown. We need the parent datasource's `dbType` so the form
   * can render the credentials-for badge and adjust placeholder
   * copy per engine. One `viewDatasource` call is enough; the
   * dropdown already carries the id we need.
   *
   * Failure here is non-fatal — the form just falls back to the
   * generic placeholder copy and skips the badge. Users can still
   * submit; the BE's testDatasourceConnection helper does the real
   * engine-aware validation on save.
   */
  onDatasourceChange(): void {
    const datasourceId = this.connectionForm.get('datasource')?.value;
    if (!datasourceId) {
      this.selectedDbType = null;
      return;
    }
    this.datasourceService
      .viewDatasource(String(datasourceId))
      .then((res: any) => {
        if (!this.globalService.handleSuccessService(res, false)) return;
        this.selectedDbType = res?.data?.config?.dbType ?? null;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.selectedDbType = null;
        this.cdr.markForCheck();
      });
  }

  /**
   * Pretty-print map for the badge — turns the stored dbType
   * (lowercase canonical) into a user-facing engine label. Falls
   * back to title-casing for unknowns so legacy / future dbType
   * values render at least sensibly.
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
      AddConnectionComponent.DB_TYPE_LABELS[t] ||
      t.charAt(0).toUpperCase() + t.slice(1)
    );
  }

  /**
   * i18n key for the dbUsername placeholder. Postgres (default)
   * keeps the existing generic copy; other engines get a small
   * nudge so users coming from those tools recognise the field.
   */
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

  /**
   * Password placeholder — Snowflake is the only engine where the
   * "Password or PAT" hint is genuinely useful (programmatic access
   * tokens are common). Everything else stays on the generic copy.
   */
  get passwordPlaceholderKey(): string {
    return this.selectedDbType === 'snowflake'
      ? 'CONNECTION.PH_SNOWFLAKE_PASSWORD'
      : 'CONNECTION.ENTER_PASSWORD';
  }

  async onSubmit() {
    if (this.connectionForm.valid) {
      const response = await this.connectionService.add(this.connectionForm);
      if (this.globalService.handleSuccessService(response)) {
        this.isFormDirty = false;
        this.router.navigate([CONNECTION.LIST]);
      }
    }
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onCancel() {
    if (this.isFormDirty) {
      this.connectionForm.reset();
      this.isFormDirty = false;
    }
  }

  private updateFormDirtyState() {
    this.isFormDirty =
      this.connectionForm.dirty ||
      this.connectionForm.get('datasource')?.value !== '';
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
