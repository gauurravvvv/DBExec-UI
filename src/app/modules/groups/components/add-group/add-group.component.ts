import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { GROUP } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import {
  groupDescriptionSchema,
  groupNameSchema,
  roleIdSchema,
} from 'src/app/shared/validators/groups';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrls: ['./add-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddGroupComponent implements OnInit, HasUnsavedChanges {
  userGroupForm!: FormGroup;
  roles: any[] = [];
  users: any[] = [];
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;
  // Server-mode preload for the Role dropdown.
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;

  saving = this.groupService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
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
    this.loadRoles();
    this.loadUsers();
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/groups.ts (mirrored to BE).
    this.userGroupForm = this.fb.group({
      name: ['', [zodValidator(groupNameSchema)]],
      description: ['', [zodValidator(groupDescriptionSchema)]],
      roleId: ['', [zodValidator(roleIdSchema)]],
      users: [[]],
    });
  }

  /**
   * Server-mode fetcher for the Role dropdown.
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
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.roleService.listRoles(params);
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

  loadRoles() {
    this.roleService
      .listRoles({ page: DEFAULT_PAGE, limit: 10 })
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
   * Fetcher for server-mode users multiselect. Org-scoped via form
   * control. Filters to active users only — matches legacy
   * behavior.
   *
   * `excludeDefault=true` — the bootstrap admin (user.isDefault=1)
   *   is structurally locked to the Administrator group. Hiding
   *   them from this picker prevents the BE invariant rejection
   *   that would otherwise fire on save.
   * `excludeSelf=true` — admins can't accidentally place themselves
   *   into a new group at create-time; same reasoning applies to
   *   the edit flow.
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
    const params: any = {
      page,
      limit,
      excludeDefault: true,
      excludeSelf: true,
    };
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
    this.userService
      .listUser({
        page: DEFAULT_PAGE,
        limit: 10,
        excludeDefault: true,
        excludeSelf: true,
      })
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
      // Fire the request first (service reads userGroupForm.value)
      // then lock the form so the user can't edit fields while the
      // POST is in flight.
      const request = this.groupService.add(this.userGroupForm);
      this.userGroupForm.disable({ emitEvent: false });
      try {
        const response = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.userGroupForm.markAsPristine();
          this.router.navigate([GROUP.LIST]);
        }
      } finally {
        this.userGroupForm.enable({ emitEvent: false });
      }
    }
  }

  onCancel() {
    this.router.navigate([GROUP.LIST]);
  }

  canSubmit(): boolean {
    return this.userGroupForm.valid;
  }

  fieldError(fieldName: string): string {
    const control = this.userGroupForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
  }
}
