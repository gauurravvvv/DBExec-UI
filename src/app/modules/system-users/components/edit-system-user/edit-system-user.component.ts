import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { SYSTEM_GROUP } from 'src/app/core/constants/api.constant';
import { SYSTEM_USER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  emailSchema,
  fullNameSchema,
  groupIdsSchema,
  usernameSchema,
} from 'src/app/shared/validators/users';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { SystemUserService } from '../../services/system-user.service';

@Component({
  selector: 'app-edit-system-user',
  templateUrl: './edit-system-user.component.html',
  styleUrls: ['./edit-system-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSystemUserComponent
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
    private userService: SystemUserService,
    private http: HttpClientService,
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
   * Fetch a page of SYSTEM groups from the master-DB /system-groups
   * endpoint. Mirrors the source's GroupService.listGroups shape
   * (skipLoader GET, envelope `res.data.groups`).
   */
  private listSystemGroups(params: any): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(SYSTEM_GROUP.LIST, { params, skipLoader: true }),
    );
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
      const res: any = await this.listSystemGroups(params);
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
   * once per missing ID to fetch its display label. Points at the SYSTEM
   * group detail endpoint.
   */
  resolveSelectedGroup = async (id: string): Promise<any> => {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(SYSTEM_GROUP.GET + id, { skipLoader: true }),
      );
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadGroups() {
    this.listSystemGroups({ page: DEFAULT_PAGE, limit: 10 }).then(response => {
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
    // Field validators sourced from the SHARED Zod schema.
    this.userForm = this.fb.group({
      id: [''],
      fullName: ['', [zodValidator(fullNameSchema)]],
      username: ['', [zodValidator(usernameSchema)]],
      email: ['', [zodValidator(emailSchema)]],
      status: [],
      groupIds: [[], [zodValidator(groupIdsSchema)]],
    });
  }

  async loadAdminData() {
    await this.userService.loadOne(this.userId);
    const data = this.userService.current();
    if (!data) return;

    // Deep-link guard: if the BE marks the record uneditable
    // (self — the sole self-protection guard), bounce back to the
    // view page rather than render a form that would 400 on save.
    // The list / view buttons already gate on canEdit; this catches
    // direct URL access and stale link reloads.
    if (data.canEdit === false) {
      this.router.navigate(['/app/system-users', this.userId]);
      return;
    }

    this.userData = data;
    this.isLocked = !!this.userData.isLocked;
    if (this.isLocked) {
      this.userForm.get('status')?.disable();
    }
    this.userForm.patchValue({
      id: this.userData.id,
      fullName: this.userData.fullName,
      username: this.userData.username,
      email: this.userData.email,
      status: this.userData.status,
      groupIds: this.userData.groupIds || [],
    });
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

  goBack(): void {
    this.router.navigate([SYSTEM_USER.LIST]);
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
          this.router.navigate([SYSTEM_USER.LIST]);
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
      fullName: this.userData.fullName,
      username: this.userData.username,
      email: this.userData.email,
      status: this.userData.status,
      groupIds: this.userData.groupIds || [],
    });
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
  }

  /**
   * Unified error getter. Reads the `zod` translation key produced by
   * the shared schema and runs it through ngx-translate.
   */
  fieldError(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getFullNameError(): string {
    return this.fieldError('fullName');
  }
}
