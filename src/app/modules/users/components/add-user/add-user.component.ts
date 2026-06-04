import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { USER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-add-user',
  templateUrl: './add-user.component.html',
  styleUrls: ['./add-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddUserComponent implements OnInit, HasUnsavedChanges {
  userForm!: FormGroup;
  groups: any[] = [];
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;

  readonly locales = SUPPORTED_LOCALES as unknown as any[];

  saving = this.userService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    this.loadGroups();
  }

  initForm() {
    this.userForm = this.fb.group({
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
      // `Validators.required` treats `[]` as valid (only null/undefined/''
      // fail it), so the form would silently accept zero-group users.
      // Use a min-count check that fails when the selection is empty.
      groupIds: [[], minArrayLength(1)],
      locale: ['en', Validators.required],
    });
  }

  /**
   * Fetcher for the server-mode group multiselect.
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

  async onSubmit() {
    if (this.userForm.valid) {
      // Fire the request first (service reads userForm.value) then
      // lock the form so the user can't edit fields while the POST
      // is in flight.
      const request = this.userService.add(this.userForm);
      this.userForm.disable({ emitEvent: false });
      try {
        const response = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.userForm.markAsPristine();
          this.router.navigate([USER.LIST]);
        }
      } finally {
        this.userForm.enable({ emitEvent: false });
        this.cdr.markForCheck();
      }
    } else {
      Object.keys(this.userForm.controls).forEach(key => {
        const control = this.userForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel() {
    this.userForm.reset();
    Object.keys(this.userForm.controls).forEach(key => {
      this.userForm.get(key)?.setValue('');
    });
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

  getUsernameError(): string {
    const control = this.userForm.get('username');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.USERNAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.USERNAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.USERNAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.USERNAME_PATTERN');
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
