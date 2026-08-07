import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BRANDING_PRESET } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import {
  BrandingPreset,
  BrandingSettingsService,
} from '../../services/branding-settings.service';

/**
 * ListBrandingComponent — the Branding tab in the App Settings hub.
 *
 * Standard list module (same shape/styling as list-user /
 * list-announcements): `<app-custom-table>` + server adapter over
 * `/branding/presets`. Add navigates to a routed page; per-row: Apply
 * (activate), View, Edit, Delete (non-active → popup). No seeded
 * presets — every branding preset is user-created.
 */
@Component({
  selector: 'app-list-branding',
  templateUrl: './list-branding.component.html',
  styleUrls: ['./list-branding.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListBrandingComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  presetToDelete: BrandingPreset | null = null;
  busyPresetId = this.brandingService.busyPresetId;

  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    globalSearchPlaceholder: undefined,
    // On-demand per-column Filter row + CSV/XLS export (parity with theme /
    // list-role). Name filter maps to the BE `search`; export is client-side.
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'branding-list',
    height: 'flex',
    rowIdField: 'id',
  };
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private brandingService: BrandingSettingsService,
    private globalService: GlobalService,
    private router: Router,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.cols = [
      { colId: 'name', field: 'name', header: t('BRANDING.PRESET'), width: '240px', frozen: true, filter: 'text' },
      { colId: 'preview', header: t('BRANDING.PREVIEW'), width: '200px', sortable: false },
      { colId: 'watermark', field: 'showWatermark', header: t('BRANDING.WATERMARK'), width: '150px', sortable: false },
      { colId: 'status', field: 'isActive', header: t('COMMON.STATUS'), width: '140px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '180px', sortable: false },
    ];
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: t('BRANDING.SEARCH_PLACEHOLDER'),
      title: t('BRANDING.LIBRARY'),
    };
    this.bindAdapter();
  }

  ngOnDestroy(): void {
    this.brandingService.cancelReads();
    this.adapter?.destroy();
  }

  private bindAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.brandingService.listPresets({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      unwrap: (res: any) => ({
        rows: res?.data?.presets ?? [],
        total: res?.data?.count ?? 0,
      }),
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  // ── Apply ───────────────────────────────────────────────────
  async apply(p: BrandingPreset): Promise<void> {
    if (this.busyPresetId() || p.isActive) return;
    const res = await this.brandingService.activatePreset(p.id);
    if (this.globalService.handleSuccessService(res)) this.refreshList();
  }

  // ── Nav ─────────────────────────────────────────────────────
  onAdd(): void {
    this.router.navigateByUrl(BRANDING_PRESET.NEW);
  }
  onEdit(p: BrandingPreset): void {
    this.router.navigateByUrl(BRANDING_PRESET.edit(p.id));
  }
  onView(p: BrandingPreset): void {
    this.router.navigateByUrl(BRANDING_PRESET.view(p.id));
  }

  // ── Delete ──────────────────────────────────────────────────
  confirmDelete(p: BrandingPreset): void {
    this.presetToDelete = p;
  }
  cancelDelete(): void {
    this.presetToDelete = null;
  }
  async proceedDelete(): Promise<void> {
    if (!this.presetToDelete) return;
    const res = await this.brandingService.deletePreset(this.presetToDelete.id);
    this.presetToDelete = null;
    if (this.globalService.handleSuccessService(res)) this.refreshList();
    this.cdr.markForCheck();
  }
}
