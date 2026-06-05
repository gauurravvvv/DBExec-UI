import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { SYSTEM_ADMIN } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SystemAdminService } from '../../services/system-admin.service';

@Component({
  selector: 'app-edit-system-admin',
  templateUrl: './edit-system-admin.component.html',
  styleUrls: ['./edit-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSystemAdminComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.systemAdminService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  adminForm!: FormGroup;
  adminId: string = '';
  adminData: any;
  isCancelClicked: boolean = false;
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';
  saving = this.systemAdminService.saving;
  // `loading` gates the form vs the skeleton — once the GET resolves
  // and `adminData` is populated, the real form takes over and the
  // skeleton disappears. Page chrome (header, back, save buttons)
  // stays visible the whole time.
  loading = this.systemAdminService.loading;

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.adminForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  constructor(
    private fb: FormBuilder,
    private systemAdminService: SystemAdminService,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.initForm();

    // Subscribe to form value changes
    this.adminForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  private initForm(): void {
    this.adminForm = this.fb.group({
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
      status: [false],
    });

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.adminId = params['id'];
        if (this.adminId) {
          this.patchFormValues();
        }
      });
  }

  async patchFormValues(): Promise<void> {
    await this.systemAdminService.loadOne(this.adminId);
    const data = this.systemAdminService.current();
    if (!data) return;

    // Deep-link guard: if the BE marked this record uneditable
    // (default admin OR the actor themselves), bounce back to the
    // view page rather than render a form that would 400 on save.
    // The list / view buttons already gate on canEdit; this catch
    // covers direct URL access and stale link reloads.
    if (data.canEdit === false) {
      this.router.navigate(['/app/admins', this.adminId]);
      return;
    }

    this.adminData = data;
    this.isLocked = !!this.adminData.isLocked;
    this.adminForm.patchValue(this.adminData);
    if (this.isLocked) {
      this.adminForm.get('status')?.disable();
    }
  }

  onSubmit(): void {
    if (this.adminForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      // Fire the request first (service.update uses getRawValue, so
      // disable order is less critical, but stay consistent with the
      // rest of the rollout) then lock the form.
      const request = this.systemAdminService.update(
        this.adminForm,
        this.saveJustification.trim(),
      );
      this.adminForm.disable({ emitEvent: false });
      try {
        const response: any = await request;
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.adminForm.markAsPristine();
          this.router.navigate([SYSTEM_ADMIN.LIST]);
        }
      } finally {
        this.adminForm.enable({ emitEvent: false });
        // Re-apply the per-page rule that locks the status toggle
        // when the admin account is locked — form.enable() would
        // otherwise re-enable it.
        if (this.isLocked) {
          this.adminForm.get('status')?.disable({ emitEvent: false });
        }
      }
    }
  }

  onCancel(): void {
    this.adminForm.patchValue(this.adminData);
    this.adminForm.markAsPristine();
    this.isCancelClicked = true;
  }

  getFirstNameError(): string {
    const control = this.adminForm.get('firstName');
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
    const control = this.adminForm.get('lastName');
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

  getEmailError(): string {
    const control = this.adminForm.get('email');
    if (control?.errors?.['required'])
      return this.translate.instant('VALIDATION.EMAIL_REQUIRED');
    if (control?.errors?.['email'])
      return this.translate.instant('VALIDATION.EMAIL_INVALID');
    return '';
  }
}
