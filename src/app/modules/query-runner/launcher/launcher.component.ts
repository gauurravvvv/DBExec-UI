import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  QueryConnection,
  QueryRunnerService,
} from '../services/query-runner.service';

/**
 * LauncherComponent — the Query Runner entry point. Pick a datasource,
 * then one of your connections on it, then Open. Open verifies the
 * connection's credentials and, on success, opens the standalone
 * executor in a new browser tab titled with the datasource name.
 */
@Component({
  selector: 'app-launcher',
  templateUrl: './launcher.component.html',
  styleUrls: ['./launcher.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LauncherComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  selectedDatasourceId: string | null = null;
  selectedConnectionId: string | null = null;

  connectionOptions: { label: string; value: string }[] = [];
  private connectionsById = new Map<string, QueryConnection>();
  connectionsLoading = false;
  verifying = false;

  hasNoConnections = false;

  constructor(
    private service: QueryRunnerService,
    private datasourceService: DatasourceService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Preload the user's connections once so we can both drive the
    // connection dropdown and detect the empty state.
    this.loadConnections();
  }

  /** Server-mode fetcher for the datasource dropdown. */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (res?.status) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  private allConnections: QueryConnection[] = [];

  private loadConnections(): void {
    this.connectionsLoading = true;
    this.cdr.markForCheck();
    this.service
      .listConnections()
      .then(res => {
        this.allConnections = res?.status ? (res.data?.connections ?? []) : [];
        this.hasNoConnections = this.allConnections.length === 0;
        this.refreshConnectionOptions();
      })
      .catch(() => {
        this.allConnections = [];
        this.hasNoConnections = true;
      })
      .finally(() => {
        this.connectionsLoading = false;
        this.cdr.markForCheck();
      });
  }

  /** True when the chosen datasource has connections, but all disabled. */
  allDisabledForDs = false;

  /** When the datasource changes, filter connections to it + preselect default. */
  onDatasourceChange(dsId: string | null): void {
    this.selectedDatasourceId = dsId;
    this.selectedConnectionId = null;
    this.refreshConnectionOptions();
    this.cdr.markForCheck();
  }

  private refreshConnectionOptions(): void {
    this.connectionsById.clear();
    this.allDisabledForDs = false;
    if (!this.selectedDatasourceId) {
      this.connectionOptions = [];
      return;
    }
    const forDs = this.allConnections.filter(
      c => c.datasourceId === this.selectedDatasourceId,
    );
    // Only ENABLED connections are selectable in the launcher.
    const usable = forDs.filter(c => c.enabled !== false);
    this.allDisabledForDs = forDs.length > 0 && usable.length === 0;

    for (const c of usable) this.connectionsById.set(c.id, c);
    this.connectionOptions = usable.map(c => ({
      label: c.isDefault
        ? `★ ${c.name} — ${c.username}`
        : `${c.name} — ${c.username}`,
      value: c.id,
    }));

    // Preselect: the default for this datasource, else the first enabled
    // one, so the user can hit Open immediately.
    const def = usable.find(c => c.isDefault) ?? usable[0];
    this.selectedConnectionId = def ? def.id : null;
  }

  get canOpen(): boolean {
    return (
      !!this.selectedDatasourceId &&
      !!this.selectedConnectionId &&
      !this.verifying
    );
  }

  createConnection(): void {
    this.router.navigate([QUERY_RUNNER.connectionNew()]);
  }

  /** Back affordance in the form header — return to the Query Runner home. */
  goBack(): void {
    this.router.navigate([QUERY_RUNNER.LAUNCHER]);
  }

  /** Verify the chosen connection, then open the executor tab. */
  open(): void {
    if (!this.canOpen || !this.selectedConnectionId) return;
    this.verifying = true;
    this.cdr.markForCheck();
    const connId = this.selectedConnectionId;
    this.service
      .testConnection(connId)
      .then(res => {
        if (res?.status && res.data?.isConnected) {
          const url = `${QUERY_RUNNER.EXEC}?conn=${encodeURIComponent(connId)}`;
          window.open(url, '_blank');
        } else {
          // Surface the connection error; do NOT open a tab.
          this.globalService.handleSuccessService(res);
        }
      })
      .catch(() => {})
      .finally(() => {
        this.verifying = false;
        this.cdr.markForCheck();
      });
  }
}
