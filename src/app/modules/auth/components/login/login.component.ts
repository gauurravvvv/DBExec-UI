import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LOGIN_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { ROLES } from 'src/app/constants/user.constant';
import { REGEX } from 'src/app/constants/regex.constant';
import { HOME_ROUTES } from 'src/app/shared/components/layout/sidebar/sidebar.constant';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  showPassword = false;
  features = LOGIN_PAGE_OPTIONS;
  loginError = '';

  private returnUrl: string | null = null;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private loginService: LoginService,
    private globalService: GlobalService,
  ) {
    this.loginForm = this.fb.group({
      organisation: [
        'DBExec',
        [Validators.required, Validators.pattern(REGEX.orgName)],
      ],
      username: [
        'dbexec_vanshika',
        [Validators.required, Validators.pattern(REGEX.username)],
      ],
      password: [
        'Gaurav@1234',
        [Validators.required, Validators.pattern(REGEX.password)],
      ],
    });
  }

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loginError = '';
      this.loginService.login(this.loginForm).then((res: any) => {
        if (this.globalService.handleSuccessService(res, true, false)) {
          const role = this.globalService.getTokenDetails('role');
          const homeRoute = role === ROLES.SUPER_ADMIN
            ? HOME_ROUTES.SUPER_ADMIN
            : HOME_ROUTES.ORG_ADMIN;
          const target = this.returnUrl || homeRoute;
          this.router.navigateByUrl(target, {
            replaceUrl: true,
          });
        } else {
          this.loginError = res.message;
        }
      });
    }
  }

  togglePassword(event: Event) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById('password') as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }

  trackByIndex(index: number): number {
    return index;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.loginForm.get(fieldName);
    if (!control?.errors) return '';
    if (control.errors['required']) {
      switch (fieldName) {
        case 'organisation':
          return 'Organisation is required';
        case 'username':
          return 'Username is required';
        case 'password':
          return 'Password is required';
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
        case 'password':
          return 'Invalid password format';
        default:
          return 'Invalid format';
      }
    }
    return '';
  }
}
