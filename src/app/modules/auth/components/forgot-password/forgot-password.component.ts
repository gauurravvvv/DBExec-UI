import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FORGOT_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from '../../services/auth.service';
import { REGEX } from 'src/app/constants/regex.constant';

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
    private globalService: GlobalService
  ) {
    this.forgotPasswordForm = this.fb.group({
      organisation: ['', [Validators.required, REGEX.orgName]],
      username: ['', [Validators.required, REGEX.username]],
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.forgotPasswordForm.valid) {
      this.loginService
        .generateOTP(this.forgotPasswordForm)
        .then((res: any) => {
          if (this.globalService.handleAPIResponse(res)) {
            this.router.navigate(['/reset-password'], {
              replaceUrl: true,
              queryParams: {
                id: res.data.userId,
              },
            });
          }
        });
    }
  }
}
