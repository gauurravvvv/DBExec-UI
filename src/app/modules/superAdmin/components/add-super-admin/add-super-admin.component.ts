import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SuperAdminService } from '../../services/superAdmin.service';

@Component({
  selector: 'app-add-super-admin',
  templateUrl: './add-super-admin.component.html',
  styleUrls: ['./add-super-admin.component.scss'],
})
export class AddSuperAdminComponent implements OnInit {
  adminForm!: FormGroup;
  showPassword = false;

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.adminForm.dirty;
  }

  constructor(
    private fb: FormBuilder,
    private superAdminService: SuperAdminService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.adminForm = this.fb.group({
      firstName: [
        '',
        [Validators.required, Validators.pattern(REGEX.firstName)],
      ],
      lastName: ['', [Validators.required, Validators.pattern(REGEX.lastName)]],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.pattern(REGEX.username),
        ],
      ],
      password: ['', [Validators.required, Validators.pattern(REGEX.password)]],
      email: ['', [Validators.required, Validators.email]],
    });
  }

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.adminForm.valid) {
      this.superAdminService
        .addSuperAdmin(this.adminForm)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
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
}
