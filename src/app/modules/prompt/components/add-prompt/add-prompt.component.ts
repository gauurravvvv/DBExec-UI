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
import { PROMPT } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  DEFAULT_DATATYPE_BY_TYPE,
  PROMPT_DATA_TYPE_OPTIONS,
  PROMPT_TYPE_OPTIONS,
  type PromptTypeOption,
} from '../../constants/prompt.constant';
import { PromptService } from '../../services/prompt.service';

/**
 * add-prompt — create a single prompt for a datasource.
 *
 * Query Builder v2: a prompt is datasource-scoped (no tab/section). This is a
 * plain reactive form — datasource, name, description, type and an optional
 * group — that posts one prompt via promptService.add.
 */
@Component({
  selector: 'app-add-prompt',
  templateUrl: './add-prompt.component.html',
  styleUrls: ['./add-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPromptComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  promptForm!: FormGroup;

  /** Widget types as a flat, ordered (choice→input→date) option list. Each
   *  label is prefixed with its group so the list still reads grouped without
   *  relying on PrimeNG group mode (which didn't render through the wrapper). */
  typeOptions: { value: string; label: string }[] = [];
  /** Suggested logical data types (dataType is free-form; these are hints). */
  dataTypeOptions: { value: string; label: string }[] = [];

  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  saving = this.promptService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private promptService: PromptService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Build a flat, ordered option list (choice → input → date), each label
    // prefixed with its translated group so the list reads grouped.
    const groups: PromptTypeOption['group'][] = ['choice', 'input', 'date'];
    this.typeOptions = groups.flatMap(g => {
      const groupLabel = this.translate.instant(
        `PROMPT_MODULE.TYPE_GROUP.${g.toUpperCase()}`,
      );
      return PROMPT_TYPE_OPTIONS.filter(
        (o: PromptTypeOption) => o.group === g,
      ).map(o => ({
        value: o.value,
        label: `${groupLabel} · ${this.translate.instant(o.labelKey)}`,
      }));
    });
    this.dataTypeOptions = PROMPT_DATA_TYPE_OPTIONS.map(o => ({
      value: o.value,
      label: this.translate.instant(o.labelKey),
    }));

    this.loadDatasources();

    this.promptForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
  }

  /** When the widget type changes, seed dataType from its default (only if the
   *  admin hasn't already set dataType, so we never clobber a manual choice). */
  onTypeChange(type: string): void {
    const dt = this.promptForm.get('dataType');
    if (dt && !dt.value) {
      dt.setValue(DEFAULT_DATATYPE_BY_TYPE[type] ?? 'text');
    }
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  private initForm(): void {
    this.promptForm = this.fb.group({
      datasource: ['', Validators.required],
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
      type: ['', Validators.required],
      // dataType is free-form (accept data in any form); defaulted from the
      // widget on type change, refined in config from the source column.
      dataType: [''],
    });
  }

  private loadDatasources(): void {
    this.datasourceService
      .listDatasource({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal = response?.data?.count ?? items.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /** Fetcher for the server-mode datasource dropdown. */
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

  getNameError(): string {
    const control = this.promptForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('PROMPT_MODULE.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('PROMPT_MODULE.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('PROMPT_MODULE.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('PROMPT_MODULE.NAME_PATTERN');
    return '';
  }

  onSubmit(): void {
    if (this.promptForm.invalid) {
      this.promptForm.markAllAsTouched();
      return;
    }
    this.promptService
      .add(this.promptForm.value)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.promptForm.markAsPristine();
          this.router.navigate([PROMPT.LIST]);
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  onCancel(): void {
    this.router.navigate([PROMPT.LIST]);
  }

  goBack(): void {
    this.router.navigate([PROMPT.LIST]);
  }
}
