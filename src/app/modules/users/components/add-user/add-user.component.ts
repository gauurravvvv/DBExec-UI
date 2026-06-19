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
import { USER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import {
  emailSchema,
  firstNameSchema,
  groupIdsSchema,
  lastNameSchema,
  localeSchema,
  usernameSchema,
} from 'src/app/shared/validators/users';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
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
    // All field validators come from the SHARED Zod schema at
    // src/app/shared/validators/users.ts (same file ships in the BE
    // repo). Required / regex / length / locale-enum rules are
    // identical on both sides.
    this.userForm = this.fb.group({
      firstName: ['', [zodValidator(firstNameSchema)]],
      lastName: ['', [zodValidator(lastNameSchema)]],
      username: ['', [zodValidator(usernameSchema)]],
      email: ['', [zodValidator(emailSchema)]],
      groupIds: [[], [zodValidator(groupIdsSchema)]],
      locale: ['en', [zodValidator(localeSchema)]],
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

  /**
   * Unified error getter. Reads the `zod` translation key produced by
   * the shared schema and runs it through ngx-translate. Same key the
   * BE returns on a 400.
   */
  fieldError(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  // Backwards-compat aliases for existing templates. New code should
  // call fieldError(name) directly.
  getFirstNameError(): string {
    return this.fieldError('firstName');
  }
  getLastNameError(): string {
    return this.fieldError('lastName');
  }
  getUsernameError(): string {
    return this.fieldError('username');
  }
}
