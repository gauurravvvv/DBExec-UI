import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  loading = false;
  showPassword = false;
  features = [
    {
      icon: 'eye',
      title: 'Visual Database Explorer',
      description:
        'Navigate through your database structure with an intuitive visual interface',
    },
    {
      icon: 'chart-line',
      title: 'Performance Insights',
      description:
        'Get real-time performance metrics and query optimization suggestions',
    },
    {
      icon: 'key',
      title: 'Secure Access',
      description: 'Enterprise-grade security with role-based access control',
    },
    {
      icon: 'table',
      title: 'Smart Query Builder',
      description:
        'Build complex queries with our intelligent visual query builder',
    },
  ];

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      organization: ['', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false],
    });
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      // Implement your login logic here
    }
  }

  onForgotPassword(): void {
    // Implement forgot password logic
  }

  togglePassword(event: Event) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById('password') as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }
}
