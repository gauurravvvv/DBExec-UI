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
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  roleIdsSchema,
} from 'src/app/shared/validators/groups';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-edit-group',
  templateUrl: './edit-group.component.html',
  styleUrls: ['./edit-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditGroupComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.groupService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  groupForm!: FormGroup;
  users: any[] = [];
  preloadedUsers: any[] | null = null;
  preloadedUsersTotal: number | null = null;
  isFormDirty = false;
  showSaveConfirm = false;
  saveJustification = '';

  categoryId!: string;
  originalFormValue: any;
  // Server-mode preload for the Roles multiselect (Group ↔ Role m:m).
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;

  // The seeded default Administrators group is fully locked — the BE
  // rejects any update. When true the form renders read-only and Save
  // is disabled (matches the same guard on the role edit screen).
  isLocked = false;

  // Member locked out of the multiselect: the logged-in user
  // themselves. Self-protection is the sole guard now — an admin
  // can't evict themselves from a group mid-edit and lose the
  // access they need to finish the change. The seeded groups carry
  // no special protection.
  //
  // Stored as {id, username} objects so the template can render the
  // chip and the save flow can reassemble the full payload. Always
  // kept OUT of the form control's `users` array; reassembled on
  // save.
  lockedMembers: Array<{
    id: string;
    username: string;
  }> = [];

  saving = this.groupService.saving;
  // `loading` gates the form vs the skeleton; `groupLoaded` becomes
  // true once originalFormValue is populated so the template can
  // swap from skeleton to real form.
  loading = this.groupService.loading;
  groupLoaded = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private groupService: GroupService,
    private userService: UserService,
    private roleService: RoleService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.categoryId = this.route.snapshot.params['id'];

    if (this.categoryId) {
      this.loadGroupData();
    }
  }

  initForm(): void {
    // Field validators sourced from the SHARED Zod schema. Group ↔ Role
    // is many-to-many now — roleIds is an editable multi-select
    // validated by roleIdsSchema (at least one role).
    this.groupForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(groupNameSchema)]],
      description: ['', [zodValidator(groupDescriptionSchema)]],
      roleIds: [[], [zodValidator(roleIdsSchema)]],
      users: [[]],
      status: [1],
    });

    this.loadRoles();

    this.groupForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkFormDirty());
  }

  /** Server-mode fetcher for the Roles multiselect (active roles only). */
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
        const all = res?.data?.roles ?? [];
        const active = all.filter((r: any) => r.status === 1);
        return { items: active, total: res?.data?.count ?? active.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadRoles(): void {
    this.roleService
      .listRoles({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const all = response?.data?.roles ?? [];
          const active = all.filter((r: any) => r.status === 1);
          this.preloadedRoles = active;
          this.preloadedRolesTotal = response?.data?.count ?? active.length;
        }
        this.cdr.markForCheck();
      });
  }

  async loadGroupData(): Promise<void> {
    await this.groupService.loadOne(this.categoryId);
    const groupData = this.groupService.current();

    if (!groupData) return;

    // Partition the loaded members into locked vs manageable. The
    // only lock is the logged-in user themselves — locked in every
    // group they belong to so an admin can't eject themselves
    // mid-edit and lose access to permissions they need to finish
    // the change. There is no bootstrap-admin / default-group
    // special-casing.
    const loggedInUserId: string =
      this.globalService.getTokenDetails('userId') || '';

    const lockedIds = new Set<string>();
    this.lockedMembers = [];
    for (const mapping of groupData.userGroups || []) {
      const u = mapping.user;
      if (!u) continue;
      if (u.id === loggedInUserId) {
        lockedIds.add(u.id);
        this.lockedMembers.push({
          id: u.id,
          username: u.username,
        });
      }
    }

    // Picker only handles the manageable subset. The save flow
    // reassembles the full member set before sending.
    const manageableIds = (groupData.userGroups || [])
      .map((mapping: any) => mapping.userId)
      .filter((id: string) => !lockedIds.has(id));

    // Kick the initial picker page. The logged-in user is excluded
    // from the picker (they're shown via the locked chip instead).
    this.loadUsers({
      page: DEFAULT_PAGE,
      limit: 10,
      excludeSelf: true,
    });

    this.groupForm.patchValue({
      id: groupData.id,
      name: groupData.name,
      description: groupData.description,
      // Group ↔ Role m:m — the GET response returns roleIds: string[]
      // (and roles: {id,name}[]). Seed the multiselect from roleIds.
      roleIds: groupData.roleIds ?? [],
      users: manageableIds,
      status: groupData.status,
    });

    this.originalFormValue = this.groupForm.getRawValue();
    this.isFormDirty = false;
    this.groupForm.markAsPristine();

    // Lock the whole form for the seeded default Administrators group.
    this.isLocked = groupData.isDefault === 1 || groupData.canEdit === false;
    if (this.isLocked) {
      this.groupForm.disable({ emitEvent: false });
    }

    this.groupLoaded = true;
    this.cdr.markForCheck();
  }

  /**
   * Fetcher for server-mode users multiselect.
   *
   * Always excludes the logged-in user (paired with the locked-
   * self chip above the picker) so they can't remove themselves
   * from the group. Every other user is selectable — there is no
   * bootstrap-admin exclusion any more.
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

  /**
   * Single-user resolver for stored userIds that aren't in the dropdown's
   * first page. Called once per missing ID by app-custom-multiselect.
   */
  resolveSelectedUser = async (id: string): Promise<any> => {
    try {
      const res: any = await this.userService.viewOrgUser(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadUsers(params: any): void {
    this.userService.listUser(params).then(response => {
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

  canSubmit(): boolean {
    return !this.isLocked && this.groupForm.valid && this.isFormDirty;
  }

  onSubmit(): void {
    if (this.canSubmit()) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      // Reassemble the full member set: the locked self member PLUS
      // whatever the manageable picker currently holds. The BE
      // expects the complete membership list per save and treats
      // anyone missing from it as removed — without this merge, the
      // locked self member would silently disappear.
      const manageable: string[] = this.groupForm.get('users')?.value || [];
      const usersPayload = [
        ...this.lockedMembers.map(m => m.id),
        ...manageable.filter(id => !this.lockedMembers.some(m => m.id === id)),
      ];

      // Fire the request first (service.edit uses getRawValue, which
      // bypasses disable, but stay consistent with the rest of the
      // rollout for ordering) then lock the form.
      const request = this.groupService.edit(
        this.groupForm,
        this.saveJustification.trim(),
        usersPayload,
      );
      this.groupForm.disable({ emitEvent: false });
      try {
        const response = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.isFormDirty = false;
          this.groupForm.markAsPristine();
          this.router.navigate([GROUP.LIST]);
        }
      } finally {
        this.groupForm.enable({ emitEvent: false });
      }
    }
  }

  goBack(): void {
    this.router.navigate([GROUP.LIST]);
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.groupForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.groupForm.markAsPristine();
    } else {
      this.router.navigate([GROUP.LIST]);
    }
  }

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.groupForm.getRawValue();
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }

  fieldError(fieldName: string): string {
    const control = this.groupForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
  }
}
