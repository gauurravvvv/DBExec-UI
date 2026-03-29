import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-edit-org-admin',
  templateUrl: './edit-org-admin.component.html',
  styleUrls: ['./edit-org-admin.component.scss'],
})
export class EditOrgAdminComponent implements OnInit, HasUnsavedChanges {
  adminForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  adminId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrgName: string = '';
  selectedOrgId: string = '';
  adminData: any;
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private orgAdminService: OrganisationAdminService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.adminId = this.route.snapshot.params['id'];
    this.selectedOrgId = this.route.snapshot.params['orgId'];
    this.loadAdminData();
  }

  get isFormDirty(): boolean {
    return this.adminForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm() {
    this.adminForm = this.fb.group({
      id: [''],
      firstName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(30),
          Validators.pattern(REGEX.firstName),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(30),
          Validators.pattern(REGEX.lastName),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(30),
          Validators.pattern(REGEX.username),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      organisation: ['', Validators.required],
      status: [],
    });
  }

  loadAdminData() {
    this.orgAdminService
      .viewOrganisationAdmin(this.selectedOrgId, this.adminId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.adminData = response.data;
          this.isLocked = !!this.adminData.isLocked;
          if (this.isLocked) {
            this.adminForm.get('status')?.disable();
          }
          this.adminForm.patchValue({
            id: this.adminData.id,
            firstName: this.adminData.firstName,
            lastName: this.adminData.lastName,
            username: this.adminData.username,
            email: this.adminData.email,
            organisation: this.adminData.organisationId,
            status: this.adminData.status,
          });
          this.selectedOrgName = this.adminData.organisationName;
        }
      });
  }

  onSubmit() {
    if (this.adminForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave() {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave() {
    if (this.saveJustification.trim()) {
      this.orgAdminService.updateOrgAdmin(this.adminForm, this.saveJustification.trim()).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.adminForm.markAsPristine();
          this.router.navigate([ORGANISATION_ADMIN.LIST]);
        }
      });
    }
  }

  onCancel() {
    this.adminForm.patchValue({
      id: this.adminData.id,
      firstName: this.adminData.firstName,
      lastName: this.adminData.lastName,
      username: this.adminData.username,
      email: this.adminData.email,
      organisation: this.adminData.organisationId,
      status: this.adminData.status,
    });
    this.selectedOrgName = this.adminData.organisationName;
    this.isCancelClicked = true;
    this.adminForm.markAsPristine();
  }

  getFirstNameError(): string {
    const control = this.adminForm.get('firstName');
    if (control?.errors?.['required']) return 'First name is required';
    if (control?.errors?.['minlength'])
      return `First name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `First name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'First name must start with a letter and can only contain letters, hyphens, apostrophes and spaces';
    return '';
  }

  getLastNameError(): string {
    const control = this.adminForm.get('lastName');
    if (control?.errors?.['required']) return 'Last name is required';
    if (control?.errors?.['minlength'])
      return `Last name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Last name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Last name must start with a letter and can only contain letters, hyphens, apostrophes and spaces';
    return '';
  }
}
