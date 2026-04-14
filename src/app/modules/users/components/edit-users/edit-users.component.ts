import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from '../../services/user.service';
import { REGEX } from 'src/app/constants/regex.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-edit-users',
  templateUrl: './edit-users.component.html',
  styleUrls: ['./edit-users.component.scss'],
})
export class EditUsersComponent implements OnInit, HasUnsavedChanges {
  userForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  groups: any[] = [];
  userId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrgName: string = '';
  userData: any;
  orgId: string = '';
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadGroups();
    this.loadAdminData();
  }

  loadGroups() {
    const orgId =
      this.orgId || this.globalService.getTokenDetails('organisationId');
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.groups = (response.data.groups || []).filter(
            (g: any) => g.status === 1,
          );
        }
      });
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm() {
    this.userForm = this.fb.group({
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
      groupIds: [[], Validators.required],
    });
  }

  loadAdminData() {
    this.userService.viewOrgUser(this.orgId, this.userId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.userData = response.data;
        this.isLocked = !!this.userData.isLocked;
        if (this.isLocked) {
          this.userForm.get('status')?.disable();
        }
        this.userForm.patchValue({
          id: this.userData.id,
          firstName: this.userData.firstName,
          lastName: this.userData.lastName,
          username: this.userData.username,
          email: this.userData.email,
          organisation: this.userData.organisationId,
          status: this.userData.status,
          groupIds: this.userData.groupIds || [],
        });
        this.selectedOrgName = this.userData.organisationName;
      }
    });
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave() {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave() {
    if (this.saveJustification.trim()) {
      this.userService
        .updateUser(this.userForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.userForm.markAsPristine();
            this.router.navigate([USER.LIST]);
          }
        });
    }
  }

  onCancel() {
    this.userForm.patchValue({
      id: this.userData.id,
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      username: this.userData.username,
      email: this.userData.email,
      organisation: this.userData.organisationId,
      status: this.userData.status,
      groupIds: this.userData.groupIds || [],
    });
    this.selectedOrgName = this.userData.organisationName;
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
  }

  getFirstNameError(): string {
    const control = this.userForm.get('firstName');
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
    const control = this.userForm.get('lastName');
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
