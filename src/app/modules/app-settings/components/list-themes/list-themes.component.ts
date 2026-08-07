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
import { THEME_PRESET } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import {
  ThemePreset,
  ThemeSettingsService,
} from '../../services/theme-settings.service';

/**
 * ListThemesComponent — the Theme tab in the App Settings hub.
 *
 * A standard list module (same shape + styling as list-user /
 * list-announcements): the shared `<app-custom-table>` driven by a
 * `UsServerListAdapter` on the BE `/theme/presets` list (server paging,
 * infinite scroll, no page controls). Add navigates to a routed page;
 * per-row: Try out (live preview, unsaved), Apply (activate), View,
 * Edit (custom only), Delete (custom + non-active → popup).
 */
@Component({
  selector: 'app-list-themes',
  templateUrl: './list-themes.component.html',
  styleUrls: ['./list-themes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListThemesComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  tryingOutId: string | null = null;
  presetToDelete: ThemePreset | null = null;

  /** The authoritative (applied) theme captured the moment a try-out
   *  begins, so "stop preview" can restore EXACTLY what was active. We
   *  can't read it back from ThemeService during a preview because
   *  previewing overwrites its `theme()` signal. Captured once per
   *  try-out session (not re-captured when switching between previews). */
  private activeThemeSnapshot: unknown = null;

  busyPresetId = this.themeService.busyPresetId;

  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    globalSearchPlaceholder: undefined,
    // On-demand per-column Filter row + CSV/XLS export toolbar (parity with
    // list-role / list-user). The Name column filter maps to the BE `search`
    // param; export dumps the loaded rows client-side.
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'themes-list',
    height: 'flex',
    rowIdField: 'id',
  };
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private themeService: ThemeSettingsService,
    private themeInjector: ThemeService,
    private globalService: GlobalService,
    private router: Router,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.cols = [
      { colId: 'name', field: 'name', header: t('THEME_SETTINGS.THEME'), width: '240px', frozen: true, filter: 'text' },
      { colId: 'preview', header: t('THEME_SETTINGS.PREVIEW'), width: '200px', sortable: false },
      { colId: 'type', field: 'isSeeded', header: t('COMMON.TYPE'), width: '140px', sortable: false },
      { colId: 'status', field: 'isActive', header: t('COMMON.STATUS'), width: '140px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '210px', sortable: false },
    ];
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: t('THEME_SETTINGS.SEARCH_PLACEHOLDER'),
      // Used as the export filename (e.g. Themes.csv).
      title: t('THEME_SETTINGS.LIBRARY'),
    };
    this.bindAdapter();
  }

  ngOnDestroy(): void {
    this.themeService.cancelReads();
    this.adapter?.destroy();
    // Leaving mid-preview: restore the pre-preview (active) theme, not the
    // preview that's currently overwriting theme().
    if (this.tryingOutId) {
      this.themeInjector.applyFromLogin(this.activeThemeSnapshot as any);
    }
  }

  private bindAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.themeService.listPresets({
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

  swatchStrip(p: ThemePreset): string[] {
    const c = p.colors || {};
    return [
      c['primary'],
      c['background'],
      c['cardBackground'],
      c['textColor'],
      c['successColor'],
    ].filter(Boolean);
  }

  // ── Try out / apply ─────────────────────────────────────────
  tryOut(p: ThemePreset): void {
    // Snapshot the currently-applied theme the FIRST time a preview starts,
    // before applyFromLogin overwrites ThemeService's theme() signal. Keep
    // it across preview→preview switches so stopping always restores the
    // real active theme, not a previously-previewed one.
    if (!this.tryingOutId) {
      this.activeThemeSnapshot = this.themeInjector.theme();
    }
    this.tryingOutId = p.id;
    this.themeInjector.applyFromLogin({ colors: p.colors } as any);
    this.cdr.markForCheck();
  }
  stopTryOut(): void {
    this.tryingOutId = null;
    // Restore the theme that was applied before previewing.
    this.themeInjector.applyFromLogin(this.activeThemeSnapshot as any);
    this.activeThemeSnapshot = null;
    this.cdr.markForCheck();
  }
  async apply(p: ThemePreset): Promise<void> {
    if (this.busyPresetId() || p.isActive) return;
    const res = await this.themeService.activatePreset(p.id);
    if (this.globalService.handleSuccessService(res)) {
      // The previewed theme is now the active one — it becomes the new
      // baseline, so drop the pre-preview snapshot.
      this.tryingOutId = null;
      this.activeThemeSnapshot = null;
      this.themeInjector.applyFromLogin({ colors: p.colors } as any);
      this.refreshList();
    }
  }

  // ── Nav ─────────────────────────────────────────────────────
  onAdd(): void {
    this.router.navigateByUrl(THEME_PRESET.NEW);
  }
  onEdit(p: ThemePreset): void {
    this.router.navigateByUrl(THEME_PRESET.edit(p.id));
  }
  onView(p: ThemePreset): void {
    this.router.navigateByUrl(THEME_PRESET.view(p.id));
  }

  // ── Delete ──────────────────────────────────────────────────
  confirmDelete(p: ThemePreset): void {
    this.presetToDelete = p;
  }
  cancelDelete(): void {
    this.presetToDelete = null;
  }
  async proceedDelete(): Promise<void> {
    if (!this.presetToDelete) return;
    const res = await this.themeService.deletePreset(this.presetToDelete.id);
    this.presetToDelete = null;
    if (this.globalService.handleSuccessService(res)) this.refreshList();
    this.cdr.markForCheck();
  }
}
