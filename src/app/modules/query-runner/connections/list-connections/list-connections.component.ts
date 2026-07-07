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
import {
  QueryConnection,
  QueryRunnerService,
} from '../../services/query-runner.service';

/**
 * ListConnectionsComponent — the caller's private Query Runner
 * connection profiles. Same list-user shell (h2 above a flat card,
 * modern p-table, filter row, row actions, paginator refresh). Each row
 * is a datasource + a DB login the user was given; opening one in the
 * launcher runs SQL as that login.
 */
@Component({
  selector: 'app-list-connections',
  templateUrl: './list-connections.component.html',
  styleUrls: ['./list-connections.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListConnectionsComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  private all: QueryConnection[] = [];
  connections: QueryConnection[] = [];
  filterName = '';

  testingId: string | null = null;

  // Delete confirm
  showDeleteConfirm = false;
  toDelete: QueryConnection | null = null;
  deleting = false;

  constructor(
    private service: QueryRunnerService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.service
      .listConnections()
      .then(res => {
        this.all = res?.status ? (res.data?.connections ?? []) : [];
        this.applyFilter();
      })
      .catch(() => {
        this.all = [];
        this.applyFilter();
      })
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  onFilterChange(): void {
    this.applyFilter();
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.filterName = '';
    this.applyFilter();
    this.cdr.markForCheck();
  }

  get isFilterActive(): boolean {
    return !!this.filterName.trim();
  }

  private applyFilter(): void {
    const q = this.filterName.trim().toLowerCase();
    this.connections = q
      ? this.all.filter(
          c =>
            c.name.toLowerCase().includes(q) ||
            (c.datasourceName ?? '').toLowerCase().includes(q) ||
            c.username.toLowerCase().includes(q),
        )
      : [...this.all];
  }

  onAdd(): void {
    this.router.navigate([QUERY_RUNNER.connectionNew()]);
  }

  onEdit(c: QueryConnection): void {
    this.router.navigate([QUERY_RUNNER.connectionEdit(c.id)]);
  }

  /** Verify the stored credentials against the datasource host. */
  onTest(c: QueryConnection): void {
    if (this.testingId) return;
    this.testingId = c.id;
    this.cdr.markForCheck();
    this.service
      .testConnection(c.id)
      .then(res => {
        // Reflect the new health on the row without a full reload.
        c.lastTestStatus = res?.data?.isConnected ? 'success' : 'failure';
        c.lastTestedAt = res?.data?.lastTestedAt ?? new Date().toISOString();
        this.globalService.handleSuccessService(res);
      })
      .catch(() => {})
      .finally(() => {
        this.testingId = null;
        this.cdr.markForCheck();
      });
  }

  /** Open this connection in the standalone executor browser tab. */
  onOpen(c: QueryConnection): void {
    if (c.enabled === false) return; // guarded in template too
    const url = `${QUERY_RUNNER.EXEC}?conn=${encodeURIComponent(c.id)}`;
    window.open(url, '_blank');
  }

  busyId: string | null = null;

  /** Star this connection as the default for its datasource. */
  onSetDefault(c: QueryConnection): void {
    if (this.busyId || c.isDefault || c.enabled === false) return;
    this.busyId = c.id;
    this.cdr.markForCheck();
    this.service
      .setDefault(c.id)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          // One default per datasource: clear siblings on the same ds.
          this.all.forEach(x => {
            if (x.datasourceId === c.datasourceId) x.isDefault = x.id === c.id;
          });
          this.applyFilter();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.busyId = null;
        this.cdr.markForCheck();
      });
  }

  /** Enable / disable a connection. */
  onToggleEnabled(c: QueryConnection): void {
    if (this.busyId) return;
    const next = !(c.enabled !== false);
    this.busyId = c.id;
    this.cdr.markForCheck();
    this.service
      .setEnabled(c.id, next)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          c.enabled = res.data?.enabled ?? next;
          c.isDefault = res.data?.isDefault ?? c.isDefault;
          // A sibling may have inherited the default on disable.
          const promoted = res.data?.promotedDefaultId;
          if (promoted) {
            this.all.forEach(x => {
              if (x.datasourceId === c.datasourceId) {
                x.isDefault = x.id === promoted;
              }
            });
          }
          this.applyFilter();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.busyId = null;
        this.cdr.markForCheck();
      });
  }

  confirmDelete(c: QueryConnection): void {
    this.toDelete = c;
    this.showDeleteConfirm = true;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDelete = null;
    this.cdr.markForCheck();
  }

  proceedDelete(): void {
    if (!this.toDelete) return;
    this.deleting = true;
    this.cdr.markForCheck();
    const id = this.toDelete.id;
    this.service
      .deleteConnection(id)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.all = this.all.filter(c => c.id !== id);
          this.applyFilter();
          this.cancelDelete();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }
}
