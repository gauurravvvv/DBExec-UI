import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbAccessWorkspaceComponent — the LISTING landing for the module. A
 * server-mode datasource dropdown sits in the toolbar (mirroring
 * list-tab / list-dataset); picking a datasource loads its data inline
 * and reflects the selection in the URL (/:datasourceId) so add / edit /
 * view screens can deep-link back. Below the toolbar, the feature tabs
 * (Users / Roles / Privileges / Effective / Mappings / Audit) each render
 * a listing. `canManage` flows down so read-only mode disables mutations.
 */
@Component({
  selector: 'app-db-access-workspace',
  templateUrl: './db-access-workspace.component.html',
  styleUrls: ['./db-access-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbAccessWorkspaceComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  selectedDatasource: any = null;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  capability: any = null;
  loadingCapability = false;
  unsupported = false; // non-postgres → 400 on capability
  activeIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasourceService: DatasourceService,
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadDatasources();
    // The datasource id is optional — the '' route lands here with none,
    // and /:datasourceId lands here with one already chosen (deep link or
    // back-nav from an add / edit / view screen).
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    if (this.datasourceId) {
      this.selectedDatasource = this.datasourceId;
      this.probeCapability(this.datasourceId);
    }
  }

  ngOnDestroy(): void {
    this.datasourceService.cancelReads();
    this.dbAccess.cancelReads();
    this.dbAccess.reset();
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
    this.activeIndex = 0;
    this.dbAccess.reset();

    if (!datasourceId) {
      this.datasourceId = '';
      // Drop the id from the URL — stay on the bare listing landing.
      this.router.navigate(['/app/db-access']);
      this.cdr.markForCheck();
      return;
    }

    this.datasourceId = datasourceId;
    // Reflect the selection in the URL so add / edit / view can deep-link
    // back to this datasource. replaceUrl keeps the history clean.
    this.router.navigate(['/app/db-access', datasourceId], {
      replaceUrl: true,
    });
    this.probeCapability(datasourceId);
  }

  private probeCapability(datasourceId: string): void {
    this.loadingCapability = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadCapability(datasourceId)
      .then(res => {
        this.capability = res?.status ? res.data : null;
      })
      .catch(err => {
        // Non-postgres datasources 400 here.
        if (err?.status === 400 || err?.error?.code === 400)
          this.unsupported = true;
        this.capability = null;
      })
      .finally(() => {
        this.loadingCapability = false;
        this.cdr.markForCheck();
      });
  }

  get canManage(): boolean {
    return !!this.capability?.canManage;
  }
}
