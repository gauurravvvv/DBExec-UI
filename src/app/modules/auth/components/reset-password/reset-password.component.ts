import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RESET_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { REGEX } from 'src/app/constants/regex.constant';
import { AUTH } from 'src/app/constants/routes';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm: FormGroup;
  showPassword = false;
  features = RESET_PASSWORD_PAGE_OPTIONS;
  userId!: number;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute
  ) {
    this.resetPasswordForm = this.fb.group(
      {
        otp: ['', [Validators.required, Validators.pattern(REGEX.otp)]],
        newPassword: [
          '',
          [Validators.required, Validators.pattern(REGEX.password)],
        ],
        confirmPassword: [
          '',
          [Validators.required, Validators.pattern(REGEX.password)],
        ],
      },
      {
        validator: this.passwordMatchValidator,
      }
    );
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.userId = +params['id'];
      if (!this.userId) {
        // Redirect back to forgot-password if ID is missing
        this.router.navigate([AUTH.LOGIN]);
      }
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  onSubmit() {
    if (this.resetPasswordForm.valid) {
      this.loginService
        .resetPassword(this.resetPasswordForm, this.userId)
        .then(res => {
          if (this.globalService.handleSuccessService(res)) {
            // On success, navigate to login page
            this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
          }
        });
    }
  }

  onlyNumbers(event: KeyboardEvent): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  togglePassword(event: Event, id: string) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById(id) as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }
}
