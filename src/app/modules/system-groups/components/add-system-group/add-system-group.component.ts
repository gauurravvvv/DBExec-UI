import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { SYSTEM_ROLE } from 'src/app/core/constants/api.constant';
import { SYSTEM_GROUP } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import {
  groupDescriptionSchema,
  groupNameSchema,
  roleIdsSchema,
} from 'src/app/shared/validators/groups';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { SystemGroupService } from '../../services/system-group.service';

@Component({
  selector: 'app-add-system-group',
  templateUrl: './add-system-group.component.html',
  styleUrls: ['./add-system-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSystemGroupComponent implements OnInit, HasUnsavedChanges {
  userGroupForm!: FormGroup;
  roles: any[] = [];
  users: any[] = [];
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;
  // Server-mode preload for the Roles multiselect.
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;

  saving = this.groupService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private groupService: SystemGroupService,
    private userService: UserService,
    private http: HttpClientService,
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
    // src/app/shared/validators/groups.ts (mirrored to BE). Group ↔ Role
    // is many-to-many — roleIds is an array validated by roleIdsSchema
    // (min 1).
    this.userGroupForm = this.fb.group({
      name: ['', [zodValidator(groupNameSchema)]],
      description: ['', [zodValidator(groupDescriptionSchema)]],
      roleIds: [[], [zodValidator(roleIdsSchema)]],
      users: [[]],
    });
  }

  /**
   * Server-mode fetcher for the Roles multiselect. Fetches SYSTEM roles
   * from the master-DB /system-roles endpoint (SYSTEM_ROLE.LIST) — there
   * is no SystemRoleService yet, so this calls HttpClientService directly,
   * mirroring the shape RoleService.listRoles uses (filter is JSON-encoded).
   */
  private listSystemRoles(params: {
    page?: number;
    limit?: number;
    filter?: any;
  }): Promise<any> {
    const queryParams: any = {};
    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return lastValueFrom(
      this.http.apiGet(SYSTEM_ROLE.LIST, {
        params: queryParams,
        skipLoader: true,
      }),
    );
  }

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
      const res: any = await this.listSystemRoles(params);
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
    this.listSystemRoles({ page: DEFAULT_PAGE, limit: 10 }).then(response => {
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
   * `excludeSelf=true` — self-protection: admins can't place
   *   themselves into a new group at create-time. Every other user
   *   (including the seeded bootstrap admin) is selectable.
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
          this.router.navigate([SYSTEM_GROUP.LIST]);
        }
      } finally {
        this.userGroupForm.enable({ emitEvent: false });
      }
    }
  }

  onCancel() {
    this.router.navigate([SYSTEM_GROUP.LIST]);
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
