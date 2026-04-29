import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { StorageType } from 'src/app/constants/storageType';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';

@Component({
  selector: 'app-cli-auth',
  templateUrl: './cli-auth.component.html',
  styleUrls: ['./cli-auth.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CliAuthComponent implements OnInit, AfterViewInit {
  private destroyRef = inject(DestroyRef);

  @ViewChild('codeInput') codeInputRef!: ElementRef<HTMLInputElement>;

  features = [
    { icon: 'desktop', titleKey: 'AUTH_FEATURES.CLI_1_TITLE', descKey: 'AUTH_FEATURES.CLI_1_DESC' },
    { icon: 'shield', titleKey: 'AUTH_FEATURES.CLI_2_TITLE', descKey: 'AUTH_FEATURES.CLI_2_DESC' },
    { icon: 'bolt', titleKey: 'AUTH_FEATURES.CLI_3_TITLE', descKey: 'AUTH_FEATURES.CLI_3_DESC' },
    { icon: 'lock', titleKey: 'AUTH_FEATURES.CLI_4_TITLE', descKey: 'AUTH_FEATURES.CLI_4_DESC' },
  ];

  pageState = signal<
    'prompt' | 'authorizing' | 'success' | 'denied' | 'not-logged-in' | 'error'
  >('prompt');
  message = signal('');
  userName = '';
  userRole = '';
  userOrg = '';
  loading = signal(false);

  code = '';
  codeError = '';

  constructor(
    private loginService: LoginService,
    private translate: TranslateService,
  ) {}

  trackByIndex(index: number): number {
    return index;
  }

  ngOnInit(): void {
    if (!this.loginService.isLoggedIn()) {
      this.pageState.set('not-logged-in');
      this.message.set(
        this.translate.instant('AUTH.NEED_LOGIN_FOR_CLI'),
      );
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
    if (this.pageState() === 'prompt' && this.codeInputRef) {
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
      this.codeError = this.translate.instant('AUTH.ENTER_8_CHAR_CODE');
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
            this.message.set(
              d
                ? this.translate.instant('AUTH.CLI_SIGNED_IN_AS', { name: d.name, role: d.role, org: d.organisation })
                : this.translate.instant('AUTH.CLI_AUTHORIZED_MSG'),
            );
          } else {
            this.pageState.set('error');
            this.message.set(response.message || this.translate.instant('AUTH.CLI_AUTH_FAILED'));
          }
          this.loading.set(false);
        },
        error: (err: any) => {
          this.pageState.set('error');
          this.message.set(
            err?.error?.message ||
              this.translate.instant('AUTH.CLI_AUTH_FAILED_EXPIRED'),
          );
          this.loading.set(false);
        },
      });
  }

  deny(): void {
    if (this.loading()) return;

    const trimmed = this.code.trim();
    if (trimmed.length !== 8) {
      this.codeError = this.translate.instant('AUTH.ENTER_8_CHAR_CODE');
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
          this.message.set(
            this.translate.instant('AUTH.CLI_DENIED_MSG'),
          );
          this.loading.set(false);
        },
        error: () => {
          this.pageState.set('denied');
          this.message.set(
            this.translate.instant('AUTH.CLI_DENIED_MSG'),
          );
          this.loading.set(false);
        },
      });
  }
}
