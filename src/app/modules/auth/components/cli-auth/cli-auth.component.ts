import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/constants/storageType';
import { CLI_AUTH_PAGE_OPTIONS } from 'src/app/constants/global';

@Component({
  selector: 'app-cli-auth',
  templateUrl: './cli-auth.component.html',
  styleUrls: ['./cli-auth.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CliAuthComponent implements OnInit, AfterViewInit {
  private destroyRef = inject(DestroyRef);

  @ViewChild('codeInput') codeInputRef!: ElementRef<HTMLInputElement>;

  features = CLI_AUTH_PAGE_OPTIONS;

  pageState = signal<'prompt' | 'authorizing' | 'success' | 'denied' | 'not-logged-in' | 'error'>('prompt');
  message = signal('');
  userName = '';
  userRole = '';
  userOrg = '';
  loading = signal(false);

  code = '';
  codeError = '';

  constructor(private loginService: LoginService) {}

  trackByIndex(index: number): number {
    return index;
  }

  ngOnInit(): void {
    if (!this.loginService.isLoggedIn()) {
      this.pageState.set('not-logged-in');
      this.message.set('You need to be logged in to DBExec to authorize CLI access.');
      return;
    }

    try {
      const token = StorageService.get(StorageType.ACCESS_TOKEN);
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.userName = payload.name || payload.username;
        this.userRole = StorageService.get(StorageType.ROLE) || payload.role;
        this.userOrg =
          StorageService.get(StorageType.ORGANISATION) || payload.organisation;
      }
    } catch {
      this.userRole = StorageService.get(StorageType.ROLE) || '';
      this.userOrg = StorageService.get(StorageType.ORGANISATION) || '';
    }

    this.pageState.set('prompt');
  }

  ngAfterViewInit(): void {
    if (this.pageState === 'prompt' && this.codeInputRef) {
      setTimeout(() => this.codeInputRef.nativeElement.focus());
    }
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.code = input.value
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '')
      .slice(0, 8);
    input.value = this.code;
    this.codeError = '';
  }

  authorize(): void {
    if (this.loading()) return;

    const trimmed = this.code.trim();
    if (trimmed.length !== 8) {
      this.codeError = 'Please enter the 8-character code from your terminal.';
      return;
    }

    this.loading.set(true);
    this.codeError = '';
    this.pageState.set('authorizing');

    this.loginService
      .cliAuthorize(trimmed, 'authorize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: any) => {
          if (response.status) {
            this.pageState.set('success');
            const d = response.data;
            this.message.set(d
              ? `Signed in as ${d.name} (${d.role}) in ${d.organisation}`
              : 'CLI access authorized successfully.');
          } else {
            this.pageState.set('error');
            this.message.set(response.message || 'Authorization failed.');
          }
          this.loading.set(false);
        },
        error: (err: any) => {
          this.pageState.set('error');
          this.message.set(
            err?.error?.message ||
            'Authorization failed. The code may be invalid or expired.',
          );
          this.loading.set(false);
        },
      });
  }

  deny(): void {
    if (this.loading()) return;

    const trimmed = this.code.trim();
    if (trimmed.length !== 8) {
      this.codeError = 'Please enter the 8-character code from your terminal.';
      return;
    }

    this.loading.set(true);
    this.codeError = '';

    this.loginService
      .cliAuthorize(trimmed, 'deny')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pageState.set('denied');
          this.message.set('CLI access has been denied. You can close this tab.');
          this.loading.set(false);
        },
        error: () => {
          this.pageState.set('denied');
          this.message.set('CLI access has been denied. You can close this tab.');
          this.loading.set(false);
        },
      });
  }
}
