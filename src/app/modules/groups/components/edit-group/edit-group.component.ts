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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { GROUP } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-edit-group',
  templateUrl: './edit-group.component.html',
  styleUrls: ['./edit-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditGroupComponent implements OnInit, HasUnsavedChanges {
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

  saving = this.groupService.saving;

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
    this.groupForm = this.fb.group({
      id: [''],
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
      organisation: [{ value: '', disabled: true }, Validators.required],
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

    this.loadUsers({
      page: DEFAULT_PAGE,
      limit: 10,
    });

    const userIds = (groupData.userGroups || []).map(
      (mapping: any) => mapping.userId,
    );

    this.isDefaultGroup = groupData.isDefault === 1;

    this.groupForm.patchValue({
      id: groupData.id,
      name: groupData.name,
      description: groupData.description,
      organisation: groupData.organisationId,
      roleId: groupData.roleId,
      users: userIds,
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
    this.cdr.markForCheck();
  }

  /**
   * Fetcher for server-mode users multiselect.
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
    const params: any = { page, limit };
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
      const response = await this.groupService.edit(
        this.groupForm,
        this.saveJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.isFormDirty = false;
        this.groupForm.markAsPristine();
        this.router.navigate([GROUP.LIST]);
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

  getNameError(): string {
    const control = this.groupForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.GROUP_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.GROUP_NAME_MIN_LENGTH', {
        length: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.GROUP_NAME_MAX_LENGTH', {
        length: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.GROUP_NAME_PATTERN');
    return '';
  }
}
