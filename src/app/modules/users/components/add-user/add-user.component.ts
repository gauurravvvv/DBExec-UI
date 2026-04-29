import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
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
  groups: any[] = [];
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

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
      }
      this.cdr.markForCheck();
    });
  }

  loadGroups(orgId: string) {
    if (!orgId) return;
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.groups = (response.data.groups || []).filter(
            (g: any) => g.status === 1,
          );
        }
        this.cdr.markForCheck();
      });
  }

  onOrganisationChange(orgId: string) {
    this.groups = [];
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
