import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import {
  THEME_TOKENS,
  THEME_TOKEN_GROUPS,
  ThemeToken,
  ThemeTokenGroup,
} from 'src/app/shared/theme/theme-tokens';
import {
  ThemePreset,
  ThemeSettingsService,
} from '../../services/theme-settings.service';
import { SettingsTabForm } from '../../settings-tab-form';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface TokenGroupView {
  group: ThemeTokenGroup;
  tokens: ThemeToken[];
  open: boolean;
}

/**
 * ThemeSettingsComponent — theme LIBRARY picker + colour editor.
 *
 * Top: a gallery of the org's presets (seeded + custom). Each card can
 * be Tried out (live preview only, revertible), Applied (persisted
 * active), Viewed, and — for custom presets — Edited/Deleted. Below the
 * gallery, the 44-control editor edits the ACTIVE preset (Save) or can
 * "Save as new preset".
 *
 * Live preview: editor changes + try-out apply to THIS tab's :root via
 * ThemeService immediately; the authoritative theme is restored on
 * destroy or on "stop trying out". Persisted activation/save is what
 * other users get on next sign-in.
 */
@Component({
  selector: 'app-theme-settings',
  templateUrl: './theme-settings.component.html',
  styleUrls: ['./theme-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSettingsComponent
  implements OnInit, OnDestroy, HasUnsavedChanges, SettingsTabForm
{
  themeForm!: FormGroup;

  /** The registry, grouped for the editor accordion. */
  groups: TokenGroupView[] = [];

  /** Preset currently being "tried out" (live-previewed, not saved). */
  tryingOutId: string | null = null;
  /** Whether the editor panel is expanded (collapsed by default; the
   *  gallery is the primary surface). */
  editorOpen = false;

  // Save-as-new preset dialog
  showSaveAsDialog = false;
  newPresetName = '';
  savingNew = false;

  // Delete confirm
  presetToDelete: ThemePreset | null = null;

  loading = this.themeService.loading;
  saving = this.themeService.saving;
  presets = this.themeService.presets;
  busyPresetId = this.themeService.busyPresetId;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private themeService: ThemeSettingsService,
    private globalService: GlobalService,
    private themeInjector: ThemeService,
    private cdr: ChangeDetectorRef,
  ) {
    this.buildGroups();
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.themeForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }
  // SettingsTabForm — the hub Save drives the editor save (active preset).
  get dirty(): boolean {
    return this.isFormDirty;
  }
  get busy(): boolean {
    return this.saving();
  }

  ngOnInit(): void {
    this.loadAll();
    this.themeForm.valueChanges
      .pipe(debounceTime(120), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.livePreview());
  }

  ngOnDestroy(): void {
    this.themeService.cancelReads();
    // Restore the authoritative session theme — try-out / editor preview
    // only ever painted this admin's current tab.
    this.themeInjector.applyFromLogin(this.themeInjector.theme());
  }

  // ── Load ────────────────────────────────────────────────────
  private async loadAll(): Promise<void> {
    await Promise.all([this.themeService.load(), this.themeService.loadPresets()]);
    const data = this.themeService.current();
    if (data) this.patchFromColors(data.colors ?? {}, data);
    this.themeForm.markAsPristine();
    this.cdr.markForCheck();
  }

  get activePreset(): ThemePreset | undefined {
    return this.presets().find(p => p.isActive);
  }

  // ── Gallery actions ─────────────────────────────────────────
  /** Live-preview a preset WITHOUT persisting. Revertible. */
  tryOut(preset: ThemePreset, event: MouseEvent): void {
    event.stopPropagation();
    this.tryingOutId = preset.id;
    this.themeInjector.applyFromLogin({ colors: preset.colors } as any);
    this.cdr.markForCheck();
  }

  /** Stop trying out — restore the authoritative (active) theme. */
  stopTryOut(): void {
    this.tryingOutId = null;
    this.themeInjector.applyFromLogin(this.themeInjector.theme());
    this.cdr.markForCheck();
  }

  /** Persist a preset as the org's active theme (quick-switch). */
  async apply(preset: ThemePreset, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.busyPresetId()) return;
    const res = await this.themeService.activatePreset(preset.id);
    if (this.globalService.handleSuccessService(res)) {
      this.tryingOutId = null;
      // Reload the active colours into the editor + repaint authoritatively.
      await this.themeService.load();
      const data = this.themeService.current();
      if (data) {
        this.patchFromColors(data.colors ?? {}, data);
        this.themeForm.markAsPristine();
        this.themeInjector.applyFromLogin({ colors: data.colors } as any);
      }
      this.cdr.markForCheck();
    }
  }

  /** Load a preset's colours into the editor for viewing/editing. */
  openInEditor(preset: ThemePreset): void {
    this.patchFromColors(preset.colors, preset as any);
    this.themeForm.markAsPristine();
    this.editorOpen = true;
    this.livePreview();
    this.cdr.markForCheck();
  }

  confirmDeletePreset(preset: ThemePreset, event: MouseEvent): void {
    event.stopPropagation();
    this.presetToDelete = preset;
  }
  cancelDeletePreset(): void {
    this.presetToDelete = null;
  }
  async proceedDeletePreset(): Promise<void> {
    if (!this.presetToDelete) return;
    const res = await this.themeService.deletePreset(this.presetToDelete.id);
    this.presetToDelete = null;
    this.globalService.handleSuccessService(res);
    this.cdr.markForCheck();
  }

  /** A few representative swatches for a preset card's strip. */
  swatchStrip(preset: ThemePreset): string[] {
    const c = preset.colors || {};
    return [
      c['primary'],
      c['background'],
      c['cardBackground'],
      c['textColor'],
      c['successColor'],
    ].filter(Boolean);
  }

  trackPreset(_i: number, p: ThemePreset): string {
    return p.id;
  }

  // ── Editor (active preset) ──────────────────────────────────
  private buildGroups(): void {
    this.groups = THEME_TOKEN_GROUPS.map((group, i) => ({
      group,
      tokens: THEME_TOKENS.filter(t => t.group === group),
      open: i === 0,
    }));
  }

  private initForm(): void {
    const controls: Record<string, any> = {};
    for (const token of THEME_TOKENS) {
      const validators =
        token.key === 'primary'
          ? [Validators.required, Validators.pattern(HEX_PATTERN)]
          : token.key === 'primaryText'
            ? []
            : [Validators.pattern(HEX_PATTERN)];
      controls[token.key] = ['', validators];
    }
    this.themeForm = this.fb.group(controls);
  }

  toggleGroup(view: TokenGroupView): void {
    view.open = !view.open;
  }
  trackByGroup(_i: number, g: TokenGroupView): string {
    return g.group;
  }
  toggleEditor(): void {
    this.editorOpen = !this.editorOpen;
  }

  private patchFromColors(
    colors: Record<string, string>,
    data: {
      primary?: string;
      primaryHover?: string;
      primaryLight?: string;
      primaryText?: string;
    },
  ): void {
    const patch: Record<string, string> = {};
    for (const token of THEME_TOKENS) patch[token.key] = colors[token.key] ?? '';
    if (data.primary) patch['primary'] = colors['primary'] ?? data.primary;
    if (data.primaryHover)
      patch['primaryHover'] = colors['primaryHover'] ?? data.primaryHover;
    if (data.primaryLight)
      patch['primaryLight'] = colors['primaryLight'] ?? data.primaryLight;
    if (data.primaryText)
      patch['primaryText'] = colors['primaryText'] ?? data.primaryText;
    this.themeForm.patchValue(patch);
  }

  onColorPicked(controlName: string, value: string): void {
    this.themeForm.get(controlName)?.setValue(value, { emitEvent: false });
    this.themeForm.get(controlName)?.markAsDirty();
    this.livePreview();
  }

  private editorColors(): Record<string, string> {
    const colors: Record<string, string> = {};
    for (const token of THEME_TOKENS) {
      const v = String(this.themeForm.get(token.key)?.value ?? '').trim();
      if (v) colors[token.key] = v;
    }
    return colors;
  }

  private livePreview(): void {
    this.themeInjector.applyFromLogin({ colors: this.editorColors() } as any);
  }

  swatchValue(controlName: string): string {
    const raw = String(this.themeForm.get(controlName)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }

  showFieldError(controlName: string): boolean {
    const c = this.themeForm.get(controlName);
    return !!(c?.invalid && c?.touched);
  }

  /** Whether the active preset is seeded (view-only → editor Save hidden). */
  get activeIsSeeded(): boolean {
    return !!this.activePreset?.isSeeded;
  }

  // Save the editor colours into the ACTIVE preset (hub Save calls this).
  async onSave(): Promise<void> {
    if (this.activeIsSeeded) {
      // Seeded active preset is view-only — steer to Save as new.
      this.openSaveAsDialog();
      return;
    }
    if (this.themeForm.invalid) {
      this.themeForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    const res = await this.themeService.save({ colors: this.editorColors() } as any);
    if (this.globalService.handleSuccessService(res)) {
      this.themeForm.markAsPristine();
      await this.themeService.loadPresets();
      // repaint authoritatively from the saved active preset
      this.themeInjector.applyFromLogin({ colors: this.editorColors() } as any);
      this.cdr.markForCheck();
    }
  }

  // ── Save as new preset ──────────────────────────────────────
  openSaveAsDialog(): void {
    this.newPresetName = '';
    this.showSaveAsDialog = true;
  }
  cancelSaveAs(): void {
    this.showSaveAsDialog = false;
  }
  async proceedSaveAs(): Promise<void> {
    const name = this.newPresetName.trim();
    if (!name || this.savingNew) return;
    this.savingNew = true;
    try {
      const res = await this.themeService.createPreset({
        name,
        colors: this.editorColors(),
      });
      if (this.globalService.handleSuccessService(res)) {
        this.showSaveAsDialog = false;
        await this.themeService.loadPresets();
        this.cdr.markForCheck();
      }
    } finally {
      this.savingNew = false;
      this.cdr.markForCheck();
    }
  }
}
