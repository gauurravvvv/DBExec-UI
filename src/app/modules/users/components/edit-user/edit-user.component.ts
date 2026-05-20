import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { USER } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { TranslateService } from '@ngx-translate/core';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditUserComponent implements OnInit, HasUnsavedChanges {
  userForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  groups: any[] = [];
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  userId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;
  selectedOrgName: string = '';
  userData: any;
  orgId: string = '';
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';

  saving = this.userService.saving;

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
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadGroups();
    this.loadAdminData();
  }

  /**
   * Fetcher for server-mode group multiselect. Org-scoped via this.orgId
   * (route param) or token fallback.
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
      this.orgId || this.globalService.getTokenDetails('organisationId');
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

  /**
   * Single-group resolver — for stored groupIds on the existing user that may
   * not be in the dropdown's first page. The custom-multiselect calls this
   * once per missing ID to fetch its display label.
   */
  resolveSelectedGroup = async (id: string): Promise<any> => {
    const orgId =
      this.orgId || this.globalService.getTokenDetails('organisationId');
    if (!orgId) return null;
    try {
      const res: any = await this.groupService.viewGroup(orgId, id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadGroups() {
    const orgId =
      this.orgId || this.globalService.getTokenDetails('organisationId');
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
      organisation: ['', Validators.required],
      status: [],
      groupIds: [[], Validators.required],
    });
  }

  async loadAdminData() {
    await this.userService.loadOne(this.orgId, this.userId);
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
        organisation: this.userData.organisationId,
        status: this.userData.status,
        groupIds: this.userData.groupIds || [],
      });
      this.selectedOrgName = this.userData.organisationName;
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
      const response = await this.userService.update(
        this.userForm,
        this.saveJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.userForm.markAsPristine();
        this.router.navigate([USER.LIST]);
      }
      this.cdr.markForCheck();
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
      organisation: this.userData.organisationId,
      status: this.userData.status,
      groupIds: this.userData.groupIds || [],
    });
    this.selectedOrgName = this.userData.organisationName;
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
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
}
