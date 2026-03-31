import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { QUERY_BUILDER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { QueryBuilderService } from '../../services/query-builder.service';

@Component({
  selector: 'app-edit-query-builder',
  templateUrl: './edit-query-builder.component.html',
  styleUrls: ['./edit-query-builder.component.scss'],
})
export class EditQueryBuilderComponent implements OnInit, HasUnsavedChanges {
  queryBuilderForm!: FormGroup;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
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

    this.queryBuilderForm.valueChanges.subscribe(() => {
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
            this.queryBuilderData.datasourceName || '';

          this.queryBuilderForm.markAsPristine();
        }
      });
  }

  getNameError(): string {
    const control = this.queryBuilderForm.get('name');
    if (control?.errors?.['required']) return 'Query builder name is required';
    if (control?.errors?.['minlength'])
      return `Query builder name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Query builder name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Query builder name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
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
        .updateQueryBuilder(
          this.queryBuilderForm,
          this.saveJustification.trim(),
        )
        .then(res => {
          if (this.globalService.handleSuccessService(res, true, true)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.queryBuilderForm.markAsPristine();
            this.router.navigate([QUERY_BUILDER.LIST]);
          }
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
