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
import { NavigationEnd, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { auditTime, filter } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { AnnouncementService } from 'src/app/modules/app-settings/services/announcement.service';
import { LocaleService, SUPPORTED_LOCALES } from 'src/app/core/services/locale.service';
import { GlobalSearchService } from '../../../services/global-search.service';

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
  private readonly POLL_INTERVAL_MS = 60_000;

  showNotificationMenu = false;
  unreadNotifications = 2;
  notifications = [
    {
      id: '1',
      message: 'New environment "Production" has been created',
      time: new Date(),
      read: false,
      icon: 'pi-globe',
    },
    {
      id: '2',
      message: 'Datasource "Main DB" is now connected',
      time: new Date(Date.now() - 3600000),
      read: true,
      icon: 'pi-database',
    },
    {
      id: '3',
      message:
        'User "John Doe" has been added to the Development team with admin privileges',
      time: new Date(Date.now() - 7200000),
      read: false,
      icon: 'pi-user-plus',
    },
    {
      id: '4',
      message: 'Backup completed successfully for "Analytics DB"',
      time: new Date(Date.now() - 86400000),
      read: true,
      icon: 'pi-check-circle',
    },
    {
      id: '5',
      message: 'Security update: 2 new access policies have been implemented',
      time: new Date(Date.now() - 172800000),
      read: true,
      icon: 'pi-shield',
    },
    {
      id: '6',
      message:
        'System maintenance scheduled for tomorrow at 02:00 AM UTCSystem maintenance scheduled for tomorrow at 02:00 AM UTCSystem maintenance scheduled for tomorrow at 02:00 AM UTC',
      time: new Date(Date.now() - 259200000),
      read: false,
      icon: 'pi-clock',
    },
  ];

  constructor(
    private router: Router,
    public globalService: GlobalService,
    private renderer: Renderer2,
    private store: Store,
    private globalSearchService: GlobalSearchService,
    private loginService: LoginService,
    private announcementService: AnnouncementService,
    private localeService: LocaleService,
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

    this.updateUnreadCount();

    if (this.userRole !== ROLES.SYSTEM_ADMIN) {
      this.fetchAnnouncements();
      // Refetch on route change (debounced) — picks up new/expired/dismissed banners
      this.router.events
        .pipe(
          filter(e => e instanceof NavigationEnd),
          auditTime(500),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.fetchAnnouncements());
      // Background poll as a safety net for time-window expiry / new banners
      const pollTimer = setInterval(
        () => this.fetchAnnouncements(),
        this.POLL_INTERVAL_MS,
      );
      this.destroyRef.onDestroy(() => clearInterval(pollTimer));
    }
  }

  private fetchAnnouncements() {
    this.announcementService
      .getActive()
      .then(res => {
        if (!res?.status || !Array.isArray(res?.data)) return;
        this.mergeAnnouncements(
          res.data.map((a: any) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            bgColor: a.bgColor || '#0d47a1',
            textColor: a.textColor || '#ffffff',
          })),
        );
        this.cdr.markForCheck();
      })
      .catch(() => {});
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

  get hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  toggleNotificationMenu(event: Event) {
    event.stopPropagation();
    this.showNotificationMenu = !this.showNotificationMenu;
  }

  markAllAsRead() {
    this.notifications.forEach(notification => {
      notification.read = true;
    });
    this.unreadNotifications = 0;
  }

  removeNotification(id: string) {
    // call delete notification API
  }

  private updateUnreadCount() {
    this.unreadNotifications = this.notifications.filter(n => !n.read).length;
  }

  markAsRead(notification: any, event: Event) {
    event.stopPropagation();
    if (!notification.read) {
      notification.read = true;
      this.updateUnreadCount();
    }
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
