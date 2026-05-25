import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CONNECTION } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-view-connection',
  templateUrl: './view-connection.component.html',
  styleUrls: ['./view-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewConnectionComponent implements OnInit {
  connectionId: string = '';
  orgId: string = '';
  connectionData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  /**
   * dbType of the parent datasource. Used to render the engine
   * badge next to the dbUsername row so viewers can see at a
   * glance which engine the credentials are for. Null until the
   * lookup lands; badge stays hidden until then.
   */
  selectedDbType: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private globalService: GlobalService,
    private connectionService: ConnectionService,
    private datasourceService: DatasourceService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.orgId = this.route.snapshot.params['orgId'];
    this.connectionId = this.route.snapshot.params['id'];
    this.loadConnectionDetails();
  }

  async loadConnectionDetails() {
    await this.connectionService.loadOne(this.connectionId);
    const data = this.connectionService.current();
    if (data) {
      this.connectionData = data;
      // Fetch the parent datasource so the view can show the
      // engine badge. Best-effort: a failure here just hides the
      // badge — the rest of the view is unaffected.
      const datasourceId = data.datasourceId;
      if (datasourceId) {
        this.datasourceService
          .viewDatasource(datasourceId)
          .then((res: any) => {
            if (!this.globalService.handleSuccessService(res, false)) return;
            this.selectedDbType = res?.data?.config?.dbType ?? null;
            this.cdr.markForCheck();
          })
          .catch(() => {
            this.selectedDbType = null;
            this.cdr.markForCheck();
          });
      }
    }
    this.cdr.markForCheck();
  }

  /** Pretty-print map (same as add/edit). */
  private static readonly DB_TYPE_LABELS: Record<string, string> = {
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    mariadb: 'MariaDB',
    mssql: 'Microsoft SQL Server',
    oracle: 'Oracle',
    snowflake: 'Snowflake',
  };

  get selectedDbTypeLabel(): string {
    const t = (this.selectedDbType || '').toLowerCase();
    if (!t) return '';
    return (
      ViewConnectionComponent.DB_TYPE_LABELS[t] ||
      t.charAt(0).toUpperCase() + t.slice(1)
    );
  }

  onEdit() {
    this.router.navigate([CONNECTION.edit(this.orgId, this.connectionId)]);
  }

  goBack() {
    this.router.navigate([CONNECTION.LIST]);
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  trackByIndex(index: number): number {
    return index;
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  async proceedDelete(): Promise<void> {
    if (this.connectionData && this.deleteJustification.trim()) {
      const response = await this.connectionService.delete(
        this.connectionData.id,
        this.deleteJustification.trim(),
      );
      this.showDeleteConfirm = false;
      this.deleteJustification = '';
      if (this.globalService.handleSuccessService(response)) {
        this.router.navigate([CONNECTION.LIST]);
      }
      this.cdr.markForCheck();
    }
  }
}
