import { Component, OnInit } from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LOGIN_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from '../../services/auth.service';

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
          console.log('login success... Routing to dashboard');
          this.router.navigate(['/home/dashboard'], {
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
