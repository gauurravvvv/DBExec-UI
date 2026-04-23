import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SuperAdminService } from '../../services/superAdmin.service';

@Component({
  selector: 'app-add-super-admin',
  templateUrl: './add-super-admin.component.html',
  styleUrls: ['./add-super-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSuperAdminComponent implements OnInit, HasUnsavedChanges {
  adminForm!: FormGroup;

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
    private globalService: GlobalService,
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

  onSubmit(): void {
    if (this.adminForm.valid) {
      this.superAdminService
        .addSuperAdmin(this.adminForm)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.adminForm.markAsPristine();
            this.router.navigate([SUPER_ADMIN.LIST]);
          }
        });
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
    if (control?.errors?.['required']) return 'First name is required';
    if (control?.errors?.['minlength'])
      return `First name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `First name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'First name must start with a letter and can only contain letters, hyphens, apostrophes and spaces';
    return '';
  }

  getLastNameError(): string {
    const control = this.adminForm.get('lastName');
    if (control?.errors?.['required']) return 'Last name is required';
    if (control?.errors?.['minlength'])
      return `Last name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Last name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Last name must start with a letter and can only contain letters, hyphens, apostrophes and spaces';
    return '';
  }

  getUsernameError(): string {
    const control = this.adminForm.get('username');
    if (control?.errors?.['required']) return 'Username is required';
    if (control?.errors?.['minlength'])
      return `Username must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Username must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Username must start with a letter and can only contain letters, numbers, dots, hyphens and underscores';
    return '';
  }
}
