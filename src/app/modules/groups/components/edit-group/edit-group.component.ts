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
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { GROUP } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import {
  groupDescriptionSchema,
  groupNameSchema,
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
  selectedRoleName = '';
  originalFormValue: any;
  isDefaultGroup = false;

  // Members locked out of the multiselect:
  //  - the bootstrap admin (user.isDefault === 1) when this is the
  //    default Administrator group (BE invariant requires them to
  //    stay in that group)
  //  - the logged-in user themselves (prevent self-eviction from
  //    Administrator and other accidental scope changes)
  //
  // Stored as full {id, username, isPrimaryAdmin, isSelf} objects
  // so the template can render the right tooltip and the save flow
  // can reassemble the full payload. Always kept OUT of the form
  // control's `users` array; reassembled on save.
  lockedMembers: Array<{
    id: string;
    username: string;
    isPrimaryAdmin: boolean;
    isSelf: boolean;
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
    // Field validators sourced from the SHARED Zod schema. roleId
    // stays Validators.required only — it's a disabled select with
    // a pre-populated value from the role list, not a UUID input;
    // the BE has its own UUID + existence check.
    this.groupForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(groupNameSchema)]],
      description: ['', [zodValidator(groupDescriptionSchema)]],
      roleId: [{ value: '', disabled: true }, Validators.required],
      users: [[]],
      status: [1],
    });

    this.groupForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkFormDirty());
  }

  async loadGroupData(): Promise<void> {
    await this.groupService.loadOne(this.categoryId);
    const groupData = this.groupService.current();

    if (!groupData) return;

    this.selectedRoleName = groupData.roleName || '';
    this.isDefaultGroup = groupData.isDefault === 1;

    // Partition the loaded members into locked vs manageable. Two
    // rules drive locking:
    //   1. Bootstrap admin (user.isDefault === 1) — only relevant
    //      to the default Administrator group, where the BE
    //      invariant requires them to remain. For non-default
    //      groups the BE rejects them outright, so they shouldn't
    //      be in userGroups to begin with.
    //   2. Logged-in user — locked everywhere so an admin can't
    //      eject themselves from a group mid-edit and lose access
    //      to permissions they need to finish the change.
    const loggedInUserId: string =
      this.globalService.getTokenDetails('id') || '';

    const lockedIds = new Set<string>();
    this.lockedMembers = [];
    for (const mapping of groupData.userGroups || []) {
      const u = mapping.user;
      if (!u) continue;
      const isPrimaryAdmin = u.isDefault === 1;
      const isSelf = u.id === loggedInUserId;
      if (isPrimaryAdmin || isSelf) {
        lockedIds.add(u.id);
        this.lockedMembers.push({
          id: u.id,
          username: u.username,
          isPrimaryAdmin,
          isSelf,
        });
      }
    }

    // Picker only handles the manageable subset. The save flow
    // reassembles the full member set before sending.
    const manageableIds = (groupData.userGroups || [])
      .map((mapping: any) => mapping.userId)
      .filter((id: string) => !lockedIds.has(id));

    // Kick the initial picker page now that we know whether we're
    // on the default group (controls excludeDefault).
    this.loadUsers({
      page: DEFAULT_PAGE,
      limit: 10,
      excludeDefault: !this.isDefaultGroup,
      excludeSelf: true,
    });

    this.groupForm.patchValue({
      id: groupData.id,
      name: groupData.name,
      description: groupData.description,
      roleId: groupData.roleId,
      users: manageableIds,
      status: groupData.status,
    });

    if (this.isDefaultGroup) {
      this.groupForm.get('name')?.disable();
      this.groupForm.get('description')?.disable();
      this.groupForm.get('status')?.disable();
    }

    this.originalFormValue = this.groupForm.getRawValue();
    this.isFormDirty = false;
    this.groupForm.markAsPristine();
    this.groupLoaded = true;
    this.cdr.markForCheck();
  }

  /**
   * Fetcher for server-mode users multiselect.
   *
   * Always excludes the logged-in user (paired with the locked-
   * self badge above the picker). Excludes the bootstrap admin
   * for non-default groups (their membership is structurally
   * forbidden by the BE invariant); the default group lets them
   * through the query but they're shown via the locked badge, not
   * via the picker.
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
      excludeDefault: !this.isDefaultGroup,
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
    return this.groupForm.valid && this.isFormDirty;
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
      // Reassemble the full member set: locked members (bootstrap
      // admin and/or logged-in user) PLUS whatever the manageable
      // picker currently holds. The BE expects the complete
      // membership list per save and treats anyone missing from
      // it as removed — without this merge, locked members would
      // silently disappear.
      const manageable: string[] =
        this.groupForm.get('users')?.value || [];
      const usersPayload = [
        ...this.lockedMembers.map(m => m.id),
        ...manageable.filter(
          id => !this.lockedMembers.some(m => m.id === id),
        ),
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
        // Re-apply the per-page locks: roleId is always disabled
        // (cannot change a group's role on edit), and default
        // groups have name/description/status locked too.
        this.groupForm.get('roleId')?.disable({ emitEvent: false });
        if (this.isDefaultGroup) {
          this.groupForm.get('name')?.disable({ emitEvent: false });
          this.groupForm.get('description')?.disable({ emitEvent: false });
          this.groupForm.get('status')?.disable({ emitEvent: false });
        }
      }
    }
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
