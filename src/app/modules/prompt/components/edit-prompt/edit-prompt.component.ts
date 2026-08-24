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
import { MessageService } from 'primeng/api';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { PROMPT } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { PROMPT_DATA_TYPE_OPTIONS } from '../../constants/prompt.constant';
import { PromptService } from '../../services/prompt.service';

@Component({
  selector: 'app-edit-prompt',
  templateUrl: './edit-prompt.component.html',
  styleUrls: ['./edit-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditPromptComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  promptForm!: FormGroup;
  promptId: string = '';
  selectedDatasourceName: string = '';
  selectedTypeLabel: string = '';
  dataTypeOptions: { value: string; label: string }[] = [];
  promptData: any = null;
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';
  saving = this.promptService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private promptService: PromptService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];
    this.dataTypeOptions = PROMPT_DATA_TYPE_OPTIONS.map(o => ({
      value: o.value,
      label: this.translate.instant(o.labelKey),
    }));

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
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
      dataType: [''],
      status: [false],
    });
  }

  loadPromptData(): void {
    this.promptService.resetCurrent();
    this.promptService
      .loadOne(this.promptId)
      .then(() => {
        const data = this.promptService.current();
        if (data) {
          this.promptData = data;

          this.promptForm.patchValue({
            id: data.id,
            name: data.name,
            description: data.description,
            datasource: data.datasourceId,
            dataType: data.dataType || '',
            status: data.status,
          });

          this.selectedDatasourceName = data.datasource?.name || '';
          this.selectedTypeLabel = data.type || '';
          this.promptForm.markAsPristine();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

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
    if (this.promptForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.promptService
        .update(this.promptForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.promptForm.markAsPristine();
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.cdr.markForCheck();
        });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      if (!this.promptData) return;
      this.promptForm.patchValue({
        id: this.promptData.id,
        name: this.promptData.name,
        description: this.promptData.description,
        datasource: this.promptData.datasourceId,
        dataType: this.promptData.dataType || '',
        status: this.promptData.status,
      });

      this.isCancelClicked = true;
      this.promptForm.markAsPristine();
    }
  }

  goBack(): void {
    this.router.navigate([PROMPT.LIST]);
  }
}
