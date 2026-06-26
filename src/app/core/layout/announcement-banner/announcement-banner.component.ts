import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { PermissionService } from 'src/app/core/services/permission.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { AnnouncementService } from 'src/app/modules/app-settings/services/announcement.service';

interface Announcement {
  id: string;
  name: string;
  description: string;
  bgColor: string;
  textColor: string;
}

@Component({
  selector: 'app-announcement-banner',
  templateUrl: './announcement-banner.component.html',
  styleUrls: ['./announcement-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnouncementBannerComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  announcements: Announcement[] = [];
  currentAnnouncementIndex = 0;
  typedMessage = '';
  isTyping = false;
  showAnnouncementOverlay = false;
  doNotShowAgain = false;

  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ROTATE_INTERVAL_MS = 8000;

  constructor(
    private announcementService: AnnouncementService,
    private permissionService: PermissionService,
  ) {
    this.destroyRef.onDestroy(() => {
      if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
      this.clearRotation();
    });
  }

  ngOnInit(): void {
    // Platform System Admin has no org context — no announcements to render.
    if (this.permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)) return;
    this.loadAnnouncementsFromStorage();
  }

  get currentAnnouncement(): Announcement | null {
    return this.announcements[this.currentAnnouncementIndex] || null;
  }

  openAnnouncementPopup(): void {
    if (!this.currentAnnouncement) return;
    this.showAnnouncementOverlay = true;
  }

  closeAnnouncementPopup(): void {
    this.showAnnouncementOverlay = false;
    if (this.doNotShowAgain) {
      this.dismissCurrentAnnouncement();
      this.doNotShowAgain = false;
    }
  }

  nextAnnouncement(): void {
    if (this.announcements.length <= 1) return;
    this.currentAnnouncementIndex =
      (this.currentAnnouncementIndex + 1) % this.announcements.length;
    this.startTypewriter();
    this.scheduleRotation();
  }

  prevAnnouncement(): void {
    if (this.announcements.length <= 1) return;
    this.currentAnnouncementIndex =
      (this.currentAnnouncementIndex - 1 + this.announcements.length) %
      this.announcements.length;
    this.startTypewriter();
    this.scheduleRotation();
  }

  private loadAnnouncementsFromStorage(): void {
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

    if (currentId && incomingIds.has(currentId)) {
      this.currentAnnouncementIndex = incoming.findIndex(
        a => a.id === currentId,
      );
    } else {
      this.currentAnnouncementIndex = 0;
      this.startTypewriter();
    }

    if (!existedBefore) {
      this.startTypewriter();
    }

    this.scheduleRotation();
  }

  private scheduleRotation(): void {
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

  private clearRotation(): void {
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
  }

  private startTypewriter(): void {
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

  private dismissCurrentAnnouncement(): void {
    const current = this.currentAnnouncement;
    if (!current) return;

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
          this.announcements = snapshot;
          this.currentAnnouncementIndex = snapshotIndex;
          this.startTypewriter();
          this.scheduleRotation();
        } else {
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

  private persistAnnouncements(): void {
    StorageService.set(
      StorageType.ANNOUNCEMENTS,
      JSON.stringify(this.announcements),
    );
  }
}
