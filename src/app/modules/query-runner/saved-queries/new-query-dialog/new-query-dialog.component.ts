import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  QueryConnection,
  QueryRunnerService,
} from '../../services/query-runner.service';

/**
 * NewQueryDialogComponent — the "New Query" popup shown from the saved
 * queries list. Reuses the (retired) launcher's datasource → connection
 * selection logic: a server-mode datasource dropdown, then the enabled
 * connections for that datasource (default preselected). "Open Executor"
 * verifies the connection, then opens a BLANK executor tab (same as the
 * old launcher's open()). Rendered as a `.confirmation-popup` overlay —
 * NOT a p-dialog — to match the app's dialog pattern.
 */
@Component({
  selector: 'app-new-query-dialog',
  templateUrl: './new-query-dialog.component.html',
  styleUrls: ['./new-query-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewQueryDialogComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  /** Emitted when the popup should close (Cancel, backdrop, or after open). */
  @Output() closed = new EventEmitter<void>();

  selectedDatasourceId: string | null = null;
  selectedConnectionId: string | null = null;

  connectionOptions: { label: string; value: string }[] = [];
  private connectionsById = new Map<string, QueryConnection>();
  connectionsLoading = false;
  verifying = false;

  hasNoConnections = false;
  allDisabledForDs = false;

  private allConnections: QueryConnection[] = [];

  constructor(
    private service: QueryRunnerService,
    private datasourceService: DatasourceService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
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
    // Only ENABLED connections are selectable.
    const usable = forDs.filter(c => c.enabled !== false);
    this.allDisabledForDs = forDs.length > 0 && usable.length === 0;

    for (const c of usable) this.connectionsById.set(c.id, c);
    this.connectionOptions = usable.map(c => ({
      label: c.isDefault ? `★ ${c.name} — ${c.username}` : `${c.name} — ${c.username}`,
      value: c.id,
    }));

    // Preselect the default for this datasource, else the first enabled one.
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

  /** Verify the chosen connection, then open a BLANK executor tab. */
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
          this.close();
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

  close(): void {
    this.closed.emit();
  }
}
