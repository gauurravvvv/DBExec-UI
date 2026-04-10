import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/constants/storageType';
import { CLI_AUTH_PAGE_OPTIONS } from 'src/app/constants/global';

@Component({
  selector: 'app-cli-auth',
  templateUrl: './cli-auth.component.html',
  styleUrls: ['./cli-auth.component.scss'],
})
export class CliAuthComponent implements OnInit, AfterViewInit {
  @ViewChild('codeInput') codeInputRef!: ElementRef<HTMLInputElement>;

  features = CLI_AUTH_PAGE_OPTIONS;

  pageState: 'prompt' | 'authorizing' | 'success' | 'denied' | 'not-logged-in' | 'error' = 'prompt';
  message = '';
  userName = '';
  userRole = '';
  userOrg = '';
  actionInProgress = false;

  code = '';
  codeError = '';

  constructor(private loginService: LoginService) {}

  ngOnInit(): void {
    if (!this.loginService.isLoggedIn()) {
      this.pageState = 'not-logged-in';
      this.message = 'You need to be logged in to DBExec to authorize CLI access.';
      return;
    }

    try {
      const token = StorageService.get(StorageType.ACCESS_TOKEN);
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.userName = payload.name || payload.username;
        this.userRole = StorageService.get(StorageType.ROLE) || payload.role;
        this.userOrg = StorageService.get(StorageType.ORGANISATION) || payload.organisation;
      }
    } catch {
      this.userRole = StorageService.get(StorageType.ROLE) || '';
      this.userOrg = StorageService.get(StorageType.ORGANISATION) || '';
    }

    this.pageState = 'prompt';
  }

  ngAfterViewInit(): void {
    if (this.pageState === 'prompt' && this.codeInputRef) {
      setTimeout(() => this.codeInputRef.nativeElement.focus());
    }
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.code = input.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
    input.value = this.code;
    this.codeError = '';
  }

  authorize(): void {
    if (this.actionInProgress) return;

    const trimmed = this.code.trim();
    if (trimmed.length !== 8) {
      this.codeError = 'Please enter the 8-character code from your terminal.';
      return;
    }

    this.actionInProgress = true;
    this.codeError = '';
    this.pageState = 'authorizing';

    this.loginService.cliAuthorize(trimmed, 'authorize').subscribe({
      next: (response: any) => {
        if (response.status) {
          this.pageState = 'success';
          const d = response.data;
          this.message = d
            ? `Signed in as ${d.name} (${d.role}) in ${d.organisation}`
            : 'CLI access authorized successfully.';
        } else {
          this.pageState = 'error';
          this.message = response.message || 'Authorization failed.';
        }
        this.actionInProgress = false;
      },
      error: (err: any) => {
        this.pageState = 'error';
        this.message = err?.error?.message || 'Authorization failed. The code may be invalid or expired.';
        this.actionInProgress = false;
      },
    });
  }

  deny(): void {
    if (this.actionInProgress) return;

    const trimmed = this.code.trim();
    if (trimmed.length !== 8) {
      this.codeError = 'Please enter the 8-character code from your terminal.';
      return;
    }

    this.actionInProgress = true;
    this.codeError = '';

    this.loginService.cliAuthorize(trimmed, 'deny').subscribe({
      next: () => {
        this.pageState = 'denied';
        this.message = 'CLI access has been denied. You can close this tab.';
        this.actionInProgress = false;
      },
      error: () => {
        this.pageState = 'denied';
        this.message = 'CLI access has been denied. You can close this tab.';
        this.actionInProgress = false;
      },
    });
  }
}
