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
import { ThemeSettingsService } from '../../services/theme-settings.service';
import { SettingsTabForm } from '../../settings-tab-form';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface TokenGroupView {
  group: ThemeTokenGroup;
  tokens: ThemeToken[];
  /** Collapsed state — brand is open by default, the rest collapsed. */
  open: boolean;
}

/**
 * ThemeSettingsComponent — full colour-palette editor.
 *
 * Every configurable colour in the app (the `theme-tokens.ts` registry)
 * gets one swatch + hex control, grouped into collapsible sections. The
 * form is built dynamically from the registry so adding a token needs
 * no change here.
 *
 * Live preview: edits apply to the CURRENT session's `:root` immediately
 * via ThemeService so the admin sees the result as they type. On leaving
 * the page (or reset without save) the authoritative theme is restored.
 * Persisted save still follows the "applies to everyone on next sign-in"
 * contract (the BE returns the row; the visible theme for OTHER users
 * changes on their next session).
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
  isDefault = true;

  /** Which section a per-section reset is currently running for (the
   *  group id), so only that accordion's button shows a spinner. */
  resettingGroup: ThemeTokenGroup | null = null;

  /** The registry, grouped for the template. */
  groups: TokenGroupView[] = [];

  loading = this.themeService.loading;
  saving = this.themeService.saving;
  resetting = this.themeService.resetting;

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

  // SettingsTabForm — lets the hub's single Save button drive this tab.
  get dirty(): boolean {
    return this.isFormDirty;
  }
  get busy(): boolean {
    return this.saving();
  }

  ngOnInit(): void {
    this.loadTheme();
    // Live-preview: any value change (typed hex or swatch pick) applies
    // to THIS tab's :root, debounced so typing stays smooth.
    this.themeForm.valueChanges
      .pipe(debounceTime(120), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.livePreview());
  }

  ngOnDestroy(): void {
    this.themeService.cancelReads();
    // Restore the authoritative session theme — the live preview only
    // ever applied to this admin's current tab.
    this.themeInjector.applyFromLogin(this.themeInjector.theme());
  }

  // ── Form construction (registry-driven) ─────────────────────────
  private buildGroups(): void {
    this.groups = THEME_TOKEN_GROUPS.map((group, i) => ({
      group,
      tokens: THEME_TOKENS.filter(t => t.group === group),
      open: i === 0, // Brand open by default
    }));
  }

  private initForm(): void {
    const controls: Record<string, any> = {};
    for (const token of THEME_TOKENS) {
      // Primary is required; every other colour is optional (blank →
      // fall back to the platform default on the BE merge).
      const validators =
        token.key === 'primary'
          ? [Validators.required, Validators.pattern(HEX_PATTERN)]
          : token.key === 'primaryText'
            ? [] // accepts white/black keyword or hex — validated on save
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

  private async loadTheme(): Promise<void> {
    await this.themeService.load();
    const data = this.themeService.current();
    if (!data) return;
    this.isDefault = data.isDefault ?? true;
    this.patchFromColors(data.colors ?? {}, data);
    this.themeForm.markAsPristine();
    this.cdr.markForCheck();
  }

  /** Seed every control from the colours map, falling back to the
   *  legacy brand fields for their four keys. */
  private patchFromColors(
    colors: Record<string, string>,
    data: { primary?: string; primaryHover?: string; primaryLight?: string; primaryText?: string },
  ): void {
    const patch: Record<string, string> = {};
    for (const token of THEME_TOKENS) {
      patch[token.key] = colors[token.key] ?? '';
    }
    // Legacy fields win for their keys if the map didn't carry them.
    if (data.primary) patch['primary'] = colors['primary'] ?? data.primary;
    if (data.primaryHover)
      patch['primaryHover'] = colors['primaryHover'] ?? data.primaryHover;
    if (data.primaryLight)
      patch['primaryLight'] = colors['primaryLight'] ?? data.primaryLight;
    if (data.primaryText)
      patch['primaryText'] = colors['primaryText'] ?? data.primaryText;
    this.themeForm.patchValue(patch);
  }

  /**
   * Native swatch → form control. The swatch always emits a valid
   * 6-char hex, so we preview IMMEDIATELY (bypassing the typed-hex
   * debounce) — the workspace repaints on every drag frame so the
   * admin sees the colour change under the cursor in real time.
   */
  onColorPicked(controlName: string, value: string): void {
    this.themeForm.get(controlName)?.setValue(value, { emitEvent: false });
    this.themeForm.get(controlName)?.markAsDirty();
    this.livePreview();
  }

  /**
   * Apply the current form values to THIS tab's `:root` so the admin
   * sees a live preview while editing. Only well-formed values are
   * emitted (ThemeService re-validates); the persisted contract for
   * other users is unchanged.
   */
  private livePreview(): void {
    const colors: Record<string, string> = {};
    for (const token of THEME_TOKENS) {
      const v = String(this.themeForm.get(token.key)?.value ?? '').trim();
      if (v) colors[token.key] = v;
    }
    this.themeInjector.applyFromLogin({ colors } as any);
  }

  /** Native picker `value` — normalises to a 6-char hex or grey. */
  swatchValue(controlName: string): string {
    const raw = String(this.themeForm.get(controlName)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }

  /** True iff a control is invalid + touched (for the error border). */
  showFieldError(controlName: string): boolean {
    const c = this.themeForm.get(controlName);
    return !!(c?.invalid && c?.touched);
  }

  // ── Save flow ───────────────────────────────────────────────
  async onSave(): Promise<void> {
    if (this.themeForm.invalid) {
      this.themeForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;

    // Send only the keys the admin actually set (non-blank), as a
    // `colors` partial. The BE merges over existing/default.
    const colors: Record<string, string> = {};
    for (const token of THEME_TOKENS) {
      const v = String(this.themeForm.get(token.key)?.value ?? '').trim();
      if (v) colors[token.key] = v;
    }

    const res = await this.themeService.save({ colors } as any);
    if (this.globalService.handleSuccessService(res)) {
      this.isDefault = false;
      this.themeForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }

  // ── Reset flow (per-section only) ───────────────────────────
  /**
   * Per-section reset — restores just this group's colours to the
   * platform defaults, leaving every other override intact. Runs
   * inline (no confirm popup) since it's scoped and reversible; the
   * header button spins only for the group being reset.
   */
  async resetSection(view: TokenGroupView, event: MouseEvent): Promise<void> {
    event.stopPropagation(); // don't toggle the accordion
    if (this.resetting() || this.resettingGroup) return;
    this.resettingGroup = view.group;
    this.cdr.markForCheck();
    try {
      const res = await this.themeService.reset(view.group);
      if (this.globalService.handleSuccessService(res)) {
        const data = this.themeService.current();
        if (data) {
          this.isDefault = data.isDefault ?? true;
          this.patchFromColors(data.colors ?? {}, data);
          // Keep the section's controls "dirty-free" after a reset so
          // the hub Save button doesn't light up from a reset alone.
          this.themeForm.markAsPristine();
          this.livePreview();
          if (!view.open) view.open = true; // reveal what changed
        }
      }
    } finally {
      this.resettingGroup = null;
      this.cdr.markForCheck();
    }
  }
}
