import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { SuperAdminService } from '../../services/super-admin.service';

@Component({
  selector: 'app-edit-super-admin',
  templateUrl: './edit-super-admin.component.html',
  styleUrls: ['./edit-super-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSuperAdminComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  adminForm!: FormGroup;
  adminId: string = '';
  adminData: any;
  isCancelClicked: boolean = false;
  isLocked: boolean = false;
  showSaveConfirm = false;
  saveJustification = '';
  saving = this.superAdminService.saving;

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.adminForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  constructor(
    private fb: FormBuilder,
    private superAdminService: SuperAdminService,
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
    await this.superAdminService.loadOne(this.adminId);
    const data = this.superAdminService.current();
    if (data) {
      this.adminData = data;
      this.isLocked = !!this.adminData.isLocked;
      this.adminForm.patchValue(this.adminData);
      if (this.isLocked) {
        this.adminForm.get('status')?.disable();
      }
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
      const response: any = await this.superAdminService.update(
        this.adminForm,
        this.saveJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.adminForm.markAsPristine();
        this.router.navigate([SUPER_ADMIN.LIST]);
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
    const control = this.adminForm.get('lastName');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.LAST_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.LAST_NAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.LAST_NAME_PATTERN');
    return '';
  }

  getEmailError(): string {
    const control = this.adminForm.get('email');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.EMAIL_REQUIRED');
    if (control?.errors?.['email']) return this.translate.instant('VALIDATION.EMAIL_INVALID');
    return '';
  }
}
