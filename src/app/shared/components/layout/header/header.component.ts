import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { GlobalService } from 'src/app/core/services/global.service';
import { Subscription } from 'rxjs';
import { Renderer2 } from '@angular/core';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { GlobalSearchService } from '../../../services/global-search.service';
import { LoginService } from 'src/app/core/services/login.service';
import { AnnouncementService } from 'src/app/modules/organisation/services/announcement.service';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  organisationName: string = '';
  userInitials: string = '';
  userName: string = '';
  userRole: string = '';
  showProfileMenu: boolean = false;
  isDarkMode = false; // Default to light mode
  isAnimating = false;
  isFullscreen = false;
  @ViewChild('notificationMenu') notificationMenu!: ElementRef;

  announcementTitle: string | null = null;
  announcementDescription: string | null = null;
  announcementBgColor: string = '#0d47a1';
  announcementTextColor: string = '#ffffff';
  typedMessage: string = '';
  isTyping: boolean = false;
  showAnnouncementOverlay: boolean = false;
  doNotShowAgain: boolean = false;
  private typewriterTimer: any;

  // Announcement dialog for ORG_ADMIN
  showAnnouncementDialog = false;
  isOrgAdmin = false;

  showNotificationMenu = false;
  unreadNotifications = 2; // Example count
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
      message: 'Database "Main DB" is now connected',
      time: new Date(Date.now() - 3600000), // 1 hour ago
      read: true,
      icon: 'pi-database',
    },
    {
      id: '3',
      message:
        'User "John Doe" has been added to the Development team with admin privileges',
      time: new Date(Date.now() - 7200000), // 2 hours ago
      read: false,
      icon: 'pi-user-plus',
    },
    {
      id: '4',
      message: 'Backup completed successfully for "Analytics DB"',
      time: new Date(Date.now() - 86400000), // 1 day ago
      read: true,
      icon: 'pi-check-circle',
    },
    {
      id: '5',
      message: 'Security update: 2 new access policies have been implemented',
      time: new Date(Date.now() - 172800000), // 2 days ago
      read: true,
      icon: 'pi-shield',
    },
    {
      id: '6',
      message:
        'System maintenance scheduled for tomorrow at 02:00 AM UTCSystem maintenance scheduled for tomorrow at 02:00 AM UTCSystem maintenance scheduled for tomorrow at 02:00 AM UTC',
      time: new Date(Date.now() - 259200000), // 3 days ago
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
  ) {
    // Always use light mode (theming disabled)
    this.isDarkMode = false;
    this.applyTheme();
  }

  ngOnInit() {
    // Get organization name
    this.organisationName =
      this.globalService.getTokenDetails('organisationName');

    // Get user details and create initials
    const userFullName = this.globalService.getTokenDetails('name');
    this.userName = userFullName;
    this.userInitials = this.globalService.chipNameProvider(userFullName);
    this.userRole = this.globalService.getTokenDetails('role');

    this.isOrgAdmin = this.userRole === ROLES.ORG_ADMIN;

    this.updateUnreadCount();

    // Fetch announcement only for custom org users (not super admin / default org)
    // ORG_ADMIN sees type=1 (announcements from super admin)
    // ORG_USER sees type=2 (announcements from org admin)
    if (this.userRole !== ROLES.SUPER_ADMIN) {
      const announcementType = this.isOrgAdmin ? 1 : 2;
      this.fetchAnnouncement(announcementType);
    }
  }

  private fetchAnnouncement(type: number) {
    const orgId = this.globalService.getTokenDetails('organisationId');
    if (!orgId) return;

    this.announcementService.getAnnouncement(orgId, type).then(res => {
      if (res?.status && res?.data) {
        this.announcementTitle = res.data.name;
        this.announcementDescription = res.data.description;
        this.announcementBgColor = res.data.bgColor || '#0d47a1';
        this.announcementTextColor = res.data.textColor || '#ffffff';
        this.startTypewriter();
      }
    });
  }

  onAnnouncementSave(data: any) {
    const orgId = this.globalService.getTokenDetails('organisationId');
    this.announcementService
      .addAnnouncement({ organisation: orgId, ...data })
      .then(res => {
        this.globalService.handleSuccessService(res);
      });
  }

  ngOnDestroy() {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
    }
  }

  logout() {
    this.loginService.logout().subscribe({
      next: () => this.clearSessionAndNavigate(),
      error: () => this.clearSessionAndNavigate(),
    });
  }

  private clearSessionAndNavigate() {
    this.store.dispatch(AddAnalysesActions.clearAllDatasets());
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event) {
    const clickedElement = event.target as HTMLElement;

    // Handle profile menu click outside
    const userProfile = document.querySelector('.user-profile');
    if (!userProfile?.contains(clickedElement)) {
      this.showProfileMenu = false;
    }

    // Handle notification menu click outside
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

  toggleTheme() {
    const icon = document.querySelector('.theme-toggle .pi');
    if (icon) {
      icon.classList.add('animate');
      setTimeout(() => {
        icon.classList.remove('animate');
      }, 700); // Match animation duration
    }
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme() {
    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }

  get hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  toggleNotificationMenu(event: Event) {
    event.stopPropagation();
    this.showNotificationMenu = !this.showNotificationMenu;
  }

  markAllAsRead() {
    // Update read status for all notifications
    this.notifications.forEach(notification => {
      notification.read = true;
    });

    // Update the unread count
    this.unreadNotifications = 0;
  }

  removeNotification(id: string) {
    //call delete notification API
    // this.notifications = this.notifications.filter(n => n.id !== id);
  }

  private updateUnreadCount() {
    this.unreadNotifications = this.notifications.filter(n => !n.read).length;
  }

  markAsRead(notification: any, event: Event) {
    // Prevent click event from bubbling up to parent elements
    event.stopPropagation();

    // Only process if notification is unread
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
      }, 700); // Match animation duration
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
  }

  private startTypewriter() {
    if (!this.announcementTitle) return;

    this.typedMessage = '';
    this.isTyping = true;
    let index = 0;
    const message = this.announcementTitle;

    const typeNextChar = () => {
      if (index < message.length) {
        this.typedMessage += message.charAt(index);
        index++;
        this.typewriterTimer = setTimeout(typeNextChar, 15);
      } else {
        this.isTyping = false;
      }
    };

    this.typewriterTimer = setTimeout(typeNextChar, 500);
  }

  closeAnnouncementPopup() {
    this.showAnnouncementOverlay = false;
    if (this.doNotShowAgain) {
      this.dismissAnnouncement();
    }
  }

  dismissAnnouncement() {
    const orgId = this.globalService.getTokenDetails('organisationId');
    this.announcementService.dismissAnnouncement(orgId);
    this.announcementTitle = null;
    this.announcementDescription = null;
    this.typedMessage = '';
    this.isTyping = false;
    this.showAnnouncementOverlay = false;
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
    }
  }
}
