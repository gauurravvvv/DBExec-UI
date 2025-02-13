import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LOGIN_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from '../../services/auth.service';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  showPassword = false;
  features = LOGIN_PAGE_OPTIONS;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService
  ) {
    this.loginForm = this.fb.group({
      organisation: ['', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false],
    });
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loginService.login(this.loginForm).then((res: any) => {
        if (this.globalService.handleSuccessService(res, true)) {
          const role = this.globalService.getTokenDetails('role');
          let dashboardRoute = '/app/dashboard';

          switch (role) {
            case ROLES.SUPER_ADMIN:
              dashboardRoute = '/app/dashboard/super-admin';
              break;
            case ROLES.ORG_ADMIN:
              dashboardRoute = '/app/dashboard/org-admin';
              break;
            case ROLES.ORG_USER:
              dashboardRoute = '/app/dashboard/org-user';
              break;
          }

          this.router.navigateByUrl(dashboardRoute, {
            replaceUrl: true,
          });
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
}
