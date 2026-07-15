import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ALERT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import type { FolderObjectType } from 'src/app/shared/validators/folders';
import { AlertService } from '../../services/alert.service';

/**
 * View Alert — read-only detail with two tabs: Details (source, condition
 * summary, schedule, delivery, state machine) and History (alert_event list via
 * app-alert-history). Header exposes the same lifecycle actions as the list row
 * (edit, toggle, test-now, snooze, delete) so the user can act without going
 * back to the listing.
 */
@Component({
  selector: 'app-view-alert',
  templateUrl: './view-alert.component.html',
  styleUrls: ['./view-alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewAlertComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  current = this.alertService.current;
  loading = this.alertService.loading;
  saving = this.alertService.saving;
  testing = this.alertService.testing;

  alertId = '';
  activeTab = 0;

  showDeleteConfirm = false;
  deleteJustification = '';

  showSnoozeDialog = false;
  snoozeMinutes = 60;
  snoozePresets = [
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '3h', value: 180 },
    { label: '12h', value: 720 },
    { label: '1d', value: 1440 },
  ];

  testResult: { breached?: boolean; observedValue?: any; error?: string } | null = null;

  /* ── favourite star (Track F) ───────────────────────────────────── */
  readonly objectType: FolderObjectType = 'alert';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertService: AlertService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private favouritesService: FavouritesService,
  ) {}

  ngOnInit(): void {
    this.alertId = this.route.snapshot.params['id'];
    this.alertService.resetCurrent();
    this.loadAlert();
    this.favouritesService
      .refresh(this.objectType)
      .then(() => this.cdr.markForCheck());
  }

  isFavourite(): boolean {
    return this.favouritesService.isFavourite(this.objectType, this.alertId);
  }

  toggleFavourite(): void {
    this.favouritesService.toggle(this.objectType, this.alertId).then((res: any) => {
      this.globalService.handleSuccessService(res, false);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.alertService.cancelReads();
  }

  private loadAlert(): void {
    this.alertService
      .loadOne(this.alertId)
      .then(() => this.cdr.markForCheck())
      .catch(() => this.cdr.markForCheck());
  }

  /* ── condition summary helpers (builder mode) ───────────────────── */

  get conditionGroups(): any[] {
    return this.current()?.conditionBuilder?.groups ?? [];
  }

  formatValue(right: any): string {
    if (!right) return '';
    const v = right.value;
    if (Array.isArray(v)) return v.map(x => this.stringify(x)).join(' – ');
    return this.stringify(v);
  }

  private stringify(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* ── nav ────────────────────────────────────────────────────────── */

  onEdit(): void {
    this.router.navigate([ALERT.edit(this.alertId)]);
  }

  goBack(): void {
    this.router.navigate([ALERT.LIST]);
  }

  /* ── toggle ─────────────────────────────────────────────────────── */

  onToggle(): void {
    const alert = this.current();
    if (!alert) return;
    this.alertService
      .toggle(alert.id, !alert.enabled)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.loadAlert();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /* ── test now ───────────────────────────────────────────────────── */

  onTestNow(): void {
    this.testResult = null;
    this.alertService
      .test(this.alertId)
      .then((res: any) => {
        if (res?.status) {
          this.testResult = {
            breached: res.data?.breached,
            observedValue: res.data?.observedValue,
          };
        } else {
          this.testResult = { error: res?.message };
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.testResult = { error: this.translate.instant('ALERTS.TEST_FAILED') };
        this.cdr.markForCheck();
      });
  }

  /* ── snooze ─────────────────────────────────────────────────────── */

  openSnooze(): void {
    this.snoozeMinutes = 60;
    this.showSnoozeDialog = true;
  }

  cancelSnooze(): void {
    this.showSnoozeDialog = false;
  }

  proceedSnooze(): void {
    const alert = this.current();
    if (!alert || !this.snoozeMinutes) return;
    this.alertService
      .snooze(alert.id, this.snoozeMinutes)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.loadAlert();
        this.cancelSnooze();
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cancelSnooze();
        this.cdr.markForCheck();
      });
  }

  /* ── delete ─────────────────────────────────────────────────────── */

  confirmDelete(): void {
    if (!this.current()) return;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    const alert = this.current();
    if (!alert || !this.deleteJustification.trim()) return;
    this.alertService
      .delete(alert.id, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.cancelDelete();
          this.router.navigate([ALERT.LIST]);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cancelDelete();
        this.cdr.markForCheck();
      });
  }

  trackByIndex(index: number): number {
    return index;
  }
}
