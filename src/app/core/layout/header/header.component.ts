import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  LocaleService,
  SUPPORTED_LOCALES,
} from 'src/app/core/services/locale.service';
import { LoginService } from 'src/app/core/services/login.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { AnnouncementService } from 'src/app/modules/app-settings/services/announcement.service';
import { GlobalSearchService } from '../../../shared/services/global-search.service';

interface Announcement {
  id: string;
  name: string;
  description: string;
  bgColor: string;
  textColor: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  organisationName: string = '';
  userInitials: string = '';
  userName: string = '';
  userRole: string = '';
  showProfileMenu: boolean = false;
  isAnimating = false;
  isFullscreen = false;
  locales = [...SUPPORTED_LOCALES];
  currentLocale = 'en';
  changingLocale = false;
  @ViewChild('notificationMenu') notificationMenu!: ElementRef;

  // Announcements (multiple, queued)
  announcements: Announcement[] = [];
  currentAnnouncementIndex = 0;
  typedMessage: string = '';
  isTyping: boolean = false;
  showAnnouncementOverlay: boolean = false;
  doNotShowAgain: boolean = false;
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ROTATE_INTERVAL_MS = 8000;

  showNotificationMenu = false;

  constructor(
    private router: Router,
    public globalService: GlobalService,
    private renderer: Renderer2,
    private store: Store,
    private globalSearchService: GlobalSearchService,
    private loginService: LoginService,
    private announcementService: AnnouncementService,
    private localeService: LocaleService,
    private themeService: ThemeService,
    public notificationService: NotificationService,
  ) {
    this.destroyRef.onDestroy(() => {
      if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
      this.clearRotation();
    });
  }

  ngOnInit() {
    this.organisationName =
      this.globalService.getTokenDetails('organisationName');

    const userFullName = this.globalService.getTokenDetails('name');
    this.userName = userFullName;
    this.userInitials = this.globalService.chipNameProvider(userFullName);
    this.userRole = this.globalService.getTokenDetails('role');

    this.localeService.initFromToken();
    this.currentLocale = this.localeService.currentLocale;

    if (this.userRole !== ROLES.SYSTEM_ADMIN) {
      // Notifications are per-org; SYSTEM-ADMIN has no org context
      // so the BE would 401 on every poll. Skip the poller entirely.
      // Service is idempotent so re-mount is safe.
      this.notificationService.start();

      // Announcements are now delivered in the login response and
      // stashed in storage. No polling, no route-change refetch —
      // dismissals update storage in-place and admin-side mutations
      // take effect on the user's next login.
      this.loadAnnouncementsFromStorage();
    }
  }

  private loadAnnouncementsFromStorage() {
    const raw = StorageService.get(StorageType.ANNOUNCEMENTS);
    if (!raw) return;
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    this.mergeAnnouncements(
      parsed.map((a: any) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        bgColor: a.bgColor || '#0d47a1',
        textColor: a.textColor || '#ffffff',
      })),
    );
    this.cdr.markForCheck();
  }

  /**
   * Merge incoming list with current queue.
   * - Preserves index on the same announcement when possible
   * - Drops vanished announcements (expired/inactive/group removed)
   * - Adds newly visible ones to the end
   * - Tears everything down when list becomes empty
   */
  private mergeAnnouncements(incoming: Announcement[]): void {
    const incomingIds = new Set(incoming.map(a => a.id));
    const currentId = this.currentAnnouncement?.id;

    if (incoming.length === 0) {
      this.announcements = [];
      this.currentAnnouncementIndex = 0;
      this.typedMessage = '';
      this.isTyping = false;
      this.showAnnouncementOverlay = false;
      if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
      this.clearRotation();
      return;
    }

    const existedBefore = this.announcements.length > 0;
    this.announcements = incoming;

    // Re-anchor index on the same announcement if still present
    if (currentId && incomingIds.has(currentId)) {
      this.currentAnnouncementIndex = incoming.findIndex(
        a => a.id === currentId,
      );
    } else {
      this.currentAnnouncementIndex = 0;
      // Only restart typewriter when the visible message actually changed
      this.startTypewriter();
    }

    // Start typewriter on first-ever fetch
    if (!existedBefore) {
      this.startTypewriter();
    }

    this.scheduleRotation();
  }

  get currentAnnouncement(): Announcement | null {
    return this.announcements[this.currentAnnouncementIndex] || null;
  }

  private scheduleRotation() {
    this.clearRotation();
    if (this.announcements.length <= 1) return;
    this.rotateTimer = setInterval(() => {
      if (this.showAnnouncementOverlay) return;
      this.currentAnnouncementIndex =
        (this.currentAnnouncementIndex + 1) % this.announcements.length;
      this.startTypewriter();
      this.cdr.markForCheck();
    }, this.ROTATE_INTERVAL_MS);
  }

  private clearRotation() {
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
  }

  logout() {
    this.loginService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.clearSessionAndNavigate(),
        error: () => this.clearSessionAndNavigate(),
      });
  }

  private clearSessionAndNavigate() {
    this.store.dispatch(AddAnalysesActions.clearAllDatasets());
    StorageService.clear();
    // Drop the injected org theme so the login page paints with the
    // default DBExec palette. Without this the previous org's brand
    // colours bleed onto the unauthenticated auth screens until the
    // tab is hard-reloaded.
    this.themeService.clear();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event) {
    const clickedElement = event.target as HTMLElement;

    const userProfile = document.querySelector('.user-profile');
    if (!userProfile?.contains(clickedElement)) {
      this.showProfileMenu = false;
    }

    if (
      !clickedElement.closest('.notification-btn') &&
      !clickedElement.closest('.notification-menu')
    ) {
      this.showNotificationMenu = false;
    }
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
  }

  viewProfile() {
    this.showProfileMenu = false;
    this.router.navigate(['/app/profile']);
  }

  /** True when the dropdown has at least one row to render. Bound
   *  in the template to flip between the list and the empty state. */
  get hasNotifications(): boolean {
    return this.notificationService.items().length > 0;
  }

  /** Notifications are a per-org concept; the platform System
   *  Admin has no org binding so the bell is hidden entirely for
   *  them. Mirrors the start() gate in ngOnInit. */
  get showNotificationBell(): boolean {
    return this.userRole !== ROLES.SYSTEM_ADMIN;
  }

  /** Bell click: open (or close) the dropdown. On open we fetch
   *  the last-30-days feed AND mark every unread row read in a
   *  single round-trip via the service. The unread badge clears
   *  optimistically so the user sees the dot disappear instantly. */
  toggleNotificationMenu(event: Event) {
    event.stopPropagation();
    const wasOpen = this.showNotificationMenu;
    this.showNotificationMenu = !wasOpen;
    if (!wasOpen) {
      // fire-and-forget — service handles its own errors.
      this.notificationService.openBell();
    }
  }

  /** Optional "Mark all read" link in the dropdown header. After
   *  the bell-open auto-read this is mostly cosmetic, but it's
   *  useful when the user opens the dropdown without unread rows
   *  and a new one arrives via the next 60s poll while it's open. */
  markAllAsRead() {
    this.notificationService.markAllRead();
  }

  toggleFullscreen() {
    const icon = document.querySelector('.fullscreen-btn .pi');
    if (icon) {
      icon.classList.add('animate');
      setTimeout(() => {
        icon.classList.remove('animate');
      }, 700);
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      this.isFullscreen = true;
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        this.isFullscreen = false;
      }
    }
  }

  openSearchModal() {
    this.globalSearchService.openSearch();
  }

  @HostListener('document:fullscreenchange', ['$event'])
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
    this.cdr.markForCheck();
  }

  private startTypewriter() {
    const current = this.currentAnnouncement;
    if (!current) return;

    if (this.typewriterTimer) clearTimeout(this.typewriterTimer);

    this.typedMessage = '';
    this.isTyping = true;
    let index = 0;
    const message = current.name;

    const typeNextChar = () => {
      if (index < message.length) {
        this.typedMessage += message.charAt(index);
        index++;
        this.typewriterTimer = setTimeout(typeNextChar, 15);
      } else {
        this.isTyping = false;
      }
      this.cdr.markForCheck();
    };

    this.typewriterTimer = setTimeout(typeNextChar, 300);
  }

  openAnnouncementPopup() {
    if (!this.currentAnnouncement) return;
    this.showAnnouncementOverlay = true;
  }

  closeAnnouncementPopup() {
    this.showAnnouncementOverlay = false;
    if (this.doNotShowAgain) {
      this.dismissCurrentAnnouncement();
      this.doNotShowAgain = false;
    }
  }

  dismissCurrentAnnouncement() {
    const current = this.currentAnnouncement;
    if (!current) return;

    // Snapshot for rollback if BE rejects
    const snapshot = [...this.announcements];
    const snapshotIndex = this.currentAnnouncementIndex;

    this.announcements = this.announcements.filter(a => a.id !== current.id);
    if (this.announcements.length === 0) {
      this.currentAnnouncementIndex = 0;
      this.typedMessage = '';
      this.isTyping = false;
      this.showAnnouncementOverlay = false;
      if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
      this.clearRotation();
    } else {
      this.currentAnnouncementIndex =
        this.currentAnnouncementIndex % this.announcements.length;
      this.startTypewriter();
      this.scheduleRotation();
    }

    this.announcementService
      .dismiss(current.id)
      .then(res => {
        if (!res?.status) {
          // Roll back so user isn't silently misled
          this.announcements = snapshot;
          this.currentAnnouncementIndex = snapshotIndex;
          this.startTypewriter();
          this.scheduleRotation();
        } else {
          // Persist the dismissal so a hard refresh doesn't bring it
          // back from the login-time snapshot in storage.
          this.persistAnnouncements();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.announcements = snapshot;
        this.currentAnnouncementIndex = snapshotIndex;
        this.startTypewriter();
        this.scheduleRotation();
        this.cdr.markForCheck();
      });
  }

  private persistAnnouncements() {
    StorageService.set(
      StorageType.ANNOUNCEMENTS,
      JSON.stringify(this.announcements),
    );
  }

  nextAnnouncement() {
    if (this.announcements.length <= 1) return;
    this.currentAnnouncementIndex =
      (this.currentAnnouncementIndex + 1) % this.announcements.length;
    this.startTypewriter();
    this.scheduleRotation();
  }

  async onLocaleChange(locale: string) {
    if (this.changingLocale) return;
    this.changingLocale = true;
    await this.localeService.changeLocale(locale);

    // If the user landed via a `?locale=` URL param, that was meant
    // to be a temporary preview. Now that they've made an explicit
    // dropdown choice — which we just persisted — the URL param is
    // misleading: a future page reload (or share) would reapply the
    // temp locale and clobber the new persisted choice. Strip it.
    const currentTree = this.router.parseUrl(this.router.url);
    if (currentTree.queryParams['locale'] !== undefined) {
      const { locale: _drop, ...keep } = currentTree.queryParams;
      // Navigate to the same path, replacing the URL in history so
      // the user can't "back" into the temp locale by accident.
      const path =
        currentTree.root.children['primary']?.segments
          .map(s => '/' + s.path)
          .join('') || '/';
      this.router.navigate([path], {
        queryParams: keep,
        replaceUrl: true,
      });
    }

    this.changingLocale = false;
    this.cdr.markForCheck();
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  prevAnnouncement() {
    if (this.announcements.length <= 1) return;
    this.currentAnnouncementIndex =
      (this.currentAnnouncementIndex - 1 + this.announcements.length) %
      this.announcements.length;
    this.startTypewriter();
    this.scheduleRotation();
  }
}
