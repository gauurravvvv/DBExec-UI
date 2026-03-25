import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SET_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { AUTH } from 'src/app/constants/routes';
import { StorageService } from 'src/app/core/services/storage.service';
import { passwordStrengthValidator } from 'src/app/shared/validators/password-strength.validator';

@Component({
  selector: 'app-set-password',
  templateUrl: './set-password.component.html',
  styleUrls: ['./set-password.component.scss'],
})
export class SetPasswordComponent implements OnInit {
  setPasswordForm: FormGroup;
  showPassword = false;
  features = SET_PASSWORD_PAGE_OPTIONS;
  userId!: string;
  orgId!: string;
  token!: string;

  pageState:
    | 'loading'
    | 'valid'
    | 'expired'
    | 'already_set'
    | 'invalid'
    | 'resent' = 'loading';
  resending = false;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {
    this.setPasswordForm = this.fb.group(
      {
        newPassword: ['', [Validators.required, passwordStrengthValidator()]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validator: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.userId = params['id'];
      this.orgId = params['orgId'];
      this.token = params['token'];
      if (!this.userId || !this.orgId || !this.token) {
        this.router.navigate([AUTH.LOGIN]);
        return;
      }
      this.verifyToken();
    });
  }

  verifyToken() {
    this.pageState = 'loading';
    this.loginService
      .verifySetupToken(this.userId, this.orgId, this.token)
      .then(res => {
        if (res.status && res.data?.tokenStatus) {
          this.pageState = res.data.tokenStatus;
          if (this.pageState === 'already_set') {
            setTimeout(() => this.router.navigate([AUTH.LOGIN]), 3000);
          }
        } else {
          this.pageState = 'invalid';
        }
      });
  }

  resendLink() {
    this.resending = true;
    this.loginService.resendSetupLink(this.userId, this.orgId).then(res => {
      this.resending = false;
      if (this.globalService.handleSuccessService(res)) {
        this.pageState = 'resent';
      }
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  onSubmit() {
    if (this.setPasswordForm.valid) {
      const { newPassword } = this.setPasswordForm.value;
      this.loginService
        .setPassword(newPassword, this.userId, this.orgId, this.token)
        .then(res => {
          if (this.globalService.handleSuccessService(res)) {
            StorageService.clear();
            this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
          }
        });
    }
  }

  getPasswordError(): string {
    const control = this.setPasswordForm.get('newPassword');
    if (control?.errors?.['required']) return 'Password is required';
    if (control?.errors?.['passwordMinLength'])
      return `Password must be at least ${control.errors['passwordMinLength'].requiredLength} characters`;
    if (control?.errors?.['passwordMaxLength'])
      return `Password must not exceed ${control.errors['passwordMaxLength'].requiredLength} characters`;
    if (control?.errors?.['passwordNoSpaces'])
      return 'Password must not contain spaces';
    if (control?.errors?.['passwordLowercase'])
      return 'Password must contain at least one lowercase letter';
    if (control?.errors?.['passwordUppercase'])
      return 'Password must contain at least one uppercase letter';
    if (control?.errors?.['passwordDigit'])
      return 'Password must contain at least one number';
    if (control?.errors?.['passwordSpecial'])
      return 'Password must contain at least one special character (e.g., @$!%*?&)';
    return '';
  }

  togglePassword(event: Event, id: string) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById(id) as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }
}
