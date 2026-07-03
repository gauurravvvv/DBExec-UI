import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbAccessHomeComponent — the module landing. A server-mode datasource
 * picker (identical to list-tab's) plus a capability banner. Selecting a
 * datasource probes its capability; a PostgreSQL datasource routes into
 * the workspace, a non-PG one (capability 400s) shows the "PostgreSQL
 * only in v1" notice instead of navigating (FR-1.2 / 3.6).
 */
@Component({
  selector: 'app-db-access-home',
  templateUrl: './db-access-home.component.html',
  styleUrls: ['./db-access-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbAccessHomeComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  selectedDatasource: any = null;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  probing = false;
  capability: any = null;
  unsupported = false; // non-postgres → 400 on capability

  constructor(
    private datasourceService: DatasourceService,
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadDatasources();
  }

  ngOnDestroy(): void {
    this.datasourceService.cancelReads();
    this.dbAccess.cancelReads();
  }

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
      if (this.globalService.handleSuccessService(res, false)) {
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

  private loadDatasources(): void {
    this.datasourceService
      .listDatasource({ page: 1, limit: 10 })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          const items = res?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal = res?.data?.count ?? items.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  onDatasourceChange(datasourceId: any): void {
    this.selectedDatasource = datasourceId;
    this.capability = null;
    this.unsupported = false;
    if (!datasourceId) {
      this.cdr.markForCheck();
      return;
    }
    this.probeCapability(datasourceId);
  }

  private probeCapability(datasourceId: string): void {
    this.probing = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadCapability(datasourceId)
      .then(res => {
        if (res?.status) {
          this.capability = res.data;
        } else {
          this.capability = null;
        }
      })
      .catch(err => {
        // Non-postgres datasources 400 here.
        if (err?.status === 400 || err?.error?.code === 400) {
          this.unsupported = true;
        }
        this.capability = null;
      })
      .finally(() => {
        this.probing = false;
        this.cdr.markForCheck();
      });
  }

  get canManage(): boolean {
    return !!this.capability?.canManage;
  }

  openWorkspace(): void {
    if (!this.selectedDatasource || this.unsupported) return;
    this.router.navigate(['/app/db-access', this.selectedDatasource]);
  }
}
