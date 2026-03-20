import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FORGOT_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { REGEX } from 'src/app/constants/regex.constant';
import { AUTH } from 'src/app/constants/routes';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm: FormGroup;
  showPassword = false;
  features = FORGOT_PASSWORD_PAGE_OPTIONS;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
  ) {
    this.forgotPasswordForm = this.fb.group({
      organisation: [
        '',
        [Validators.required, Validators.pattern(REGEX.orgName)],
      ],
      username: ['', [Validators.required, Validators.pattern(REGEX.username)]],
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {}

  getErrorMessage(fieldName: string): string {
    const control = this.forgotPasswordForm.get(fieldName);
    if (!control?.errors) return '';
    if (control.errors['required']) {
      switch (fieldName) {
        case 'organisation':
          return 'Organisation is required';
        case 'username':
          return 'Username is required';
        case 'email':
          return 'Email is required';
        default:
          return 'This field is required';
      }
    }
    if (control.errors['pattern']) {
      switch (fieldName) {
        case 'organisation':
          return 'Organisation name must start with a letter or number';
        case 'username':
          return 'Username must start with a letter and contain only letters, numbers, dots, underscores or hyphens';
        default:
          return 'Invalid format';
      }
    }
    if (control.errors['email']) return 'Please enter a valid email address';
    return '';
  }

  onSubmit(): void {
    if (this.forgotPasswordForm.valid) {
      this.loginService
        .generateOTP(this.forgotPasswordForm)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.router.navigate([AUTH.LOGIN], {
              replaceUrl: true,
            });
          }
        });
    }
  }
}
