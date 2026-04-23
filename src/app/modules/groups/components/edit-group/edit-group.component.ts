import {ChangeDetectionStrategy, Component, OnInit, OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
  private destroy$ = new Subject<void>();

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
      // Org + role immutable once group created
      organisation: [{ value: '', disabled: true }, Validators.required],
      roleId: [{ value: '', disabled: true }, Validators.required],
      users: [[]],
      status: [1],
    });

    this.groupForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.checkFormDirty());
  }

  loadGroupData(): void {
    this.groupService.viewGroup(this.orgId, this.categoryId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const groupData = response.data;

        this.selectedOrgName = groupData.organisationName || '';
        this.selectedRoleName = groupData.roleName || '';

        // Load all active users for this org
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

        // Lock name, description, status for default groups
        if (this.isDefaultGroup) {
          this.groupForm.get('name')?.disable();
          this.groupForm.get('description')?.disable();
          this.groupForm.get('status')?.disable();
        }

        this.originalFormValue = this.groupForm.getRawValue();
        this.isFormDirty = false;
        this.groupForm.markAsPristine();
      }
    });
  }

  loadUsers(params: any): void {
    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = (response.data.users || []).filter(
          (u: any) => u.status === 1,
        );
      }
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

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.groupService
        .editGroup(this.groupForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.isFormDirty = false;
            this.groupForm.markAsPristine();
            this.router.navigate([GROUP.LIST]);
          }
        });
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}