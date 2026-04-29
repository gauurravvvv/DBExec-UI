import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/constants/regex.constant';
import { SYSTEM_ADMIN } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SystemAdminService } from '../../services/system-admin.service';

@Component({
  selector: 'app-add-system-admin',
  templateUrl: './add-system-admin.component.html',
  styleUrls: ['./add-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSystemAdminComponent implements OnInit, HasUnsavedChanges {
  adminForm!: FormGroup;
  saving = this.systemAdminService.saving;

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
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.adminForm = this.fb.group({
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
    });
  }

  async onSubmit(): Promise<void> {
    if (this.adminForm.valid) {
      const response: any = await this.systemAdminService.add(this.adminForm);
      if (this.globalService.handleSuccessService(response)) {
        this.adminForm.markAsPristine();
        this.router.navigate([SYSTEM_ADMIN.LIST]);
      }
    } else {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.adminForm.controls).forEach(key => {
        const control = this.adminForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel(): void {
    this.adminForm.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.adminForm.controls).forEach(key => {
      this.adminForm.get(key)?.setValue('');
    });
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

  getUsernameError(): string {
    const control = this.adminForm.get('username');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.USERNAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.USERNAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.USERNAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.USERNAME_PATTERN');
    return '';
  }

  getEmailError(): string {
    const control = this.adminForm.get('email');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.EMAIL_REQUIRED');
    if (control?.errors?.['email']) return this.translate.instant('VALIDATION.EMAIL_INVALID');
    return '';
  }
}
