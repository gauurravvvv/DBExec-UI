import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DbAccessContextService } from '../../services/db-access-context.service';

/**
 * DatasourcePickerComponent — the shared header dropdown used by all three
 * DB-access list screens (Users / Roles / Privileges). It is a server-mode
 * `app-custom-dropdown` (paged fetcher, appendTo="body") backed by the
 * shared `DbAccessContextService` + the `?ds=<id>` query param, so the
 * selection persists across the three sidebar sections and deep-links.
 *
 * On init it hydrates from `?ds=` (or the context's current value), probes
 * capability once, and emits `changed`. On change it writes the context,
 * updates `?ds=` (replaceUrl — clean history), probes capability, and emits.
 * Clearing the selection drops `?ds=` and resets context (which clears all
 * downstream caches for the old datasource).
 */
@Component({
  selector: 'app-datasource-picker',
  templateUrl: './datasource-picker.component.html',
  styleUrls: ['./datasource-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasourcePickerComponent implements OnInit, OnDestroy {
  @Output() changed = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);

  selectedDatasource: string | null = null;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  constructor(
    private datasourceService: DatasourceService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadFirstPage();

    // Hydrate from ?ds= (deep link) or the shared context (cross-section nav).
    const fromQuery = this.route.snapshot.queryParamMap.get('ds') ?? '';
    const initial = fromQuery || this.ctx.datasourceId() || '';
    if (initial) {
      this.selectedDatasource = initial;
      // Push into context (no-op if unchanged) + probe once.
      this.ctx.setDatasource(initial);
      this.ctx.probeCapability(initial);
      // Ensure ?ds= reflects the hydrated id when it came from context.
      if (!fromQuery) this.syncQueryParam(initial);
      // Emit after the microtask so parent @ViewChild refs are ready.
      queueMicrotask(() => this.changed.emit(initial));
    }
  }

  ngOnDestroy(): void {
    this.datasourceService.cancelReads?.();
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

  private loadFirstPage(): void {
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

  onDatasourceChange(id: any): void {
    const next = id || '';
    this.selectedDatasource = next || null;
    this.ctx.setDatasource(next); // clears old caches + capability
    this.syncQueryParam(next);
    if (next) this.ctx.probeCapability(next);
    this.changed.emit(next);
    this.cdr.markForCheck();
  }

  private syncQueryParam(id: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ds: id || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
