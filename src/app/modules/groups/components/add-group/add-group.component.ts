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
import { DEFAULT_PAGE } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';
import { GROUP } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { TranslateService } from '@ngx-translate/core';
import { GroupService } from '../../services/group.service';

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
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  roles: any[] = [];
  users: any[] = [];
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;
  // Server-mode preload for the Role dropdown. Refilled on org change.
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;

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
    private translate: TranslateService,
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
        this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      roleId: ['', Validators.required],
      users: [[]],
    });

    this.userGroupForm
      .get('organisation')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.userGroupForm.patchValue(
          { roleId: '', users: [] },
          { emitEvent: false },
        );
        this.roles = [];
        this.users = [];
        // Clear seeds so the dropdowns re-fetch for the new org rather than
        // serving stale options.
        this.preloadedRoles = null;
        this.preloadedRolesTotal = null;
        this.preloadedUsers = null;
        this.preloadedUsersTotal = null;
        if (value) {
          this.loadRoles();
          this.loadUsers();
        }
      });
  }

  /**
   * Server-mode fetcher for the Role dropdown. Reads the currently selected
   * org from the form so it stays in sync if the user changes it.
   */
  loadRolesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return { items: [], total: 0 };
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.roleService.listRoles(orgId, params);
      if (this.globalService.handleSuccessService(res, false)) {
        // Active roles only — matches the original loadRoles() filter.
        const all = res?.data?.roles ?? [];
        const active = all.filter((r: any) => r.status === 1);
        return { items: active, total: res?.data?.count ?? active.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Fetcher for the server-mode organisation dropdown.
   */
  loadOrgsPage = async ({
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
      const res: any =
        await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadOrganisations() {
    const params = { page: DEFAULT_PAGE, limit: 10 };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const orgs = response?.data?.orgs ?? [];
        this.organisations = orgs;
        this.preloadedOrgs = orgs;
        this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
      }
      this.cdr.markForCheck();
    });
  }

  loadRoles() {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return;

    this.roleService
      .listRoles(orgId, { page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const all = response?.data?.roles ?? [];
          const active = all.filter((r: any) => r.status === 1);
          this.roles = active;
          this.preloadedRoles = active;
          this.preloadedRolesTotal = response?.data?.count ?? active.length;
        }
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for server-mode users multiselect. Org-scoped via form control.
   * Filters to active users only — matches legacy behavior.
   */
  loadUsersPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return { items: [], total: 0 };
    const params: any = { orgId, page, limit };
    if (search) params.filter = JSON.stringify({ username: search });
    try {
      const res: any = await this.userService.listUser(params);
      if (this.globalService.handleSuccessService(res, false)) {
        const users = (res?.data?.users || []).filter(
          (u: any) => u.status === 1,
        );
        return { items: users, total: res?.data?.count ?? users.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadUsers() {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return;

    this.userService
      .listUser({ orgId, page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const all = response?.data?.users || [];
          const active = all.filter((u: any) => u.status === 1);
          this.users = active;
          this.preloadedUsers = active;
          this.preloadedUsersTotal = response?.data?.count ?? active.length;
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

  canSubmit(): boolean {
    return this.userGroupForm.valid;
  }

  getNameError(): string {
    const control = this.userGroupForm.get('name');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.GROUP_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.GROUP_NAME_MIN_LENGTH', { length: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.GROUP_NAME_MAX_LENGTH', { length: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.GROUP_NAME_PATTERN');
    return '';
  }
}
