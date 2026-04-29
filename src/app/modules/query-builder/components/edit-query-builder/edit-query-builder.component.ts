import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { QUERY_BUILDER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TranslateService } from '@ngx-translate/core';
import { QueryBuilderService } from '../../services/query-builder.service';

@Component({
  selector: 'app-edit-query-builder',
  templateUrl: './edit-query-builder.component.html',
  styleUrls: ['./edit-query-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditQueryBuilderComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  saving = inject(QueryBuilderService).saving;

  queryBuilderForm!: FormGroup;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;
  orgId: string = '';
  queryBuilderId: string = '';
  queryBuilderData: any;
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';
  selectedOrgName: string = '';
  selectedDatasourceName: string = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private queryBuilderService: QueryBuilderService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.queryBuilderForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    this.queryBuilderId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.queryBuilderId) {
      this.loadQueryBuilderDetails();
    }

    this.queryBuilderForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  initForm() {
    this.queryBuilderForm = this.fb.group({
      id: [''],
      organisation: [''],
      datasource: [''],
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
      status: [false],
    });

    if (!this.showOrganisationDropdown) {
      this.queryBuilderForm.get('datasource')?.enable();
    }
  }

  loadQueryBuilderDetails(): void {
    this.queryBuilderService
      .viewQueryBuilder(this.orgId, this.queryBuilderId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilderData = response.data;
          this.queryBuilderForm.patchValue({
            id: this.queryBuilderData.id,
            name: this.queryBuilderData.name,
            description: this.queryBuilderData.description,
            organisation: this.queryBuilderData.organisationId,
            datasource: this.queryBuilderData.datasourceId,
            status: this.queryBuilderData.status,
          });

          this.selectedOrgName = this.queryBuilderData.organisationName || '';
          this.selectedDatasourceName =
            this.queryBuilderData.datasource?.name || '';

          this.queryBuilderForm.markAsPristine();
        }
      })
      .catch(() => {});
  }

  getNameError(): string {
    const control = this.queryBuilderForm.get('name');
    if (control?.errors?.['required']) return this.translate.instant('QUERY_BUILDER_MODULE.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_PATTERN');
    return '';
  }

  onSubmit() {
    if (this.queryBuilderForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.queryBuilderService
        .update(this.queryBuilderForm, this.saveJustification.trim())
        .then(res => {
          if (this.globalService.handleSuccessService(res, true, true)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.queryBuilderForm.markAsPristine();
            this.router.navigate([QUERY_BUILDER.LIST]);
          }
        })
        .catch(() => {
          this.showSaveConfirm = false;
          this.saveJustification = '';
        });
    }
  }

  onCancel() {
    if (this.isFormDirty) {
      // Restore basic form values
      this.queryBuilderForm.patchValue({
        id: this.queryBuilderData.id,
        name: this.queryBuilderData.name,
        description: this.queryBuilderData.description,
        organisation: this.queryBuilderData.organisation,
        datasource: this.queryBuilderData.datasource,
        status: this.queryBuilderData.status,
      });

      this.selectedOrgName = this.queryBuilderData.organisationName;
      this.isCancelClicked = true;
      this.queryBuilderForm.markAsPristine();
    } else {
      this.router.navigate([QUERY_BUILDER.LIST]);
    }
  }
}
