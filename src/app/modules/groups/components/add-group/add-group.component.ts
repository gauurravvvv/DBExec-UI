import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { GROUP } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { GroupService } from '../../services/group.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';

const MIN_USERS = 0;

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrls: ['./add-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddGroupComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  userGroupForm!: FormGroup;
  organisations: any[] = [];
  roles: any[] = [];
  users: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

  saving = this.groupService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private groupService: GroupService,
    private userService: UserService,
    private roleService: RoleService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.userGroupForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadRoles();
      this.loadUsers();
    }
  }

  initForm() {
    this.userGroupForm = this.fb.group({
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      roleId: ['', Validators.required],
      users: [[]],
    });

    this.userGroupForm.get('organisation')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.userGroupForm.patchValue(
          { roleId: '', users: [] },
          { emitEvent: false },
        );
        this.roles = [];
        this.users = [];
        if (value) {
          this.loadRoles();
          this.loadUsers();
        }
      });
  }

  loadOrganisations() {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs || [];
      }
      this.cdr.markForCheck();
    });
  }

  loadRoles() {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return;

    this.roleService
      .listRoles(orgId, { page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.roles = (response.data.roles || []).filter(
            (r: any) => r.status === 1,
          );
        }
        this.cdr.markForCheck();
      });
  }

  loadUsers() {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = (response.data.users || []).filter(
          (u: any) => u.status === 1,
        );
      }
      this.cdr.markForCheck();
    });
  }

  async onSubmit() {
    if (this.canSubmit()) {
      const response = await this.groupService.add(this.userGroupForm);
      if (this.globalService.handleSuccessService(response)) {
        this.userGroupForm.markAsPristine();
        this.router.navigate([GROUP.LIST]);
      }
    }
  }

  onCancel() {
    this.router.navigate([GROUP.LIST]);
  }

  minUsersValidator(min: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      const users = control.value as any[];
      if (!users || users.length < min) {
        return { minUsers: { min, actual: users?.length || 0 } };
      }
      return null;
    };
  }

  canSubmit(): boolean {
    return this.userGroupForm.valid;
  }

  getNameError(): string {
    const control = this.userGroupForm.get('name');
    if (control?.errors?.['required']) return 'Group name is required';
    if (control?.errors?.['minlength'])
      return `Group name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Group name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Group name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  getUsersError(): string {
    const control = this.userGroupForm.get('users');
    if (control?.errors?.['required'] || control?.errors?.['minUsers']) {
      return `At least ${MIN_USERS} user is required`;
    }
    return '';
  }
}
