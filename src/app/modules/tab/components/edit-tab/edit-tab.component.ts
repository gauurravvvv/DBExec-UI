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
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { TAB } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-edit-tab',
  templateUrl: './edit-tab.component.html',
  styleUrls: ['./edit-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTabComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.tabService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  saving = this.tabService.saving;

  tabForm!: FormGroup;
  tabId: string = '';
  selectedDatasourceName: string = '';
  tabData: any;
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private tabService: TabService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.tabId = this.route.snapshot.params['id'];

    if (this.tabId) {
      this.loadTabData();
    }

    this.tabForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.tabForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.tabForm = this.fb.group({
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
    });
  }

  async loadTabData(): Promise<void> {
    this.tabService.resetCurrent();
    await this.tabService.loadOne(this.tabId);
    const data = this.tabService.current();
    if (data) {
      this.tabData = data;

      this.tabForm.patchValue({
        id: this.tabData.id,
        name: this.tabData.name,
        description: this.tabData.description,
        datasource: this.tabData.datasourceId,
        status: this.tabData.status,
      });

      this.selectedDatasourceName = this.tabData.datasource?.name || '';

      this.tabForm.markAsPristine();
    }
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    if (this.tabForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      try {
        const { id, name, description, datasource, status } =
          this.tabForm.getRawValue();
        const response = await this.tabService.update({
          id,
          name,
          description,
          datasource,
          status: status ? 1 : 0,
          justification: this.saveJustification.trim(),
        });
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.tabForm.markAsPristine();
          this.router.navigate([TAB.LIST]);
        }
      } catch {
        // global interceptor shows toast; ensure view re-checks
        this.cdr.markForCheck();
      } finally {
        this.cdr.markForCheck();
      }
    }
  }

  getNameError(): string {
    const control = this.tabForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('TAB.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('TAB.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('TAB.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('TAB.NAME_PATTERN');
    return '';
  }

  onCancel(): void {
    if (this.isFormDirty) {
      if (!this.tabData) return; // guard: data not loaded yet
      // Restore basic form values
      this.tabForm.patchValue({
        id: this.tabData.id,
        name: this.tabData.name,
        description: this.tabData.description,
        datasource: this.tabData.datasourceId,
        status: this.tabData.status,
      });

      this.isCancelClicked = true;
      this.tabForm.markAsPristine();
    } else {
      this.router.navigate([TAB.LIST]);
    }
  }
}
