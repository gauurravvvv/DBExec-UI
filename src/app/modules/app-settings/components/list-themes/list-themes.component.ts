import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
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
  ThemePreset,
  ThemeSettingsService,
} from '../../services/theme-settings.service';

/**
 * ListThemesComponent — the Theme tab body in the App Settings hub.
 *
 * A standard listing (same idiom as announcements): a table of the org's
 * theme presets + an Add button, per-row actions, and a delete popup.
 * Add/Edit navigate to routed pages (/app/settings/themes/new,
 * /:id/edit); this component only lists + acts.
 *
 * Extra theme-specific row actions: "Try out" (live preview, unsaved,
 * revertible) and "Apply" (persist as the org's active theme). Built-in
 * (seeded) presets are view-only — no edit/delete. The active preset
 * can't be deleted.
 */
@Component({
  selector: 'app-list-themes',
  templateUrl: './list-themes.component.html',
  styleUrls: ['./list-themes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListThemesComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);

  presets = this.themeService.presets;
  loading = this.themeService.loading;
  busyPresetId = this.themeService.busyPresetId;

  tryingOutId: string | null = null;
  presetToDelete: ThemePreset | null = null;

  constructor(
    private themeService: ThemeSettingsService,
    private themeInjector: ThemeService,
    private globalService: GlobalService,
    private router: Router,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.themeService.cancelReads();
    // Undo any live "try out" preview so leaving the tab restores the
    // authoritative theme.
    if (this.tryingOutId) {
      this.themeInjector.applyFromLogin(this.themeInjector.theme());
    }
  }

  private async reload(): Promise<void> {
    // `load` (active theme) + `loadPresets` (library). load also drives
    // the loading() flag the template gates on.
    await Promise.all([this.themeService.load(), this.themeService.loadPresets()]);
    this.cdr.markForCheck();
  }

  trackPreset(_i: number, p: ThemePreset): string {
    return p.id;
  }

  /** Representative swatches for the row preview strip. */
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
    this.tryingOutId = p.id;
    this.themeInjector.applyFromLogin({ colors: p.colors } as any);
    this.cdr.markForCheck();
  }
  stopTryOut(): void {
    this.tryingOutId = null;
    this.themeInjector.applyFromLogin(this.themeInjector.theme());
    this.cdr.markForCheck();
  }

  async apply(p: ThemePreset): Promise<void> {
    if (this.busyPresetId() || p.isActive) return;
    const res = await this.themeService.activatePreset(p.id);
    if (this.globalService.handleSuccessService(res)) {
      this.tryingOutId = null;
      // Repaint authoritatively from the now-active preset.
      this.themeInjector.applyFromLogin({ colors: p.colors } as any);
      this.cdr.markForCheck();
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
    this.globalService.handleSuccessService(res);
    this.cdr.markForCheck();
  }
}
