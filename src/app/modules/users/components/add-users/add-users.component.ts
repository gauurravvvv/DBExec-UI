import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from '../../services/user.service';
import { REGEX } from 'src/app/constants/regex.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-users',
  templateUrl: './add-users.component.html',
  styleUrls: ['./add-users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddUsersComponent implements OnInit, HasUnsavedChanges {
  userForm!: FormGroup;
  organisations: any[] = [];
  groups: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private userService: UserService,
    private organisationService: OrganisationService,
    private groupService: GroupService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadGroups(this.globalService.getTokenDetails('organisationId'));
    }
  }

  initForm() {
    this.userForm = this.fb.group({
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      groupIds: [[], Validators.required],
    });
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
      }
    });
  }

  loadGroups(orgId: string) {
    if (!orgId) return;
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

  onOrganisationChange(orgId: string) {
    this.groups = [];
    this.userForm.patchValue({ groupIds: [] });
    if (orgId) {
      this.loadGroups(orgId);
    }
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.userService.addUser(this.userForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.userForm.markAsPristine();
          this.router.navigate([USER.LIST]);
        }
      });
    } else {
      Object.keys(this.userForm.controls).forEach(key => {
        const control = this.userForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel() {
    this.userForm.reset();
    Object.keys(this.userForm.controls).forEach(key => {
      this.userForm.get(key)?.setValue('');
    });
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

  getUsernameError(): string {
    const control = this.userForm.get('username');
    if (control?.errors?.['required']) return 'Username is required';
    if (control?.errors?.['minlength'])
      return `Username must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Username must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Username must start with a letter and can only contain letters, numbers, dots, hyphens and underscores';
    return '';
  }
}
