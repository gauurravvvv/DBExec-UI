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
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
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
  ALERT_WIZARD_STEPS,
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
 * Add Alert — a multi-step wizard (Source -> Condition -> Schedule -> Delivery ->
 * Review & gating) mirroring the Add Organisation stepper idiom (custom
 * `currentStep` index + per-step validity gates on Next). The SAME reactive
 * form, validators and submit payload as the old single page are reused
 * verbatim; only navigation is chunked by step. Field-level name/description
 * validation is sourced from the SHARED alerts Zod schema; the full cross-field
 * contract is re-checked by the BE zodValidate middleware on save.
 */
@Component({
  selector: 'app-add-alert',
  templateUrl: './add-alert.component.html',
  styleUrls: ['./add-alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddAlertComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild(AlertConditionBuilderComponent)
  conditionBuilder?: AlertConditionBuilderComponent;

  saving = this.alertService.saving;
  testing = this.alertService.testing;

  alertForm!: FormGroup;

  /* wizard state - custom step index, mirroring add-organisation. */
  readonly steps = ALERT_WIZARD_STEPS;
  readonly lastStep = ALERT_WIZARD_STEPS.length - 1;
  currentStep = 0;

  /* option lists - labels pre-translated in ngOnInit (dropdown renders the
   *  optionLabel verbatim, so keys must be resolved up front). */
  sourceTypeOptions = SOURCE_TYPE_OPTIONS.map(o => ({ ...o }));
  severityOptions = SEVERITY_OPTIONS.map(o => ({ ...o }));
  timezoneOptions = TIMEZONE_OPTIONS;
  cronPresets = CRON_PRESETS;

  /* datasource + source dropdowns */
  selectedDatasource = '';
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  preloadedSources: any[] | null = null;
  preloadedSourcesTotal: number | null = null;

  /* condition builder inputs */
  fields: ReturnType<typeof buildSourceFieldOptions> = [];
  distinctFetcher:
    ((ref: string) => Promise<{ label: string; value: string }[]>) | null =
    null;
  conditionState: {
    valid: boolean;
    mode: 'builder' | 'expression';
    conditionBuilder: any;
    conditionExpression: string | null;
  } = {
    valid: false,
    mode: 'builder',
    conditionBuilder: null,
    conditionExpression: null,
  };

  /* recipients - user multiselect */
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;

  /* test-now result */
  testResult: {
    breached?: boolean;
    observedValue?: any;
    error?: string;
  } | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private http: HttpClientService,
    private datasourceService: DatasourceService,
    private datasetService: DatasetService,
    private userService: UserService,
    private alertService: AlertService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.alertForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    // Resolve translation keys to labels for the static dropdowns.
    this.sourceTypeOptions = SOURCE_TYPE_OPTIONS.map(o => ({
      ...o,
      label: this.translate.instant(o.label),
    }));
    this.severityOptions = SEVERITY_OPTIONS.map(o => ({
      ...o,
      label: this.translate.instant(o.label),
    }));
    this.loadDatasources();
  }

  private initForm(): void {
    this.alertForm = this.fb.group({
      name: ['', [zodValidator(alertNameSchema)]],
      description: ['', [zodValidator(alertDescriptionSchema)]],
      sourceType: ['dataset', Validators.required],
      sourceId: ['', Validators.required],
      datasourceId: ['', Validators.required],
      // schedule
      cronExpression: ['*/15 * * * *', Validators.required],
      timezone: ['UTC', Validators.required],
      // delivery
      severity: ['warning', Validators.required],
      recipientUserIds: [[]],
      recipientEmails: [[]],
      notifyInApp: [true],
      notifyEmail: [true],
      // state machine
      cooldownMinutes: [60, [Validators.min(0), Validators.max(10080)]],
      consecutiveBreachesRequired: [
        1,
        [Validators.min(1), Validators.max(100)],
      ],
      enabled: [true],
    });

    // A source-type change clears the picked source + its fields.
    this.alertForm
      .get('sourceType')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.alertForm.patchValue({ sourceId: '' }, { emitEvent: false });
        this.preloadedSources = null;
        this.preloadedSourcesTotal = null;
        this.fields = [];
        this.distinctFetcher = null;
        this.testResult = null;
      });
  }

  /* -- wizard navigation ------------------------------------------- */

  /**
   * Per-step validity gate. Only the controls owned by `step` are checked so
   * Next unlocks progressively. The underlying reactive form + validators are
   * unchanged - this just decides when navigation is allowed.
   */
  isStepValid(step: number): boolean {
    switch (step) {
      case 0:
        return (
          !!this.alertForm.get('name')?.valid &&
          !!this.alertForm.get('sourceType')?.valid &&
          !!this.selectedDatasource &&
          !!this.alertForm.get('sourceId')?.valid
        );
      case 1:
        return this.conditionState.valid;
      case 2:
        return (
          !!this.alertForm.get('cronExpression')?.valid &&
          !!this.alertForm.get('timezone')?.valid
        );
      case 3:
        return !!this.alertForm.get('severity')?.valid;
      case 4:
        return this.canSave;
      default:
        return false;
    }
  }

  nextStep(): void {
    if (
      this.currentStep < this.lastStep &&
      this.isStepValid(this.currentStep)
    ) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) this.currentStep--;
  }

  /**
   * Allow jumping backward freely; jumping forward only when every step up to
   * the target is valid (same guard the sequential Next enforces).
   */
  onStepClick(step: number): void {
    if (step <= this.currentStep) {
      this.currentStep = step;
      return;
    }
    for (let i = this.currentStep; i < step; i++) {
      if (!this.isStepValid(i)) return;
    }
    this.currentStep = step;
  }

  /* -- datasource picker ------------------------------------------- */

  loadDatasourcesPage = async ({ search, page, limit }: any) => {
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

  private loadDatasources(): void {
    this.datasourceService
      .listDatasource({ page: DEFAULT_PAGE, limit: 10 })
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
    this.alertForm.patchValue(
      { sourceId: '', datasourceId: datasourceId || '' },
      { emitEvent: false },
    );
    this.preloadedSources = null;
    this.preloadedSourcesTotal = null;
    this.fields = [];
    this.distinctFetcher = null;
    this.testResult = null;
    this.cdr.markForCheck();
  }

  /* -- source picker (dataset | analysis, datasource-scoped) ------- */

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

  /* -- condition builder bridge ------------------------------------ */

  onConditionChange(state: typeof this.conditionState): void {
    this.conditionState = state;
    this.alertForm.markAsDirty();
  }

  /* -- cron presets ------------------------------------------------ */

  applyCronPreset(expr: string): void {
    this.alertForm.patchValue({ cronExpression: expr });
    this.alertForm.markAsDirty();
  }

  /* -- recipients -------------------------------------------------- */

  loadUsersPage = loadRecipientUsersPage(
    () => ({ globalService: this.globalService }),
    (params: any) => this.userService.listUser(params),
  );

  /* -- review-summary helpers -------------------------------------- */

  get sourceTypeLabel(): string {
    const v = this.alertForm.get('sourceType')?.value;
    return this.sourceTypeOptions.find(o => o.value === v)?.label ?? v ?? '';
  }

  get severityLabel(): string {
    const v = this.alertForm.get('severity')?.value;
    return this.severityOptions.find(o => o.value === v)?.label ?? v ?? '';
  }

  get recipientEmailsCount(): number {
    return (this.alertForm.get('recipientEmails')?.value ?? []).length;
  }

  get recipientUsersCount(): number {
    return (this.alertForm.get('recipientUserIds')?.value ?? []).length;
  }

  /* -- build payload ----------------------------------------------- */

  private compose(): any | null {
    if (!this.conditionBuilder) return null;
    const cond = this.conditionBuilder.getPayload();
    return buildAlertPayload(this.alertForm.value, cond);
  }

  get canSave(): boolean {
    return (
      this.alertForm.valid &&
      this.conditionState.valid &&
      !!this.selectedDatasource
    );
  }

  /* -- test now (preview, no persist) ------------------------------ */

  onTestNow(): void {
    const payload = this.compose();
    if (!payload) return;
    this.testResult = null;
    this.alertService
      .test(null, payload)
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
        this.testResult = {
          error: this.translate.instant('ALERTS.TEST_FAILED'),
        };
        this.cdr.markForCheck();
      });
  }

  /* -- submit ------------------------------------------------------ */

  onSubmit(): void {
    this.alertForm.markAllAsTouched();
    if (!this.canSave) return;
    const payload = this.compose();
    if (!payload) return;

    this.alertService
      .add(payload)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.alertForm.markAsPristine();
          this.router.navigate([ALERT.LIST]);
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  goBack(): void {
    this.router.navigate([ALERT.LIST]);
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
