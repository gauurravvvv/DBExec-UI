import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectorService } from 'src/app/modules/connector/services/connector.service';
import { DbAccessContextService } from '../../services/db-access-context.service';

/**
 * DatasourcePickerComponent — the shared header dropdown used by the
 * DB-access list screens (Roles / Privileges). It is a server-mode
 * `app-custom-dropdown` (paged fetcher, appendTo="body") backed solely by
 * the shared `DbAccessContextService`, so the selection persists across the
 * sidebar sections for the session.
 *
 * The datasource is NEVER mirrored into the URL — there is no `?ds=` query
 * param on any db-access screen. On init it hydrates from the context's
 * current value (cross-section nav within the app), probes capability once,
 * and emits `changed`. On change it writes the context, probes capability,
 * and emits. Clearing the selection resets the context (which clears all
 * downstream caches for the old datasource). A refresh / external deep link
 * starts with no datasource selected, by design.
 */
@Component({
  selector: 'app-datasource-picker',
  templateUrl: './datasource-picker.component.html',
  styleUrls: ['./datasource-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasourcePickerComponent implements OnInit, OnDestroy {
  @Output() changed = new EventEmitter<string>();

  /** Show the clear (✕) affordance. Lists want it; the Add-Role form doesn't. */
  @Input() allowClear = true;
  /**
   * Pre-select from the shared context on init. Lists hydrate so the
   * selection persists across sections during the session. The Add-Role form
   * sets this false so the user always picks the datasource manually.
   */
  @Input() autoHydrate = true;

  /**
   * When nothing is hydrated from context, auto-select the FIRST datasource
   * once the option list loads, so the list screens populate immediately
   * (no "pick a datasource" dead-end). Lists want this; the Add-Role form
   * sets it false (with autoHydrate=false) so the user always picks manually.
   */
  @Input() autoSelectFirst = true;

  /**
   * Render the "Datasource" text as a floating label (lists) vs. a static
   * field label with a placeholder prompt (the Add-Role form, which wants an
   * explicit "Choose a datasource" cue since nothing is pre-selected).
   */
  @Input() floatingLabel = true;
  /** Placeholder shown when nothing is selected (only meaningful when the
   *  label is not floating). Defaults to the shared "Choose a datasource". */
  @Input() placeholder = 'DB_ACCESS.CHOOSE_DATASOURCE';

  private cdr = inject(ChangeDetectorRef);

  selectedDatasource: string | null = null;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  constructor(
    private datasourceService: ConnectorService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadFirstPage();

    // Add-Role opts out of hydration so the user always picks manually.
    if (!this.autoHydrate) return;

    // Hydrate from the shared context only (cross-section nav within the
    // app). We deliberately do NOT read or write ?ds= — the datasource is
    // never mirrored into the URL. Selection persists in memory for the
    // session via DbAccessContextService.
    const initial = this.ctx.connectorId() || '';
    if (initial) {
      this.selectedDatasource = initial;
      // Push into context (no-op if unchanged) + probe once.
      this.ctx.setDatasource(initial);
      this.ctx.probeCapability(initial);
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

          // Auto-select the first datasource so the list populates on load
          // (no "pick a datasource" dead-end). Only when nothing is already
          // selected/hydrated and the caller opted in. Route through the same
          // change path so context + capability + `changed` all fire.
          if (
            this.autoSelectFirst &&
            !this.selectedDatasource &&
            !this.ctx.connectorId() &&
            items.length
          ) {
            this.selectedDatasource = items[0].id;
            this.onDatasourceChange(items[0].id);
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  onDatasourceChange(id: any): void {
    const next = id || '';
    this.selectedDatasource = next || null;
    this.ctx.setDatasource(next); // clears old caches + capability
    // The selection is persisted in the shared context only — never written
    // to the URL (no ?ds= mirroring on any db-access screen).
    if (next) this.ctx.probeCapability(next);
    this.changed.emit(next);
    this.cdr.markForCheck();
  }
}
