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
import { GROUP } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from '../../services/group.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';

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
  isFormDirty = false;
  showSaveConfirm = false;
  saveJustification = '';

  categoryId!: string;
  orgId!: string;
  selectedOrgName = '';
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
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

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
    await this.groupService.loadOne(this.orgId, this.categoryId);
    const groupData = this.groupService.current();

    if (!groupData) return;

    this.selectedOrgName = groupData.organisationName || '';
    this.selectedRoleName = groupData.roleName || '';

    this.loadUsers({
      orgId: groupData.organisationId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
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

  loadUsers(params: any): void {
    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = (response.data.users || []).filter(
          (u: any) => u.status === 1,
        );
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
    if (control?.errors?.['required']) return 'Group name is required';
    if (control?.errors?.['minlength'])
      return `Group name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Group name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Group name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }
}
