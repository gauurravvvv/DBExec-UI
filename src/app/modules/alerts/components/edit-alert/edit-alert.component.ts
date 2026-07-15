import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ALERT } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import {
  alertDescriptionSchema,
  alertNameSchema,
} from 'src/app/shared/validators/alerts';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { AlertConditionBuilderComponent } from '../alert-condition-builder/alert-condition-builder.component';
import {
  buildAlertPayload,
  buildSourceFieldOptions,
  CRON_PRESETS,
  loadRecipientUsersPage,
  loadSourceFields,
  SEVERITY_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '../shared/alert-form.helpers';
import { AlertService } from '../../services/alert.service';

/**
 * Edit Alert — hydrates the same source-picker → condition-builder → schedule →
 * delivery → gating form from a saved rule, and on save opens a justification
 * confirm (audit-logged CUD, mirroring edit-rls-rule). Shares the alert-form
 * helpers + the AlertConditionBuilder child with the add screen.
 */
@Component({
  selector: 'app-edit-alert',
  templateUrl: './edit-alert.component.html',
  styleUrls: ['./edit-alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditAlertComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild(AlertConditionBuilderComponent)
  conditionBuilder?: AlertConditionBuilderComponent;

  saving = this.alertService.saving;
  testing = this.alertService.testing;
  loading = this.alertService.loading;

  alertForm!: FormGroup;
  alertId!: string;
  isFormDirty = false;
  originalFormValue: any;

  showSaveConfirm = false;
  saveJustification = '';

  /* option lists */
  sourceTypeOptions = SOURCE_TYPE_OPTIONS.map(o => ({ ...o }));
  severityOptions = SEVERITY_OPTIONS.map(o => ({ ...o }));
  timezoneOptions = TIMEZONE_OPTIONS;
  cronPresets = CRON_PRESETS;
  emailSeparator = /,|;| /;

  /* datasource + source dropdowns */
  selectedDatasource = '';
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  preloadedSources: any[] | null = null;
  preloadedSourcesTotal: number | null = null;

  /* condition builder inputs */
  fields: ReturnType<typeof buildSourceFieldOptions> = [];
  distinctFetcher: ((ref: string) => Promise<{ label: string; value: string }[]>) | null = null;
  conditionState: {
    valid: boolean;
    mode: 'builder' | 'expression';
    conditionBuilder: any;
    conditionExpression: string | null;
  } = { valid: true, mode: 'builder', conditionBuilder: null, conditionExpression: null };

  /* recipients */
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;

  /* test-now result */
  testResult: { breached?: boolean; observedValue?: any; error?: string } | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private http: HttpClientService,
    private datasourceService: DatasourceService,
    private datasetService: DatasetService,
    private userService: UserService,
    private alertService: AlertService,
    private translate: TranslateService,
  ) {}

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.sourceTypeOptions = SOURCE_TYPE_OPTIONS.map(o => ({
      ...o,
      label: this.translate.instant(o.label),
    }));
    this.severityOptions = SEVERITY_OPTIONS.map(o => ({
      ...o,
      label: this.translate.instant(o.label),
    }));
    this.initForm();
    this.alertId = this.route.snapshot.params['id'];
    if (this.alertId) {
      this.alertService.resetCurrent();
      this.loadAlert();
    }
  }

  private initForm(): void {
    this.alertForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(alertNameSchema)]],
      description: ['', [zodValidator(alertDescriptionSchema)]],
      sourceType: ['dataset', Validators.required],
      sourceId: ['', Validators.required],
      datasourceId: ['', Validators.required],
      cronExpression: ['*/15 * * * *', Validators.required],
      timezone: ['UTC', Validators.required],
      severity: ['warning', Validators.required],
      recipientUserIds: [[]],
      recipientEmails: [[]],
      notifyInApp: [true],
      notifyEmail: [true],
      cooldownMinutes: [60, [Validators.min(0), Validators.max(10080)]],
      consecutiveBreachesRequired: [1, [Validators.min(1), Validators.max(100)]],
      enabled: [true],
      filterState: [null],
      // organization (Track F): free-form tags
      tags: [[]],
    });

    this.alertForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkDirty());
  }

  /* ── load + hydrate ─────────────────────────────────────────────── */

  private loadAlert(): void {
    this.loadDatasources();
    this.alertService
      .loadOne(this.alertId)
      .then(() => {
        const rule = this.alertService.current();
        if (!rule) return;
        this.selectedDatasource = rule.datasourceId ?? '';

        this.alertForm.patchValue(
          {
            id: rule.id,
            name: rule.name,
            description: rule.description ?? '',
            sourceType: rule.sourceType,
            sourceId: rule.sourceId,
            datasourceId: rule.datasourceId,
            cronExpression: rule.cronExpression,
            timezone: rule.timezone ?? 'UTC',
            severity: rule.severity ?? 'warning',
            recipientUserIds: rule.recipients?.userIds ?? [],
            recipientEmails: rule.recipients?.emails ?? [],
            notifyInApp: rule.notifyInApp ?? true,
            notifyEmail: rule.notifyEmail ?? true,
            cooldownMinutes: rule.cooldownMinutes ?? 60,
            consecutiveBreachesRequired: rule.consecutiveBreachesRequired ?? 1,
            enabled: rule.enabled ?? true,
            filterState: rule.filterState ?? null,
            tags: rule.tags ?? [],
          },
          { emitEvent: false },
        );

        // Load the source fields, then hydrate the condition builder.
        this.hydrateSourceThenCondition(rule);

        this.originalFormValue = this.alertForm.value;
        this.isFormDirty = false;
        this.alertForm.markAsPristine();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  private hydrateSourceThenCondition(rule: any): void {
    if (!rule.sourceId || !rule.sourceType) {
      this.patchBuilder(rule);
      return;
    }
    loadSourceFields
      .fields(rule.sourceType, rule.sourceId, {
        datasetService: this.datasetService,
        globalService: this.globalService,
        http: this.http,
      })
      .then(({ fields, datasetId }) => {
        this.fields = buildSourceFieldOptions(fields);
        this.distinctFetcher = loadSourceFields.distinctFetcher(datasetId, {
          datasetService: this.datasetService,
        });
        this.patchBuilder(rule);
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.patchBuilder(rule);
        this.cdr.markForCheck();
      });
  }

  private patchBuilder(rule: any): void {
    // The child may not be created until the next tick; defer the patch.
    setTimeout(() => {
      this.conditionBuilder?.patch({
        conditionMode: rule.conditionMode,
        conditionBuilder: rule.conditionBuilder,
        conditionExpression: rule.conditionExpression,
      });
      this.cdr.markForCheck();
    });
  }

  /* ── datasource + source pickers ────────────────────────────────── */

  loadDatasourcesPage = async ({ search, page, limit }: any) => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.datasources ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  private loadDatasources(): void {
    this.datasourceService
      .listDatasource({ page: 1, limit: 10 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const items = res?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal = res?.data?.count ?? items.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  onDatasourceChange(datasourceId: string): void {
    this.selectedDatasource = datasourceId;
    this.alertForm.patchValue({ sourceId: '', datasourceId: datasourceId || '' });
    this.preloadedSources = null;
    this.preloadedSourcesTotal = null;
    this.fields = [];
    this.distinctFetcher = null;
    this.testResult = null;
    this.cdr.markForCheck();
  }

  loadSourcesPage = async ({ search, page, limit }: any) => {
    if (!this.selectedDatasource) return { items: [], total: 0 };
    return loadSourceFields.listSources(
      this.alertForm.get('sourceType')?.value,
      this.selectedDatasource,
      { search, page, limit },
      {
        datasetService: this.datasetService,
        globalService: this.globalService,
        http: this.http,
      },
    );
  };

  onSourceTypeChange(): void {
    this.alertForm.patchValue({ sourceId: '' });
    this.preloadedSources = null;
    this.preloadedSourcesTotal = null;
    this.fields = [];
    this.distinctFetcher = null;
    this.testResult = null;
  }

  onSourceChange(sourceId: string): void {
    this.testResult = null;
    if (!sourceId) {
      this.fields = [];
      this.distinctFetcher = null;
      return;
    }
    const sourceType = this.alertForm.get('sourceType')?.value;
    loadSourceFields
      .fields(sourceType, sourceId, {
        datasetService: this.datasetService,
        globalService: this.globalService,
        http: this.http,
      })
      .then(({ fields, datasetId }) => {
        this.fields = buildSourceFieldOptions(fields);
        this.distinctFetcher = loadSourceFields.distinctFetcher(datasetId, {
          datasetService: this.datasetService,
        });
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /* ── condition builder bridge ───────────────────────────────────── */

  onConditionChange(state: typeof this.conditionState): void {
    this.conditionState = state;
    this.checkDirty();
  }

  applyCronPreset(expr: string): void {
    this.alertForm.patchValue({ cronExpression: expr });
  }

  loadUsersPage = loadRecipientUsersPage(
    () => ({ globalService: this.globalService }),
    (params: any) => this.userService.listUser(params),
  );

  private checkDirty(): void {
    if (!this.originalFormValue) return;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(this.alertForm.value);
  }

  private compose(): any | null {
    if (!this.conditionBuilder) return null;
    const cond = this.conditionBuilder.getPayload();
    return buildAlertPayload(this.alertForm.value, cond);
  }

  get canSave(): boolean {
    return this.alertForm.valid && this.conditionState.valid && !!this.selectedDatasource;
  }

  /* ── test now ───────────────────────────────────────────────────── */

  onTestNow(): void {
    const payload = this.compose();
    if (!payload) return;
    this.testResult = null;
    this.alertService
      .test(this.alertId, payload)
      .then((res: any) => {
        if (res?.status) {
          this.testResult = {
            breached: res.data?.breached,
            observedValue: res.data?.observedValue,
          };
        } else {
          this.testResult = { error: res?.message };
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.testResult = { error: this.translate.instant('ALERTS.TEST_FAILED') };
        this.cdr.markForCheck();
      });
  }

  /* ── save (with justification confirm) ──────────────────────────── */

  onSubmit(): void {
    this.alertForm.markAllAsTouched();
    if (this.canSave && this.isFormDirty) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    const reason = this.saveJustification.trim();
    if (!reason) return;
    const payload = this.compose();
    if (!payload) return;
    payload.justification = reason;

    this.alertService
      .update(payload)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.isFormDirty = false;
          this.alertForm.markAsPristine();
          this.router.navigate([ALERT.LIST]);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.cdr.markForCheck();
      });
  }

  onCancel(): void {
    this.router.navigate([ALERT.LIST]);
  }

  trackByIndex(index: number): number {
    return index;
  }

  getNameError(): string {
    return this.alertForm.get('name')?.errors?.['zod'] ?? '';
  }
}
