import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { USER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditUserComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.userService.cancelReads();
  }

  userForm!: FormGroup;
  isCancelClicked = false;
  groups: any[] = [];
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  userId: string = '';
  userData: any;
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';

  saving = this.userService.saving;
  // Drives the skeleton form swap on initial GET.
  loading = this.userService.loading;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.loadGroups();
    this.loadAdminData();
  }

  /**
   * Fetcher for server-mode group multiselect.
   */
  loadGroupsPage = async ({
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
      const res: any = await this.groupService.listGroups(params);
      if (this.globalService.handleSuccessService(res, false)) {
        const groups = (res?.data?.groups || []).filter(
          (g: any) => g.status === 1,
        );
        return { items: groups, total: res?.data?.count ?? groups.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Single-group resolver — for stored groupIds on the existing user that may
   * not be in the dropdown's first page. The custom-multiselect calls this
   * once per missing ID to fetch its display label.
   */
  resolveSelectedGroup = async (id: string): Promise<any> => {
    try {
      const res: any = await this.groupService.viewGroup(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadGroups() {
    this.groupService
      .listGroups({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const all = response?.data?.groups || [];
          const active = all.filter((g: any) => g.status === 1);
          this.groups = active;
          this.preloadedGroups = active;
          this.preloadedGroupsTotal = response?.data?.count ?? active.length;
        }
        this.cdr.markForCheck();
      });
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm() {
    this.userForm = this.fb.group({
      id: [''],
      firstName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(30),
          Validators.pattern(REGEX.firstName),
        ],
      ],
      // lastName is OPTIONAL — many cultures use a single mononym.
      // Drop required + minLength; keep pattern + maxLength so an
      // explicitly typed value still has to be well-formed.
      lastName: [
        '',
        [Validators.maxLength(30), Validators.pattern(REGEX.lastName)],
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
      status: [],
      // `Validators.required` treats `[]` as valid (only null/undefined/''
      // fail it), so the form would silently accept zero-group users.
      // Use a min-count check that fails when the selection is empty.
      groupIds: [[], minArrayLength(1)],
    });
  }

  async loadAdminData() {
    await this.userService.loadOne(this.userId);
    const data = this.userService.current();
    if (data) {
      this.userData = data;
      this.isLocked = !!this.userData.isLocked;
      if (this.isLocked) {
        this.userForm.get('status')?.disable();
      }
      this.userForm.patchValue({
        id: this.userData.id,
        firstName: this.userData.firstName,
        lastName: this.userData.lastName,
        username: this.userData.username,
        email: this.userData.email,
        status: this.userData.status,
        groupIds: this.userData.groupIds || [],
      });
    }
    this.cdr.markForCheck();
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave() {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave() {
    if (this.saveJustification.trim()) {
      // Fire the request first (service.update uses getRawValue, so
      // disable order is less critical, but stay consistent) then
      // lock the form for the duration of the PUT.
      const request = this.userService.update(
        this.userForm,
        this.saveJustification.trim(),
      );
      this.userForm.disable({ emitEvent: false });
      try {
        const response = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.userForm.markAsPristine();
          this.router.navigate([USER.LIST]);
        }
      } finally {
        this.userForm.enable({ emitEvent: false });
        // Re-apply the per-page rule: locked accounts keep the
        // status toggle disabled.
        if (this.isLocked) {
          this.userForm.get('status')?.disable({ emitEvent: false });
        }
        this.cdr.markForCheck();
      }
    }
  }

  onCancel() {
    if (!this.userData) return;
    this.userForm.patchValue({
      id: this.userData.id,
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      username: this.userData.username,
      email: this.userData.email,
      status: this.userData.status,
      groupIds: this.userData.groupIds || [],
    });
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
  }

  getFirstNameError(): string {
    const control = this.userForm.get('firstName');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.FIRST_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.FIRST_NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.FIRST_NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.FIRST_NAME_PATTERN');
    return '';
  }

  getLastNameError(): string {
    const control = this.userForm.get('lastName');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.LAST_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.LAST_NAME_PATTERN');
    return '';
  }
}

/**
 * Validator that fails when an array-valued control has fewer than
 * `min` selections. Returns `{ minCount: { min, actual } }` on
 * failure so templates can surface a localised message keyed off the
 * `minCount` error name.
 */
function minArrayLength(min: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (Array.isArray(value) && value.length >= min) return null;
    return { minCount: { min, actual: Array.isArray(value) ? value.length : 0 } };
  };
}
