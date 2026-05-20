import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { USER } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-add-user',
  templateUrl: './add-user.component.html',
  styleUrls: ['./add-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddUserComponent implements OnInit, HasUnsavedChanges {
  userForm!: FormGroup;
  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  groups: any[] = [];
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;

  readonly locales = SUPPORTED_LOCALES as unknown as any[];

  saving = this.userService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private userService: UserService,
    private organisationService: OrganisationService,
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
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadGroups(this.globalService.getTokenDetails('organisationId'));
    }
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
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(30),
          Validators.pattern(REGEX.lastName),
        ],
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      groupIds: [[], Validators.required],
      locale: ['en', Validators.required],
    });
  }

  /**
   * Fetcher for the server-mode organisation dropdown.
   */
  loadOrgsPage = async ({
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
      const res: any =
        await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const orgs = response?.data?.orgs ?? [];
        this.organisations = orgs;
        this.preloadedOrgs = orgs;
        this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
      }
      this.cdr.markForCheck();
    });
  }

  /**
   * Fetcher for the server-mode group multiselect. Gates on the currently
   * selected org in the form (group list is org-scoped).
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
    const orgId =
      this.userForm?.get('organisation')?.value ||
      this.globalService.getTokenDetails('organisationId');
    if (!orgId) return { items: [], total: 0 };
    const params: any = { orgId, page, limit };
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

  loadGroups(orgId: string) {
    if (!orgId) return;
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const all = response?.data?.groups || [];
          const active = all.filter((g: any) => g.status === 1);
          this.groups = active;
          this.preloadedGroups = active;
          this.preloadedGroupsTotal =
            response?.data?.count ?? active.length;
        }
        this.cdr.markForCheck();
      });
  }

  onOrganisationChange(orgId: string) {
    this.groups = [];
    this.preloadedGroups = null;
    this.preloadedGroupsTotal = null;
    this.userForm.patchValue({ groupIds: [] });
    if (orgId) {
      this.loadGroups(orgId);
    }
  }

  async onSubmit() {
    if (this.userForm.valid) {
      const response = await this.userService.add(this.userForm);
      if (this.globalService.handleSuccessService(response)) {
        this.userForm.markAsPristine();
        this.router.navigate([USER.LIST]);
      }
      this.cdr.markForCheck();
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
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.FIRST_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.FIRST_NAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.FIRST_NAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.FIRST_NAME_PATTERN');
    return '';
  }

  getLastNameError(): string {
    const control = this.userForm.get('lastName');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.LAST_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.LAST_NAME_PATTERN');
    return '';
  }

  getUsernameError(): string {
    const control = this.userForm.get('username');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.USERNAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.USERNAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.USERNAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.USERNAME_PATTERN');
    return '';
  }
}
