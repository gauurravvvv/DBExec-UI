import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { EmailChipsInputComponent } from 'src/app/shared/components/email-chips-input/email-chips-input.component';
import {
  CRON_PRESETS,
  TIMEZONE_OPTIONS,
  loadRecipientUsersPage,
} from 'src/app/modules/alerts/components/shared/alert-form.helpers';
import { GlobalService } from 'src/app/core/services/global.service';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DashboardSubscriptionService,
  DashboardDeliveryFormat,
} from '../../services/dashboard-subscription.service';

/**
 * ScheduleDeliveryDialog — the "Schedule delivery" surface on
 * view-dashboard (Dashboard & Analysis v2, Track E4). Creates + manages
 * per-dashboard `dashboard_subscription` rows: a cron schedule, a
 * timezone, a delivery format (PNG/PDF), and recipients (org users +
 * free-form emails).
 *
 * A dedicated cron-builder component doesn't exist in the app, so — per
 * the plan — this uses a simple frequency picker built from the alerts
 * module's shared CRON_PRESETS + TIMEZONE_OPTIONS, and reuses the same
 * recipients pattern (custom-multiselect over org users + an email chips
 * field) so the two scheduling surfaces feel identical.
 */
@Component({
  selector: 'app-schedule-delivery-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    AppPrimeNGModule,
    SharedModule,
    EmailChipsInputComponent,
  ],
  templateUrl: './schedule-delivery-dialog.component.html',
  styleUrls: ['./schedule-delivery-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleDeliveryDialogComponent implements OnChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private subscriptionService = inject(DashboardSubscriptionService);
  private globalService = inject(GlobalService);
  private userService = inject(UserService);
  private translate = inject(TranslateService);
  private referenceData = inject(ReferenceDataService);

  @Input() visible = false;
  @Input() dashboardId = '';
  @Input() dashboardName = '';
  @Output() closed = new EventEmitter<void>();

  // Cron presets are DB-driven (family: cron_preset). Seeded from the shared
  // helper constant (translated) so the picker renders immediately, then
  // overwritten with DB rows once the reference-data service resolves.
  cronPresets: { label: string; value: string }[] = CRON_PRESETS.map(o => ({
    value: o.value,
    label: this.translate.instant(o.label),
  }));
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly formatOptions: { label: string; value: DashboardDeliveryFormat }[] = [
    { label: this.translate.instant('DASHBOARD.SCHEDULE.FORMAT_PDF'), value: 'pdf' },
    { label: this.translate.instant('DASHBOARD.SCHEDULE.FORMAT_PNG'), value: 'png' },
  ];

  form: FormGroup = this.fb.group({
    cronExpression: ['0 9 * * 1', Validators.required],
    timezone: ['UTC', Validators.required],
    format: ['pdf' as DashboardDeliveryFormat, Validators.required],
    recipientUserIds: [[] as string[]],
    recipientEmails: [[] as string[]],
  });

  subscriptions: any[] = [];
  loading = false;
  saving = false;

  /** Server-mode user fetcher for the recipients multiselect. */
  loadUsersPage = loadRecipientUsersPage(
    () => ({ globalService: this.globalService }),
    (params: any) => this.userService.listUser(params),
  );

  constructor() {
    // DB-driven cron presets (family: cron_preset). Falls back to the
    // helper constant seeded above when the family is absent / fetch failed.
    this.referenceData
      .getFamily('cron_preset')
      .pipe(takeUntilDestroyed())
      .subscribe(rows => {
        if (rows.length) {
          this.cronPresets = rows.map(r => ({
            label: r.label,
            value: r.meta?.cron ?? r.code,
          }));
          this.cdr.markForCheck();
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.dashboardId) {
      void this.loadSubscriptions();
    }
  }

  private async loadSubscriptions(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();
    try {
      this.subscriptions = await this.subscriptionService.list(this.dashboardId);
    } catch {
      this.subscriptions = [];
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  /** At least one recipient (user or email) is required to save. */
  get hasRecipients(): boolean {
    const ids = this.form.value.recipientUserIds ?? [];
    const emails = this.form.value.recipientEmails ?? [];
    return ids.length > 0 || emails.length > 0;
  }

  get canSave(): boolean {
    return this.form.valid && this.hasRecipients && !this.saving;
  }

  async save(): Promise<void> {
    if (!this.canSave) return;
    this.saving = true;
    this.cdr.markForCheck();
    try {
      const v = this.form.value;
      const res: any = await this.subscriptionService.create({
        dashboardId: this.dashboardId,
        cronExpression: v.cronExpression,
        timezone: v.timezone,
        format: v.format,
        recipients: {
          userIds: v.recipientUserIds ?? [],
          emails: v.recipientEmails ?? [],
        },
        enabled: true,
      });
      if (this.globalService.handleSuccessService(res, true)) {
        this.form.patchValue({ recipientUserIds: [], recipientEmails: [] });
        await this.loadSubscriptions();
      }
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async toggle(sub: any): Promise<void> {
    try {
      const res: any = await this.subscriptionService.toggle(sub.id);
      if (this.globalService.handleSuccessService(res, false)) {
        await this.loadSubscriptions();
      }
    } catch {
      /* toast handled by interceptor */
    }
  }

  async remove(sub: any): Promise<void> {
    try {
      const res: any = await this.subscriptionService.delete(sub.id);
      if (this.globalService.handleSuccessService(res, true)) {
        await this.loadSubscriptions();
      }
    } catch {
      /* toast handled by interceptor */
    }
  }

  /** Human (already-translated) label for a stored cron; falls back to raw. */
  cronLabel(cron: string): string {
    const preset = this.cronPresets.find(p => p.value === cron);
    return preset ? preset.label : cron;
  }

  trackSub(_i: number, s: any): string {
    return s.id;
  }

  close(): void {
    this.closed.emit();
  }
}
