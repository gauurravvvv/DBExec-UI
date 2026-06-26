/**
 * view-datasource — "what's built on this datasource within DBExec"
 *
 * Hero (engine icon + name + health pill + actions) → Connection
 * details → Usage panel (counts + ngx-echarts donut) → Activity
 * timeline. The previous schema-explorer version was a database
 * inspector; this version answers a higher-level question: how is
 * this datasource being used inside DBExec?
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { EChartsOption } from 'echarts';
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from '../../services/datasource.service';

type HealthState = 'unknown' | 'ok' | 'failed' | 'testing';

interface UsageCounts {
  datasets: number;
  analyses: number;
  dashboards: number;
}

interface ActivityEvent {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  actorUsername: string;
  at: string;
  metadata: any;
  justification: string | null;
}

@Component({
  selector: 'app-view-datasource',
  templateUrl: './view-datasource.component.html',
  styleUrls: ['./view-datasource.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDatasourceComponent implements OnInit, OnDestroy {
  dbId!: string;
  dbData: any = null;

  // ── Health pill ──────────────────────────────────────────────────
  readonly health = signal<HealthState>('unknown');
  readonly lastTestedAt = signal<string | null>(null);
  readonly testInFlight = signal(false);

  // ── Usage panel ──────────────────────────────────────────────────
  readonly usage = signal<UsageCounts | null>(null);
  readonly usageLoading = signal(false);
  readonly hasAnyUsage = computed(() => {
    const u = this.usage();
    if (!u) return false;
    return u.datasets > 0 || u.analyses > 0 || u.dashboards > 0;
  });
  readonly usageChartOption = computed<EChartsOption | null>(() => {
    const u = this.usage();
    if (!u || !this.hasAnyUsage()) return null;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, left: 'center', icon: 'circle' },
      series: [
        {
          name: 'Usage',
          type: 'pie',
          radius: ['55%', '80%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: 'var(--card-background)',
            borderWidth: 2,
          },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
          data: [
            {
              value: u.datasets,
              name: this.translate.instant('DATASOURCE.USAGE_DATASETS'),
              itemStyle: { color: '#3b82f6' },
            },
            {
              value: u.analyses,
              name: this.translate.instant('DATASOURCE.USAGE_ANALYSES'),
              itemStyle: { color: '#8b5cf6' },
            },
            {
              value: u.dashboards,
              name: this.translate.instant('DATASOURCE.USAGE_DASHBOARDS'),
              itemStyle: { color: '#10b981' },
            },
          ],
        },
      ],
    };
  });

  // ── Activity panel ───────────────────────────────────────────────
  readonly activity = signal<ActivityEvent[]>([]);
  readonly activityLoading = signal(false);

  // ── Delete modal ─────────────────────────────────────────────────
  showDeleteConfirm = false;
  deleteJustification = '';

  loading = this.datasourceService.loading;
  isDeleting = (id: string): boolean => this.datasourceService.isDeleting(id);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasourceService: DatasourceService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.dbId = this.route.snapshot.params['id'];
    if (this.dbId) {
      this.loadDatasourceData();
      this.loadUsage();
      this.loadActivity();
    }
  }

  ngOnDestroy(): void {
    this.datasourceService.cancelReads();
  }

  // ─────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────

  async loadDatasourceData(): Promise<void> {
    await this.datasourceService.loadOne(this.dbId);
    this.dbData = this.datasourceService.current();
    if (this.dbData) {
      const status = this.dbData.lastTestStatus as 'ok' | 'failed' | null;
      this.health.set(status ?? 'unknown');
      this.lastTestedAt.set(this.dbData.lastTestedAt ?? null);
    }
    this.cdr.markForCheck();
  }

  async loadUsage(): Promise<void> {
    this.usageLoading.set(true);
    try {
      const res = await this.datasourceService.getUsage(this.dbId);
      if (res?.status && res.data) {
        this.usage.set({
          datasets: res.data.datasets ?? 0,
          analyses: res.data.analyses ?? 0,
          dashboards: res.data.dashboards ?? 0,
        });
      }
    } finally {
      this.usageLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  async loadActivity(): Promise<void> {
    this.activityLoading.set(true);
    try {
      const res = await this.datasourceService.getActivity(this.dbId);
      if (res?.status && res.data?.events) {
        this.activity.set(res.data.events as ActivityEvent[]);
      }
    } finally {
      this.activityLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Test connection (the health-pill driver)
  // ─────────────────────────────────────────────────────────────────

  async onTestConnection(): Promise<void> {
    if (this.testInFlight()) return;
    this.testInFlight.set(true);
    this.health.set('testing');
    try {
      const res = await this.datasourceService.testConnectionForExisting(this.dbId);
      if (res?.status && res.data) {
        const next = res.data.isConnected ? 'ok' : 'failed';
        this.health.set(next);
        this.lastTestedAt.set(res.data.lastTestedAt ?? new Date().toISOString());
      } else {
        this.health.set('failed');
        this.lastTestedAt.set(new Date().toISOString());
      }
    } catch {
      this.health.set('failed');
      this.lastTestedAt.set(new Date().toISOString());
    } finally {
      this.testInFlight.set(false);
      this.cdr.markForCheck();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Engine-aware UI helpers
  // ─────────────────────────────────────────────────────────────────

  /** True for Snowflake; toggles the "account/warehouse/role" row. */
  get isSnowflake(): boolean {
    return this.dbData?.config?.dbType === 'snowflake';
  }

  /** PrimeIcon for the engine — small visual cue in the hero. */
  engineIcon(): string {
    const t = this.dbData?.config?.dbType;
    if (!t) return 'pi-database';
    const map: Record<string, string> = {
      postgres: 'pi-server',
      mysql: 'pi-server',
      mariadb: 'pi-server',
      mssql: 'pi-server',
      oracle: 'pi-server',
      snowflake: 'pi-cloud',
    };
    return map[t] ?? 'pi-database';
  }

  // ─────────────────────────────────────────────────────────────────
  // Activity rendering helpers
  // ─────────────────────────────────────────────────────────────────

  /** Map BE audit action codes → user-facing translation keys. */
  activityLabelKey(action: string): string {
    const map: Record<string, string> = {
      CREATE: 'DATASOURCE.ACTIVITY_CREATED',
      UPDATE: 'DATASOURCE.ACTIVITY_UPDATED',
      DELETE: 'DATASOURCE.ACTIVITY_DELETED',
    };
    return map[action] ?? 'DATASOURCE.ACTIVITY_OTHER';
  }

  /** PrimeIcon glyph per audit action. */
  activityIcon(action: string): string {
    const map: Record<string, string> = {
      CREATE: 'pi-plus-circle',
      UPDATE: 'pi-pencil',
      DELETE: 'pi-trash',
    };
    return map[action] ?? 'pi-circle';
  }

  // ─────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────

  onEdit(): void {
    this.router.navigate([DATASOURCE.LIST, this.dbId, 'edit']);
  }

  goBack(): void {
    this.router.navigate([DATASOURCE.LIST]);
  }

  // ─────────────────────────────────────────────────────────────────
  // Delete (unchanged from previous version)
  // ─────────────────────────────────────────────────────────────────

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  async proceedDelete(): Promise<void> {
    if (!this.deleteJustification.trim() || this.isDeleting(this.dbId)) return;
    try {
      const res = await this.datasourceService.delete(
        this.dbId,
        this.deleteJustification.trim(),
      );
      if (this.globalService.handleSuccessService(res)) {
        this.showDeleteConfirm = false;
        this.deleteJustification = '';
        this.router.navigate([DATASOURCE.LIST]);
      }
    } catch {
      // service displays toast on failure
    }
  }

  trackByEventId(_index: number, event: ActivityEvent): string {
    return event.id;
  }
}
