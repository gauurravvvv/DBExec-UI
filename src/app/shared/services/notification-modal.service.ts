import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Trigger channel for the notification modal — mirrors the pattern
 * GlobalSearchService uses for global search. The sidebar's bell
 * button calls `open()`; the modal component subscribes to `open$`
 * and shows itself.
 *
 * No payload — the modal reads its data from NotificationService
 * directly. This service exists only so the sidebar doesn't need a
 * reference to the modal component (decouples the two).
 */
@Injectable({ providedIn: 'root' })
export class NotificationModalService {
  private openSubject = new Subject<void>();
  readonly open$ = this.openSubject.asObservable();

  // Programmatic close channel. The panel normally closes itself (X /
  // outside click / notification click); this lets a non-owner — the
  // guided tour — close it when its notifications step ends.
  private closeSubject = new Subject<void>();
  readonly close$ = this.closeSubject.asObservable();

  open(): void {
    this.openSubject.next();
  }

  close(): void {
    this.closeSubject.next();
  }
}
